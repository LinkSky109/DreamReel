import { getVideoProvider, getVideoProviderForProject } from '../providers/videoProviderFactory.js'
import { SHOT_STATUS } from '../models/shot.js'
import config from '../config/index.js'
import { styleService } from './styleService.js'
import logger from '../utils/logger.js'
import { buildCharacterActionPrompt } from '../config/characterExpressions.js'
import { getDirector, buildDirectorPrompt } from '../config/directorProfiles.js'
import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const STORAGE_DIR = path.join(__dirname, '..', '..', 'storage')

/**
 * 视频生成 Service
 * 集成角色一致性：生成时注入角色参考图，生成后做一致性评分
 */
export class VideoService {
  constructor() {
    this.provider = getVideoProvider()
    this.activeTasks = new Map() // taskId -> { projectId, shotId, resolve, reject, startTime, prompt, status }
    this.taskHistory = [] // 已完成/失败的任务记录
  }

  /**
   * 生成单个镜头视频
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} params.shotId
   * @param {string} params.prompt - 画面描述
   * @param {string[]} params.referenceImages - 角色/场景参考图
   * @param {number} params.duration - 时长
   * @param {string} params.resolution - 分辨率
   * @param {string} params.aspectRatio - 宽高比
   * @param {Object} params.project - 项目对象（用于查找角色信息）
   */
  async generateShot(params) {
    const { projectId, shotId, prompt, referenceImages = [], duration = 5, resolution = '720p', aspectRatio = '16:9', project, prevFramePath = null } = params

    try {
      // Phase 1: 按 projectId 获取对应 Provider 实例
      const provider = getVideoProviderForProject(projectId, project?.userId)

      // 找到当前 shot，获取角色表情动作配置
      const currentShot = project?.shots?.find((s) => s.id === shotId)
      // 构建增强 prompt：注入角色描述和表情动作
      let enhancedPrompt = this.enhancePromptWithCharacters(prompt, project, referenceImages)
      if (currentShot?.characterActions && Object.keys(currentShot.characterActions).length > 0) {
        enhancedPrompt = this._enhanceWithCharacterActions(enhancedPrompt, currentShot, project)
      }

      // R26：注入当前镜头关联角色的造型片段（服装/妆容/整体造型）
      enhancedPrompt = this._enhanceWithStyling(enhancedPrompt, currentShot, project)

      // R29：注入导演模式指令片段（运镜/节奏/表演/色调/配乐情绪建议）
      enhancedPrompt = this._enhanceWithDirector(enhancedPrompt, currentShot, project)

      // R08：注入全局视觉风格锁定（色温/饱和度/对比度）
      if (project?.visualStyle?.locked) {
        enhancedPrompt = this._enhanceWithVisualStyle(enhancedPrompt, project.visualStyle)
      }

      // R08：上一镜头尾帧作为参考图（img2img），保证镜头衔接
      const allRefImages = [...referenceImages]
      if (prevFramePath) {
        allRefImages.unshift(prevFramePath)
        logger.info(`Shot ${shotId} using previous frame as continuity reference`)
      }

      // 检查 provider 是否支持参考图
      const supportsRef = provider.supportsReferenceImages()
      const finalRefImages = supportsRef ? allRefImages : []

      if (!supportsRef && allRefImages.length > 0) {
        logger.warn(`Provider ${provider.name} does not support reference images, using text description only`)
      }

      logger.info(`Generating video for shot ${shotId}, duration=${duration}s`)

      const { taskId } = await provider.generateVideo({
        prompt: enhancedPrompt,
        referenceImages: finalRefImages,
        duration,
        resolution,
        aspectRatio,
      })

      // 异步等待完成
      return new Promise((resolve, reject) => {
        this.activeTasks.set(taskId, {
          projectId,
          shotId,
          resolve,
          reject,
          startTime: Date.now(),
          prompt: enhancedPrompt,
          status: 'generating',
          duration,
          resolution,
          provider, // Phase 1: 保存当前使用的 provider，避免切换后影响已启动任务
        })
        this.pollTaskStatus(taskId)
      })
    } catch (error) {
      logger.error(`Video generation failed for shot ${shotId}:`, error.message)
      throw error
    }
  }

