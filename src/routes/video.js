import { Router } from 'express'
import { videoService } from '../services/videoService.js'
import { projectService } from '../services/projectService.js'
import { quotaService } from '../services/quotaService.js'
import { styleService } from '../services/styleService.js'
import { versionService } from '../services/versionService.js'
import { contentModerationService } from '../services/contentModerationService.js'
import { notificationService, NOTIFICATION_TYPE } from '../services/notificationService.js'
import { webhookService } from '../services/webhookService.js'
import { generationHistoryService } from '../services/generationHistoryService.js'
import { SHOT_STATUS } from '../models/shot.js'
import logger from '../utils/logger.js'

const router = Router()

/**
 * 更新项目中某个镜头的状态
 */
async function updateShotInProject(projectId, shotId, updates) {
  try {
    const project = await projectService.getProject(projectId)
    const shot = project.shots.find((s) => s.id === shotId)
    if (shot) {
      if (updates.status) shot.status = updates.status
      if (updates.videoUrl) shot.videoUrl = updates.videoUrl
      if (updates.consistencyScore !== undefined) shot.consistencyScore = updates.consistencyScore
      if (updates.errorMessage) shot.errorMessage = updates.errorMessage
      shot.updatedAt = new Date().toISOString()
      await projectService.updateProject(projectId, { shots: project.shots })
    }
    return shot
  } catch (error) {
    logger.error('Failed to update shot:', error.message)
    return null
  }
}