  /**
   * 轮询任务状态
   */
  async pollTaskStatus(taskId, maxAttempts = 120, intervalMs = 1000) {
    const taskInfo = this.activeTasks.get(taskId)
    if (!taskInfo) return

    // Phase 1: 使用任务启动时的 provider，避免切换后影响已启动任务
    const provider = taskInfo.provider || this.provider

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const status = await provider.getTaskStatus(taskId)

        if (status.status === 'completed' || status.status === 'succeeded') {
          // 生成完成，计算一致性评分
          const consistencyScore = await this.calculateConsistencyScore(taskInfo.shotId, status.videoUrl)
          taskInfo.resolve({
            videoUrl: status.videoUrl,
            status: SHOT_STATUS.COMPLETED,
            consistencyScore,
          })
          this._recordTaskHistory(taskId, taskInfo, 'completed', status.videoUrl)
          this.activeTasks.delete(taskId)
          return
        }

        if (status.status === 'failed' || status.status === 'cancelled') {
          const errorMsg = status.error || 'Video generation failed'
          taskInfo.reject(new Error(errorMsg))
          this._recordTaskHistory(taskId, taskInfo, status.status === 'cancelled' ? 'cancelled' : 'failed', null, errorMsg)
          this.activeTasks.delete(taskId)
          return
        }

        // 继续等待
        await new Promise((resolve) => setTimeout(resolve, intervalMs))
      } catch (error) {
        logger.error(`Poll task ${taskId} failed:`, error.message)
        taskInfo.reject(error)
        this.activeTasks.delete(taskId)
        return
      }
    }

    // 超时
    taskInfo.reject(new Error('Video generation timed out'))
    this._recordTaskHistory(taskId, taskInfo, 'failed', null, 'Video generation timed out')
    this.activeTasks.delete(taskId)
  }

  /**
   * 记录任务历史
   */
  _recordTaskHistory(taskId, taskInfo, status, videoUrl = null, error = null) {
    try {
      const record = {
        taskId,
        projectId: taskInfo.projectId,
        shotId: taskInfo.shotId,
        prompt: taskInfo.prompt,
        status,
        videoUrl,
        error,
        startTime: taskInfo.startTime,
        endTime: Date.now(),
        durationMs: Date.now() - taskInfo.startTime,
        duration: taskInfo.duration,
        resolution: taskInfo.resolution,
      }
      this.taskHistory.push(record)
      // 限制历史记录数
      if (this.taskHistory.length > 200) {
        this.taskHistory = this.taskHistory.slice(-200)
      }
    } catch (e) {
      logger.warn('Failed to record task history:', e.message)
    }
  }

  /**
   * 获取所有活跃任务
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.entries()).map(([taskId, task]) => ({
      taskId,
      projectId: task.projectId,
      shotId: task.shotId,
      prompt: task.prompt,
      status: task.status,
      startTime: task.startTime,
      elapsedMs: Date.now() - task.startTime,
      duration: task.duration,
      resolution: task.resolution,
    }))
  }

  /**
   * 获取项目的活跃任务
   */
  getProjectActiveTasks(projectId) {
    return this.getActiveTasks().filter((t) => t.projectId === projectId)
  }

  /**
   * 取消单个任务
   */
  async cancelTask(taskId) {
    const taskInfo = this.activeTasks.get(taskId)
    if (!taskInfo) {
      throw new Error(`Task not found: ${taskId}`)
    }

    // Phase 1: 使用任务启动时的 provider
    const provider = taskInfo.provider || this.provider

    try {
      // 尝试调用 provider 的取消方法
      if (typeof provider.cancelTask === 'function') {
        await provider.cancelTask(taskId)
      }
    } catch (e) {
      logger.warn(`Provider cancelTask failed: ${e.message}`)
    }

    // 拒绝 promise 并移除任务
    taskInfo.reject(new Error('Task cancelled by user'))
    this._recordTaskHistory(taskId, taskInfo, 'cancelled', null, 'Task cancelled by user')
    this.activeTasks.delete(taskId)

    logger.info(`Task cancelled: ${taskId}`)
    return { success: true, taskId }
  }

  /**
   * 取消项目的所有任务
   */
  async cancelProjectTasks(projectId) {
    const tasks = this.getProjectActiveTasks(projectId)
    const results = []
    for (const task of tasks) {
      try {
        await this.cancelTask(task.taskId)
        results.push({ taskId: task.taskId, success: true })
      } catch (e) {
        results.push({ taskId: task.taskId, success: false, error: e.message })
      }
    }
    return {
      total: tasks.length,
      cancelled: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      results,
    }
  }

  /**
   * 获取队列统计
   */
  getQueueStats() {
    const active = this.getActiveTasks()
    const completed = this.taskHistory.filter((t) => t.status === 'completed').length
    const failed = this.taskHistory.filter((t) => t.status === 'failed').length
    const cancelled = this.taskHistory.filter((t) => t.status === 'cancelled').length

    return {
      active: active.length,
      completed,
      failed,
      cancelled,
      total: active.length + this.taskHistory.length,
      activeTasks: active,
    }
  }

  /**
   * 获取任务历史
   */
  getTaskHistory({ projectId, shotId, status, limit = 50 } = {}) {
    let history = [...this.taskHistory]
    if (projectId) history = history.filter((t) => t.projectId === projectId)
    if (shotId) history = history.filter((t) => t.shotId === shotId)
    if (status) history = history.filter((t) => t.status === status)
    history.sort((a, b) => b.endTime - a.endTime)
    return history.slice(0, limit)
  }

  /**
   * 用角色信息增强 prompt
   */
  enhancePromptWithCharacters(prompt, project, referenceImages) {
    if (!project || !project.characters || project.characters.length === 0) {
      return prompt
    }

    const characterDescriptions = project.characters
      .filter((c) => c.isLocked)
      .map((c) => `${c.name}: ${c.description}`)
      .join('; ')

    if (characterDescriptions) {
      return `${prompt}. 角色设定：${characterDescriptions}. 保持角色外貌一致。`
    }
    return prompt
  }

  /**
   * 注入角色表情动作描述到 prompt
   */
  _enhanceWithCharacterActions(prompt, shot, project) {
    const actionPrompts = []
    for (const [characterId, actionConfig] of Object.entries(shot.characterActions || {})) {
      const character = project.characters?.find((c) => c.id === characterId)
      const name = character?.name || 'character'
      const actionPrompt = buildCharacterActionPrompt(name, actionConfig)
      if (actionPrompt) actionPrompts.push(actionPrompt)
    }
    if (actionPrompts.length > 0) {
      return `${prompt}. ${actionPrompts.join('. ')}.`
    }
    return prompt
  }

  /**
   * R26：注入当前镜头关联角色的造型提示词片段
   * 收集 currentShot.characterIds 关联角色的 wardrobe/makeup/styling，
   * 拼接到最终发给视频 provider 的 prompt；无造型信息时保持原 prompt。
   * 兼容 Character 实例（buildStylingPrompt）与普通 JSON 对象。
   */
  _enhanceWithStyling(prompt, shot, project) {
    if (!shot || !Array.isArray(shot.characterIds) || shot.characterIds.length === 0) {
      return prompt
    }
    const fragments = []
    for (const charId of shot.characterIds) {
      const character = project?.characters?.find((c) => c.id === charId)
      if (!character) continue
      let fragment = ''
      if (typeof character.buildStylingPrompt === 'function') {
        fragment = character.buildStylingPrompt()
      } else {
        // 防御性兼容：普通 JSON 对象（无 buildStylingPrompt 方法）
        const parts = []
        if (character.styling) parts.push(`造型风格:${character.styling}`)
        if (character.wardrobe) parts.push(`服装:${character.wardrobe}`)
        if (character.makeup) parts.push(`妆容:${character.makeup}`)
        fragment = parts.join('，')
      }
      if (fragment) {
        fragments.push(`${character.name || '角色'}：${fragment}`)
      }
    }
    if (fragments.length === 0) {
      return prompt
    }
    return `${prompt}. 角色造型：${fragments.join('；')}.`
  }

  /**
   * R29：注入导演模式指令片段
   * 若 project.directorMode.enabled 不为 true 或无 directorId，原样返回。
   * directorId 未知（取不到档案）也原样返回。
   * 否则拼接「导演执导：<fragment>」。
   * 注意：仅从 config/directorProfiles.js 引入纯函数，不 import directorService，避免循环依赖。
   */
  _enhanceWithDirector(prompt, shot, project) {
    const mode = project && project.directorMode
    if (!mode || mode.enabled !== true || !mode.directorId) {
      return prompt
    }
    const director = getDirector(mode.directorId)
    if (!director) {
      return prompt
    }
    const fragment = buildDirectorPrompt(director, shot)
    if (!fragment) {
      return prompt
    }
    return `${prompt}. 导演执导：${fragment}.`
  }

  /**
   * R08：注入全局视觉风格锁定描述
   */
  _enhanceWithVisualStyle(prompt, visualStyle) {
    const parts = []
    if (visualStyle.colorTemperature > 20) parts.push('warm color temperature')
    else if (visualStyle.colorTemperature < -20) parts.push('cool color temperature')
    if (visualStyle.saturation > 20) parts.push('vibrant saturated colors')
    else if (visualStyle.saturation < -20) parts.push('desaturated muted colors')
    if (visualStyle.contrast > 20) parts.push('high contrast')
    else if (visualStyle.contrast < -20) parts.push('low contrast, flat lighting')
    if (visualStyle.brightness > 20) parts.push('bright exposure')
    else if (visualStyle.brightness < -20) parts.push('dark, low-key exposure')
    if (parts.length > 0) {
      return `${prompt}. consistent visual style across all shots: ${parts.join(', ')}`
    }
    return prompt
  }

  /**
   * R08：从视频中提取尾帧作为下一镜头参考图
   * @returns {Promise<string|null>} 尾帧图片路径
   */
  async extractLastFrame(videoUrl, shotId) {
    try {
      const frameDir = path.join(STORAGE_DIR, 'temp')
      fs.mkdirSync(frameDir, { recursive: true })
      const framePath = path.join(frameDir, `lastframe_${shotId}_${Date.now()}.jpg`)
      // Mock 视频 URL 不是真实文件，无法抽帧
      if (!videoUrl || videoUrl.startsWith('http') && videoUrl.includes('mock')) {
        logger.debug('Mock video URL, skipping last frame extraction')
        return null
      }
      await new Promise((resolve, reject) => {
        exec(`ffmpeg -y -sseof -0.1 -i "${videoUrl}" -frames:v 1 "${framePath}"`, (error) => {
          if (error) reject(error)
          else resolve()
        })
      })
      return framePath
    } catch (error) {
      logger.warn(`Failed to extract last frame for ${shotId}: ${error.message}`)
      return null
    }
  }

  /**
   * R08：场景连续性检查，返回相邻镜头的连续性提示
   */
  checkSceneContinuity(project) {
    const warnings = []
    const shots = project?.shots || []
    for (let i = 1; i < shots.length; i += 1) {
      const prev = shots[i - 1]
      const curr = shots[i]
      if (prev.sceneId && curr.sceneId && prev.sceneId !== curr.sceneId) {
        warnings.push({
          fromShot: prev.index,
          toShot: curr.index,
          level: 'info',
          message: `镜头 ${prev.index + 1} → ${curr.index + 1} 场景发生切换，注意转场处理`,
        })
      }
      // 角色连续性：上一镜头出现的角色在当前镜头消失
      const prevChars = new Set(prev.characterIds || [])
      const currChars = new Set(curr.characterIds || [])
      for (const cid of prevChars) {
        if (!currChars.has(cid) && currChars.size > 0) {
          const character = project.characters?.find((c) => c.id === cid)
          warnings.push({
            fromShot: prev.index,
            toShot: curr.index,
            level: 'warning',
            message: `角色「${character?.name || cid}」在镜头 ${curr.index + 1} 中消失，注意交代去向`,
          })
        }
      }
    }
    return warnings
  }

  /**
   * 计算角色一致性评分
   * MVP 阶段：模拟评分（基于参考图数量和 provider 能力）
   * P1：接入真实人脸特征比对
   */
  async calculateConsistencyScore(shotId, videoUrl) {
    // MVP 简化：返回模拟评分
    // 实际实现应：抽帧 -> 人脸检测 -> 特征向量比对 -> 计算相似度
    const baseScore = 0.7
    const variance = (Math.random() - 0.5) * 0.2 // 0.6-0.8 之间
    const score = Math.max(0, Math.min(1, baseScore + variance))
    logger.debug(`Consistency score for shot ${shotId}: ${score.toFixed(2)}`)
    return parseFloat(score.toFixed(2))
  }

  /**
   * 批量生成镜头（串行，避免并发过高）
   */
  async generateShotsSequential(shots, project, onProgress, styleId, continuity = false) {
    const results = []
    const effectiveStyleId = styleId || project.style || 'none'
    let prevFramePath = null
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i]
      if (onProgress) {
        onProgress({ current: i + 1, total: shots.length, shotId: shot.id })
      }

      try {
        const referenceImages = this.collectReferenceImages(shot, project)
        const styledPrompt = styleService.applyStyleToPrompt(shot.description, effectiveStyleId)
        const result = await this.generateShot({
          projectId: project.id,
          shotId: shot.id,
          prompt: styledPrompt,
          originalPrompt: shot.description,
          styleId: effectiveStyleId !== 'none' ? effectiveStyleId : null,
          referenceImages,
          duration: shot.duration,
          aspectRatio: project.platform === 'portrait' ? '9:16' : '16:9',
          project,
          prevFramePath: continuity ? prevFramePath : null,
        })
        results.push({ shotId: shot.id, success: true, ...result })
        // R08：提取当前镜头尾帧供下一镜头参考
        if (continuity && result.videoUrl) {
          prevFramePath = await this.extractLastFrame(result.videoUrl, shot.id)
        }
      } catch (error) {
        results.push({ shotId: shot.id, success: false, error: error.message })
      }
    }
    return results
  }

  /**
   * 并行生成多个镜头（带并发控制）
   * @param {Array} shots - 待生成镜头列表
   * @param {Object} project - 项目对象
   * @param {Function} onProgress - 进度回调 ({ current, total, shotId, completed })
   * @param {string} styleId - 风格 ID
   * @param {number} maxConcurrent - 最大并发数
   */
  async generateShotsParallel(shots, project, onProgress, styleId, maxConcurrent) {
    const concurrency = maxConcurrent || config.video.maxConcurrent || 3
    const effectiveStyleId = styleId || project.style || 'none'
    const results = new Array(shots.length)
    let completed = 0
    let currentIndex = 0

    async function worker(workerId) {
      while (currentIndex < shots.length) {
        const index = currentIndex++
        const shot = shots[index]

        try {
          const referenceImages = videoService.collectReferenceImages(shot, project)
          const styledPrompt = styleService.applyStyleToPrompt(shot.description, effectiveStyleId)
          const result = await videoService.generateShot({
            projectId: project.id,
            shotId: shot.id,
            prompt: styledPrompt,
            originalPrompt: shot.description,
            styleId: effectiveStyleId !== 'none' ? effectiveStyleId : null,
            referenceImages,
            duration: shot.duration,
            aspectRatio: project.platform === 'portrait' ? '9:16' : '16:9',
            project,
          })
          results[index] = { shotId: shot.id, success: true, ...result }
        } catch (error) {
          results[index] = { shotId: shot.id, success: false, error: error.message }
        }

        completed++
        if (onProgress) {
          onProgress({ current: completed, total: shots.length, shotId: shot.id, completed })
        }
      }
    }

    // 启动并发 worker
    const workerCount = Math.min(concurrency, shots.length)
    const workers = []
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker(i))
    }
    await Promise.all(workers)

    return results
  }

  /**
   * 收集镜头相关的参考图（角色 + 场景）
   */
  collectReferenceImages(shot, project) {
    const images = []

    // 角色参考图
    if (shot.characterIds && project.characters) {
      for (const charId of shot.characterIds) {
        const character = project.characters.find((c) => c.id === charId)
        if (character && character.referenceImages) {
          images.push(...character.referenceImages)
        }
      }
    }

    // 场景参考图
    if (shot.sceneId && project.scenes) {
      const scene = project.scenes.find((s) => s.id === shot.sceneId)
      if (scene && scene.referenceImages) {
        images.push(...scene.referenceImages)
      }
    }

    return images.slice(0, 3) // 最多 3 张参考图
  }

  /**
   * 单镜头重新生成
   * 将当前版本存入历史，然后重新生成
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} params.shotId
   * @param {string} [params.newPrompt] - 新的画面描述（不传则用原描述）
   * @param {Object} params.project - 项目对象
   * @param {string} [params.styleId]
   */
  async regenerateShot({ projectId, shotId, newPrompt, project, styleId }) {
    const shot = project.shots.find((s) => s.id === shotId)
    if (!shot) {
      throw new Error(`Shot ${shotId} not found in project ${projectId}`)
    }
    if (shot.locked) {
      throw new Error(`Shot ${shotId} is locked, cannot regenerate`)
    }

    // 将当前版本存入历史
    if (shot.videoUrl) {
      shot.versions.push({
        videoUrl: shot.videoUrl,
        prompt: shot.prompt || shot.description,
        model: shot.model,
        createdAt: shot.updatedAt,
        consistencyScore: shot.consistencyScore,
      })
      // 最多保留 5 个历史版本
      if (shot.versions.length > 5) {
        shot.versions = shot.versions.slice(-5)
      }
    }

    // 使用新描述或原描述
    const description = newPrompt || shot.description
    const effectiveStyleId = styleId || project.style || 'none'
    const referenceImages = this.collectReferenceImages(shot, project)
    const styledPrompt = styleService.applyStyleToPrompt(description, effectiveStyleId)

    shot.updateStatus(SHOT_STATUS.GENERATING)

    try {
      const result = await this.generateShot({
        projectId,
        shotId,
        prompt: styledPrompt,
        originalPrompt: description,
        styleId: effectiveStyleId !== 'none' ? effectiveStyleId : null,
        referenceImages,
        duration: shot.duration,
        aspectRatio: project.platform === 'portrait' ? '9:16' : '16:9',
        project,
      })

      shot.updateStatus(SHOT_STATUS.COMPLETED, {
        videoUrl: result.videoUrl,
        consistencyScore: result.consistencyScore,
      })
      shot.prompt = styledPrompt
      shot.model = result.model || this.provider.name
      shot.description = description

      return { success: true, shot, videoUrl: result.videoUrl }
    } catch (error) {
      shot.updateStatus(SHOT_STATUS.FAILED, { errorMessage: error.message })
      return { success: false, shot, error: error.message }
    }
  }

  /**
   * 生成多个候选版本
   * @param {Object} params
   * @param {string} params.projectId
   * @param {string} params.shotId
   * @param {number} params.count - 候选数量（1-5，默认3）
   * @param {Object} params.project
   * @param {string} [params.styleId]
   */
  async generateCandidates({ projectId, shotId, count = 3, project, styleId }) {
    const shot = project.shots.find((s) => s.id === shotId)
    if (!shot) {
      throw new Error(`Shot ${shotId} not found`)
    }
    if (shot.locked) {
      throw new Error(`Shot ${shotId} is locked, cannot generate candidates`)
    }

    const candidateCount = Math.max(1, Math.min(5, count))
    const effectiveStyleId = styleId || project.style || 'none'
    const referenceImages = this.collectReferenceImages(shot, project)
    const styledPrompt = styleService.applyStyleToPrompt(shot.description, effectiveStyleId)

    shot.updateStatus(SHOT_STATUS.GENERATING)

    // 并行生成候选
    const candidatePromises = []
    for (let i = 0; i < candidateCount; i++) {
      candidatePromises.push(
        this.generateShot({
          projectId,
          shotId: `${shotId}_candidate_${i}`,
          prompt: `${styledPrompt} (variant ${i + 1})`,
          originalPrompt: shot.description,
          styleId: effectiveStyleId !== 'none' ? effectiveStyleId : null,
          referenceImages,
          duration: shot.duration,
          aspectRatio: project.platform === 'portrait' ? '9:16' : '16:9',
          project,
        }).catch((err) => ({ success: false, error: err.message }))
      )
    }

    const results = await Promise.all(candidatePromises)
    const candidates = results
      .filter((r) => r && r.success !== false)
      .map((r, i) => ({
        id: `candidate_${Date.now()}_${i}`,
        videoUrl: r.videoUrl,
        prompt: styledPrompt,
        model: r.model || this.provider.name,
        createdAt: new Date().toISOString(),
        consistencyScore: r.consistencyScore,
      }))

    // 默认选中第一个候选作为当前版本
    if (candidates.length > 0) {
      // 保存当前版本到历史
      if (shot.videoUrl) {
        shot.versions.push({
          videoUrl: shot.videoUrl,
          prompt: shot.prompt,
          model: shot.model,
          createdAt: shot.updatedAt,
          consistencyScore: shot.consistencyScore,
        })
      }
      shot.updateStatus(SHOT_STATUS.COMPLETED, {
        videoUrl: candidates[0].videoUrl,
        consistencyScore: candidates[0].consistencyScore,
      })
      shot.prompt = styledPrompt
      shot.model = candidates[0].model
    } else {
      shot.updateStatus(SHOT_STATUS.FAILED, { errorMessage: 'All candidates failed' })
    }

    return { success: candidates.length > 0, shot, candidates }
  }

  /**
   * 切换镜头到指定历史版本
   */
  switchShotVersion(shot, versionIndex) {
    if (!shot.versions || versionIndex < 0 || versionIndex >= shot.versions.length) {
      throw new Error('Invalid version index')
    }
    const targetVersion = shot.versions[versionIndex]
    // 当前版本存入历史
    shot.versions.push({
      videoUrl: shot.videoUrl,
      prompt: shot.prompt,
      model: shot.model,
      createdAt: shot.updatedAt,
      consistencyScore: shot.consistencyScore,
    })
    // 移除目标版本（因为它变成了当前版本）
    shot.versions.splice(versionIndex, 1)

    shot.videoUrl = targetVersion.videoUrl
    shot.prompt = targetVersion.prompt
    shot.model = targetVersion.model
    shot.consistencyScore = targetVersion.consistencyScore
    shot.status = SHOT_STATUS.COMPLETED
    shot.updatedAt = new Date().toISOString()

    return shot
  }
}

export const videoService = new VideoService()
export default videoService