// 生成单个镜头
router.post('/generate', async (req, res) => {
  try {
    const { projectId, shotId, prompt, referenceImages, duration, resolution, aspectRatio, styleId } = req.body
    const uid = req.user?.id || 'default'

    if (!projectId || !prompt) {
      return res.status(400).json({ error: 'projectId and prompt are required' })
    }

    // 内容审核
    const moderation = contentModerationService.moderate(prompt, {
      userId: uid,
      projectId,
      context: 'video_generate_prompt',
    })
    if (!moderation.passed) {
      return res.status(403).json({
        error: '内容审核未通过',
        moderation,
      })
    }

    // 额度检查
    const quota = quotaService.checkVideoQuota(uid)
    if (!quota.allowed) {
      return res.status(403).json({
        error: quota.reason,
        quota: { used: quota.used, limit: quota.limit },
      })
    }

    const project = await projectService.getProject(projectId)
    const targetShotId = shotId || `temp_${Date.now()}`

    // 应用风格修饰（优先使用传入的 styleId，其次用项目默认风格）
    const effectiveStyleId = styleId || project.style || 'none'
    const styledPrompt = styleService.applyStyleToPrompt(prompt, effectiveStyleId)

    // 消耗额度
    quotaService.consumeVideoQuota(uid)

    // 先标记为生成中
    await updateShotInProject(projectId, targetShotId, { status: SHOT_STATUS.GENERATING })

    // 异步生成，立即返回
    res.status(202).json({
      status: 'generating',
      shotId: targetShotId,
      style: effectiveStyleId !== 'none' ? effectiveStyleId : null,
      message: 'Video generation started',
    })

    // 后台执行生成
    videoService
      .generateShot({
        projectId,
        shotId: targetShotId,
        prompt: styledPrompt,
        originalPrompt: prompt,
        styleId: effectiveStyleId !== 'none' ? effectiveStyleId : null,
        referenceImages: referenceImages || [],
        duration: duration || 5,
        resolution: resolution || '720p',
        aspectRatio: aspectRatio || '16:9',
        project,
      })
      .then(async (result) => {
        await updateShotInProject(projectId, targetShotId, {
          status: SHOT_STATUS.COMPLETED,
          videoUrl: result.videoUrl,
          consistencyScore: result.consistencyScore,
        })
        logger.info(`Video generated for shot ${targetShotId}`)
      })
      .catch(async (error) => {
        await updateShotInProject(projectId, targetShotId, {
          status: SHOT_STATUS.FAILED,
          errorMessage: error.message,
        })
        logger.error(`Video generation failed for shot ${targetShotId}:`, error.message)
      })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 批量生成项目所有镜头
router.post('/generate-all/:projectId', async (req, res) => {
  try {
    const { styleId } = req.body
    const uid = req.user?.id || 'default'
    const project = await projectService.getProject(req.params.projectId)

    if (!project.shots || project.shots.length === 0) {
      return res.status(400).json({ error: 'No shots to generate. Please create a script first.' })
    }

    // 额度检查：只生成未完成、未锁定且有额度的镜头
    const pendingShots = project.shots.filter((s) => s.status !== SHOT_STATUS.COMPLETED && !s.locked)

    // 内容审核：过滤违规镜头
    const approvedShots = []
    const rejectedShots = []
    for (const shot of pendingShots) {
      const shotText = `${shot.description} ${shot.dialogue || ''} ${shot.narration || ''}`
      const moderation = contentModerationService.moderate(shotText, {
        userId: uid,
        projectId: project.id,
        context: 'video_batch_generate',
      })
      if (moderation.passed) {
        approvedShots.push(shot)
      } else {
        rejectedShots.push({ shotId: shot.id, moderation })
      }
    }

    const quota = quotaService.checkVideoQuota(uid)
    const shotsToGenerate = approvedShots.slice(0, quota.remaining)

    if (shotsToGenerate.length === 0) {
      return res.status(403).json({
        error: quota.reason || '没有可生成的镜头（可能全部被内容审核拒绝）',
        quota: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
        rejectedShots,
      })
    }

    // 消耗额度
    for (let i = 0; i < shotsToGenerate.length; i++) {
      quotaService.consumeVideoQuota(uid)
    }

    // 标记待生成镜头为生成中
    for (const shot of shotsToGenerate) {
      shot.status = SHOT_STATUS.GENERATING
    }
    await projectService.updateProject(project.id, { shots: project.shots })

    res.status(202).json({
      status: 'generating',
      totalShots: shotsToGenerate.length,
      skipped: pendingShots.length - shotsToGenerate.length,
      rejected: rejectedShots.length,
      rejectedShots,
      message: `Batch generation started (${shotsToGenerate.length} shots)`,
    })

    // 后台并行生成
    videoService
      .generateShotsParallel(shotsToGenerate, project, (progress) => {
        logger.debug(`Generation progress: ${progress.current}/${progress.total}`)
      }, styleId)
      .then(async (results) => {
        // 回写每个镜头的结果到项目
        const updatedProject = await projectService.getProject(project.id)
        for (const result of results) {
          const shot = updatedProject.shots.find((s) => s.id === result.shotId)
          if (shot) {
            if (result.success) {
              shot.status = SHOT_STATUS.COMPLETED
              shot.videoUrl = result.videoUrl
              shot.consistencyScore = result.consistencyScore
            } else {
              shot.status = SHOT_STATUS.FAILED
              shot.errorMessage = result.error
            }
            shot.updatedAt = new Date().toISOString()
          }
        }
        await projectService.updateProject(project.id, { shots: updatedProject.shots })

        const successCount = results.filter((r) => r.success).length
        logger.info(`Batch generation complete: ${successCount}/${results.length} succeeded for project ${project.id}`)

        // 记录生成历史
        const generationStartTime = Date.now() - 5000 // 估算开始时间（实际应在启动时记录）
        for (const result of results) {
          const shot = shotsToGenerate.find((s) => s.id === result.shotId)
          generationHistoryService.recordGeneration({
            projectId: project.id,
            shotId: result.shotId,
            prompt: shot?.prompt || '',
            provider: config.video.provider,
            status: result.success ? 'completed' : 'failed',
            durationMs: result.durationMs || 0,
            error: result.success ? null : result.error,
            style: styleId || project.style || null,
            resolution: '720p',
            userId: uid,
          })
        }

        // 自动保存版本
        versionService.saveVersion(project.id, {
          label: '视频生成',
          description: `批量生成 ${successCount}/${results.length} 个镜头`,
          auto: true,
        }).catch(() => {})

        // 发送通知
        const failedCount = results.length - successCount
        notificationService.create({
          userId: uid,
          type: failedCount > 0 ? NOTIFICATION_TYPE.VIDEO_FAILED : NOTIFICATION_TYPE.VIDEO_COMPLETED,
          title: failedCount > 0 ? '视频生成部分失败' : '视频生成完成',
          message: `项目「${project.name}」的 ${successCount}/${results.length} 个镜头已生成${failedCount > 0 ? `，${failedCount} 个失败` : ''}`,
          projectId: project.id,
          data: { successCount, failedCount, total: results.length },
        })

        // 触发 Webhook
        webhookService.triggerEvent(
          failedCount > 0 ? 'video.failed' : 'video.completed',
          {
            projectId: project.id,
            projectName: project.name,
            successCount,
            failedCount,
            total: results.length,
          },
          uid
        ).catch(() => {})
      })
      .catch((error) => {
        logger.error('Batch generation failed:', error.message)
      })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取项目的视频生成历史
 */
router.get('/history/:projectId', (req, res) => {
  try {
    const { limit, offset, status, provider } = req.query
    const result = generationHistoryService.getProjectHistory(req.params.projectId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
      status,
      provider,
    })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取镜头的视频生成历史
 */
router.get('/history/shot/:shotId', (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20
    const history = generationHistoryService.getShotHistory(req.params.shotId, { limit })
    res.json({ history })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取项目的生成统计
 */
router.get('/history/:projectId/stats', (req, res) => {
  try {
    const stats = generationHistoryService.getStats(req.params.projectId)
    res.json(stats)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 清除项目的生成历史
 */
router.delete('/history/:projectId', (req, res) => {
  try {
    const result = generationHistoryService.clearProjectHistory(req.params.projectId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取生成队列状态
 */
router.get('/queue', (req, res) => {
  try {
    const stats = videoService.getQueueStats()
    res.json(stats)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取项目的活跃生成任务
 */
router.get('/queue/project/:projectId', (req, res) => {
  try {
    const tasks = videoService.getProjectActiveTasks(req.params.projectId)
    res.json({ tasks, count: tasks.length })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 取消单个生成任务
 */
router.post('/queue/cancel/:taskId', async (req, res) => {
  try {
    const result = await videoService.cancelTask(req.params.taskId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 取消项目的所有生成任务
 */
router.post('/queue/cancel-project/:projectId', async (req, res) => {
  try {
    const result = await videoService.cancelProjectTasks(req.params.projectId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取任务历史
 */
router.get('/queue/history', (req, res) => {
  try {
    const { projectId, shotId, status, limit } = req.query
    const history = videoService.getTaskHistory({
      projectId,
      shotId,
      status,
      limit: limit ? parseInt(limit, 10) : 50,
    })
    res.json({ history, total: history.length })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 单镜头重新生成
 */
router.post('/regenerate', async (req, res) => {
  try {
    const { projectId, shotId, newPrompt, styleId } = req.body
    const uid = req.user?.id || 'default'

    if (!projectId || !shotId) {
      return res.status(400).json({ error: 'projectId and shotId are required' })
    }

    const project = await projectService.getProject(projectId)
    const shot = project.shots.find((s) => s.id === shotId)
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' })
    }
    if (shot.locked) {
      return res.status(403).json({ error: 'Shot is locked, cannot regenerate' })
    }

    // 内容审核
    const promptToCheck = newPrompt || shot.description
    const moderation = contentModerationService.moderate(promptToCheck, {
      userId: uid,
      projectId,
      context: 'video_regenerate_prompt',
    })
    if (!moderation.passed) {
      return res.status(403).json({ error: '内容审核未通过', moderation })
    }

    // 额度检查
    const quota = quotaService.checkVideoQuota(uid)
    if (!quota.allowed) {
      return res.status(403).json({ error: quota.reason, quota: { used: quota.used, limit: quota.limit } })
    }
    quotaService.consumeVideoQuota(uid)

    res.status(202).json({ status: 'generating', shotId, message: 'Regeneration started' })

    // 后台执行
    videoService
      .regenerateShot({ projectId, shotId, newPrompt, project, styleId })
      .then(async (result) => {
        await projectService.updateProject(projectId, { shots: project.shots })
        if (result.success) {
          notificationService.create({
            userId: uid,
            type: NOTIFICATION_TYPE.VIDEO_COMPLETED,
            title: '镜头重生成完成',
            message: `项目「${project.name}」的镜头已重新生成`,
            projectId,
            data: { shotId },
          })
        }
      })
      .catch(async (error) => {
        logger.error(`Regenerate failed for shot ${shotId}:`, error.message)
      })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 生成多个候选版本
 */
router.post('/candidates', async (req, res) => {
  try {
    const { projectId, shotId, count = 3, styleId } = req.body
    const uid = req.user?.id || 'default'

    if (!projectId || !shotId) {
      return res.status(400).json({ error: 'projectId and shotId are required' })
    }

    const project = await projectService.getProject(projectId)
    const shot = project.shots.find((s) => s.id === shotId)
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' })
    }
    if (shot.locked) {
      return res.status(403).json({ error: 'Shot is locked, cannot generate candidates' })
    }

    const candidateCount = Math.max(1, Math.min(5, count))

    // 额度检查（每个候选消耗1次额度）
    const quota = quotaService.checkVideoQuota(uid)
    if (quota.remaining < candidateCount) {
      return res.status(403).json({
        error: `额度不足，需要 ${candidateCount} 次，剩余 ${quota.remaining} 次`,
        quota: { used: quota.used, limit: quota.limit, remaining: quota.remaining },
      })
    }
    for (let i = 0; i < candidateCount; i++) {
      quotaService.consumeVideoQuota(uid)
    }

    res.status(202).json({ status: 'generating', shotId, candidateCount, message: 'Candidate generation started' })

    videoService
      .generateCandidates({ projectId, shotId, count: candidateCount, project, styleId })
      .then(async (result) => {
        await projectService.updateProject(projectId, { shots: project.shots })
        notificationService.create({
          userId: uid,
          type: NOTIFICATION_TYPE.VIDEO_COMPLETED,
          title: '候选版本生成完成',
          message: `项目「${project.name}」的镜头已生成 ${result.candidates.length} 个候选版本`,
          projectId,
          data: { shotId, candidateCount: result.candidates.length },
        })
      })
      .catch((error) => {
        logger.error(`Candidate generation failed for shot ${shotId}:`, error.message)
      })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 锁定/解锁镜头
 */
router.put('/shots/:shotId/lock', async (req, res) => {
  try {
    const { projectId, locked } = req.body
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    const project = await projectService.getProject(projectId)
    const shot = project.shots.find((s) => s.id === req.params.shotId)
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' })
    }
    shot.locked = locked !== false
    shot.updatedAt = new Date().toISOString()
    await projectService.updateProject(projectId, { shots: project.shots })
    res.json({ success: true, shot: shot.toJSON ? shot.toJSON() : shot })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 更新镜头描述
 */
router.put('/shots/:shotId', async (req, res) => {
  try {
    const { projectId, description, duration, dialogue, narration, sceneId, characterActions } = req.body
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    const project = await projectService.getProject(projectId)
    const shot = project.shots.find((s) => s.id === req.params.shotId)
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' })
    }
    if (shot.locked) {
      return res.status(403).json({ error: 'Shot is locked, cannot edit' })
    }
    if (description !== undefined) shot.description = description
    if (duration !== undefined) shot.duration = duration
    if (dialogue !== undefined) shot.dialogue = dialogue
    if (narration !== undefined) shot.narration = narration
    if (sceneId !== undefined) shot.sceneId = sceneId
    if (characterActions !== undefined) shot.characterActions = characterActions
    shot.updatedAt = new Date().toISOString()
    await projectService.updateProject(projectId, { shots: project.shots })
    res.json({ success: true, shot: shot.toJSON ? shot.toJSON() : shot })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 切换到历史版本
 */
router.post('/shots/:shotId/version/:versionIndex', async (req, res) => {
  try {
    const { projectId } = req.body
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    const project = await projectService.getProject(projectId)
    const shot = project.shots.find((s) => s.id === req.params.shotId)
    if (!shot) {
      return res.status(404).json({ error: 'Shot not found' })
    }
    const versionIndex = parseInt(req.params.versionIndex, 10)
    const updatedShot = videoService.switchShotVersion(shot, versionIndex)
    await projectService.updateProject(projectId, { shots: project.shots })
    res.json({ success: true, shot: updatedShot.toJSON ? updatedShot.toJSON() : updatedShot })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * R08：场景与角色连续性检查
 */
router.get('/continuity/check', async (req, res) => {
  try {
    const { projectId } = req.query
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    const project = await projectService.getProject(projectId)
    const warnings = videoService.checkSceneContinuity(project)
    res.json({ success: true, warnings, total: warnings.length })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
