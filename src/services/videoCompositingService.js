import ffmpeg from '../utils/ffmpeg.js'
import { audioService } from './audioService.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import path from 'path'
import fs from 'fs'

const STORAGE_DIR = path.resolve(config.storage.path)
const EXPORTS_DIR = path.join(STORAGE_DIR, 'exports')
const TEMP_DIR = path.join(STORAGE_DIR, 'temp')

// 确保目录存在
for (const dir of [EXPORTS_DIR, TEMP_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

/**
 * 视频合成 Service
 * 将多个镜头 + 配音 + 字幕合成为最终成片
 */
export class VideoCompositingService {
  /**
   * 导出项目成片
   * @param {Object} project - 项目对象
   * @param {Object} options
   * @param {boolean} options.burnSubtitles - 是否烧录字幕
   * @param {Object} options.dubbingResult - 配音结果（来自 dubbingService）
   * @returns {Promise<{outputPath: string, outputUrl: string, duration: number}>}
   */
  async exportProject(project, options = {}) {
    const exportId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const outputPath = path.join(EXPORTS_DIR, `${exportId}.mp4`)
    const outputUrl = `/storage/exports/${exportId}.mp4`

    logger.info(`Starting export for project ${project.id}: ${exportId}`)

    try {
      // 1. 收集已完成的镜头
      const completedShots = (project.shots || []).filter((s) => s.status === 'completed' && s.videoUrl)
      if (completedShots.length === 0) {
        throw new Error('没有已完成的镜头，请先生成视频')
      }
      logger.info(`Found ${completedShots.length} completed shots for export`)

      // 2. 解析视频文件路径
      const videoPaths = completedShots.map((s) => this.resolveVideoPath(s.videoUrl))

      // 3. 拼接所有镜头视频
      const concatOutput = path.join(TEMP_DIR, `${exportId}_concat.mp4`)
      await ffmpeg.concatVideos(videoPaths, concatOutput)
      logger.info('Video concatenation complete')

      // 4. 处理音频（三轨混音：配音 + BGM + 音效）
      let finalVideo = concatOutput
      const audioConfig = project.audioConfig || {}
      const hasDubbing = options.dubbingResult?.audioTracks?.length > 0
      const hasBgm = audioConfig.bgmId
      const hasSfx = audioConfig.sfxIds?.length > 0

      if (hasDubbing || hasBgm || hasSfx) {
        const mixedAudioPath = path.join(TEMP_DIR, `${exportId}_mixed.aac`)
        await this._buildMixedAudioTrack({
          dubbingResult: hasDubbing ? options.dubbingResult : null,
          audioConfig,
          totalDuration: completedShots.reduce((sum, s) => sum + (s.duration || 5), 0),
          completedShots,
        }, mixedAudioPath)
        logger.info('Mixed audio track built')

        const mergedOutput = path.join(TEMP_DIR, `${exportId}_merged.mp4`)
        await ffmpeg.mergeAudio(concatOutput, mixedAudioPath, mergedOutput)
        finalVideo = mergedOutput
        logger.info('Mixed audio merged')
      }

      // 5. 烧录字幕
      if (options.burnSubtitles !== false && options.dubbingResult?.subtitles?.content) {
        const srtPath = path.join(TEMP_DIR, `${exportId}.srt`)
        fs.writeFileSync(srtPath, options.dubbingResult.subtitles.content, 'utf-8')

        const subtitledOutput = path.join(TEMP_DIR, `${exportId}_subtitled.mp4`)
        try {
          await ffmpeg.burnSubtitles(finalVideo, srtPath, subtitledOutput)
          finalVideo = subtitledOutput
          logger.info('Subtitles burned')
        } catch (subtitleError) {
          logger.warn('Subtitle burn failed, exporting without subtitles:', subtitleError.message)
        }
      }

      // 6. 复制到最终输出
      fs.copyFileSync(finalVideo, outputPath)

      // 7. 获取最终时长
      const duration = await ffmpeg.getDuration(outputPath)

      // 8. 清理临时文件
      this._cleanupTempFiles(exportId)

      logger.info(`Export complete: ${outputUrl} (${duration?.toFixed(1)}s)`)

      return {
        exportId,
        outputPath,
        outputUrl,
        duration,
        shotCount: completedShots.length,
        hasAudio: !!(options.dubbingResult?.audioTracks?.length),
        hasSubtitles: options.burnSubtitles !== false && !!options.dubbingResult?.subtitles?.content,
      }
    } catch (error) {
      logger.error('Export failed:', error.message)
      this._cleanupTempFiles(exportId)
      throw error
    }
  }

  /**
   * R34：按 editPlan 渲染智能剪辑成片
   */
  async renderEditPlan(project, plan) {
    if (!plan || !Array.isArray(plan.shots) || plan.shots.length === 0) {
      throw new Error('Invalid edit plan: shots are required')
    }
    if (plan.shots.length > 200) {
      throw new Error('Invalid edit plan: too many shots')
    }
    for (const planShot of plan.shots) {
      if (!Number.isFinite(planShot.duration) || planShot.duration <= 0 || planShot.duration > 60) {
        throw new Error(`Invalid edit plan shot duration: ${planShot.duration}`)
      }
    }
    const plannedDuration = Number.isFinite(plan.totalDuration)
      ? plan.totalDuration
      : plan.shots.reduce((sum, shot) => sum + shot.duration, 0)
    const exportId = `edit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const outputPath = path.join(EXPORTS_DIR, `${exportId}.mp4`)
    const outputUrl = `/storage/exports/${exportId}.mp4`
    const tempFiles = []

    try {
      const trimmed = []
      for (const planShot of plan.shots) {
        const shot = (project.shots || []).find((item) => item.id === planShot.shotId)
        if (!shot?.videoUrl) throw new Error(`Shot not ready for edit: ${planShot.shotId}`)
        const inputPath = this.resolveVideoPath(shot.videoUrl)
        const trimmedPath = path.join(TEMP_DIR, `${exportId}_${trimmed.length}.mp4`)
        await ffmpeg.trimVideo(inputPath, trimmedPath, planShot.duration)
        tempFiles.push(trimmedPath)
        trimmed.push({ path: trimmedPath, duration: planShot.duration })
      }

      const xfadeSupported = await ffmpeg.hasFilter('xfade').catch(() => false)
      const wantsFade = plan.transition === 'fade'
      const useFade = wantsFade && xfadeSupported && trimmed.length > 1
      let videoPath

      if (useFade) {
        let currentPath = trimmed[0].path
        let currentDuration = trimmed[0].duration
        for (let i = 1; i < trimmed.length; i += 1) {
          const next = trimmed[i]
          const transitionDuration = Math.min(
            plan.transitionDuration || 0.4,
            Math.min(currentDuration, next.duration) / 3
          )
          const offset = Math.max(0, currentDuration - transitionDuration)
          const crossfadePath = path.join(TEMP_DIR, `${exportId}_xfade_${i}.mp4`)
          await ffmpeg.crossfadeVideos(currentPath, next.path, crossfadePath, transitionDuration, offset)
          tempFiles.push(crossfadePath)
          currentPath = crossfadePath
          currentDuration = currentDuration + next.duration - transitionDuration
        }
        videoPath = currentPath
      } else {
        const concatPath = path.join(TEMP_DIR, `${exportId}_concat.mp4`)
        await ffmpeg.concatVideos(trimmed.map((item) => item.path), concatPath)
        tempFiles.push(concatPath)
        videoPath = concatPath
      }

      let finalVideo = videoPath
      let hasAudio = false
      try {
        const preview = await audioService.previewMix(project, { duration: plannedDuration })
        if (preview.tracks.length > 0) {
          const audioPath = path.join(STORAGE_DIR, preview.url.replace('/storage/', ''))
          const mergedPath = path.join(TEMP_DIR, `${exportId}_with_audio.mp4`)
          await ffmpeg.mergeAudio(videoPath, audioPath, mergedPath)
          tempFiles.push(mergedPath)
          finalVideo = mergedPath
          hasAudio = true
        }
      } catch (audioError) {
        logger.warn(`Edit plan audio mux skipped: ${audioError.message}`)
      }

      fs.copyFileSync(finalVideo, outputPath)
      const duration = await ffmpeg.getDuration(outputPath)
      return {
        exportId,
        outputPath,
        outputUrl,
        duration,
        transitionApplied: useFade ? 'xfade' : 'cut',
        transitionFallback: wantsFade && !xfadeSupported,
        hasAudio,
        shotCount: plan.shots.length,
      }
    } finally {
      for (const file of tempFiles) {
        try {
          if (fs.existsSync(file)) fs.unlinkSync(file)
        } catch { /* ignore cleanup errors */ }
      }
    }
  }

  /**
   * 将 URL 解析为本地文件路径
   */
  resolveVideoPath(videoUrl) {
    if (videoUrl.startsWith('/storage/')) {
      const resolved = path.resolve(STORAGE_DIR, videoUrl.replace('/storage/', ''))
      const root = path.resolve(STORAGE_DIR) + path.sep
      if (!resolved.startsWith(root)) {
        throw new Error(`Invalid storage path: ${videoUrl}`)
      }
      return resolved
    }
    if (videoUrl.startsWith('http')) {
      // 远程 URL 需要先下载，MVP 阶段暂不支持
      throw new Error(`Remote video URL not supported for export: ${videoUrl}`)
    }
    // 本地路径必须在 STORAGE_DIR 内，避免任意本地文件被导入成片
    const resolved = path.resolve(videoUrl)
    const root = path.resolve(STORAGE_DIR) + path.sep
    if (!resolved.startsWith(root)) {
      throw new Error(`Local video path outside storage is not allowed: ${videoUrl}`)
    }
    return resolved
  }

  /**
   * 构建完整配音音轨
   * 将多段 TTS 音频按时间轴拼接，间隙填充静音
   */
  async _buildAudioTrack(dubbingResult, outputPath, shots) {
    const tracks = dubbingResult.audioTracks || []
    if (tracks.length === 0) return null

    // MVP 简化：直接拼接所有音轨
    // 实际实现应根据每镜时长和音频起始时间精确对齐
    const audioPaths = tracks
      .map((t) => this.resolveAudioPath(t.audioUrl))
      .filter((p) => fs.existsSync(p))

    if (audioPaths.length === 0) {
      // 如果没有本地音频文件，生成静音
      const totalDuration = shots.reduce((sum, s) => sum + (s.duration || 5), 0)
      await ffmpeg.generateSilence(outputPath, totalDuration)
      return outputPath
    }

    await ffmpeg.concatAudio(audioPaths, outputPath)
    return outputPath
  }

  /**
   * 构建三轨混音音轨（配音 + BGM + 音效）
   */
  async _buildMixedAudioTrack({ dubbingResult, audioConfig, totalDuration, completedShots }, outputPath) {
    const tracks = []
    const tempFiles = []

    try {
      // 1. 配音轨
      if (dubbingResult?.audioTracks?.length > 0) {
        const voicePath = path.join(TEMP_DIR, `mix_voice_${Date.now()}.aac`)
        tempFiles.push(voicePath)
        await this._buildAudioTrack(dubbingResult, voicePath, completedShots)
        tracks.push({ path: voicePath, volume: audioConfig.voiceVolume ?? 1.0 })
      }

      // 2. BGM 轨
      if (audioConfig.bgmId) {
        const bgmPath = this._resolveBgmPath(audioConfig.bgmId)
        if (bgmPath && fs.existsSync(bgmPath)) {
          // 截取 BGM 到总时长，并添加淡入淡出
          const bgmProcessed = path.join(TEMP_DIR, `mix_bgm_${Date.now()}.aac`)
          tempFiles.push(bgmProcessed)
          await ffmpeg.processBgm(bgmPath, bgmProcessed, {
            duration: totalDuration,
            fadeIn: audioConfig.bgmFadeIn ?? 2,
            fadeOut: audioConfig.bgmFadeOut ?? 2,
          })
          tracks.push({ path: bgmProcessed, volume: audioConfig.bgmVolume ?? 0.3 })
        }
      }

      // 3. 音效轨（简化：将所有音效拼接）
      if (audioConfig.sfxIds?.length > 0) {
        const sfxPaths = audioConfig.sfxIds
          .map((id) => this._resolveSfxPath(id))
          .filter((p) => p && fs.existsSync(p))
        if (sfxPaths.length > 0) {
          const sfxPath = path.join(TEMP_DIR, `mix_sfx_${Date.now()}.aac`)
          tempFiles.push(sfxPath)
          await ffmpeg.concatAudio(sfxPaths, sfxPath)
          tracks.push({ path: sfxPath, volume: audioConfig.sfxVolume ?? 0.5 })
        }
      }

      // 如果没有任何音轨，生成静音
      if (tracks.length === 0) {
        await ffmpeg.generateSilence(outputPath, totalDuration)
        return outputPath
      }

      // 单轨直接复制
      if (tracks.length === 1) {
        await ffmpeg.adjustVolume(tracks[0].path, outputPath, tracks[0].volume)
        return outputPath
      }

      // 多轨混音
      await ffmpeg.mixAudioTracks(tracks, outputPath, totalDuration)
      return outputPath
    } finally {
      // 清理临时文件
      for (const f of tempFiles) {
        try { if (fs.existsSync(f)) fs.unlinkSync(f) } catch { /* ignore cleanup errors */ }
      }
    }
  }

  /**
   * 解析 BGM 文件路径
   */
  _resolveBgmPath(bgmId) {
    const bgmDir = path.join(STORAGE_DIR, 'audio', 'bgm')
    // 尝试常见扩展名
    for (const ext of ['.mp3', '.wav', '.aac', '.m4a']) {
      const p = path.join(bgmDir, `${bgmId}${ext}`)
      if (fs.existsSync(p)) return p
    }
    return null
  }

  /**
   * 解析音效文件路径
   */
  _resolveSfxPath(sfxId) {
    const sfxDir = path.join(STORAGE_DIR, 'audio', 'sfx')
    for (const ext of ['.mp3', '.wav', '.aac']) {
      const p = path.join(sfxDir, `${sfxId}${ext}`)
      if (fs.existsSync(p)) return p
    }
    return null
  }

  /**
   * 解析音频路径（mock TTS 返回远程 URL，MVP 生成静音替代）
   */
  resolveAudioPath(audioUrl) {
    if (audioUrl.startsWith('/storage/')) {
      const resolved = path.resolve(STORAGE_DIR, audioUrl.replace('/storage/', ''))
      const root = path.resolve(STORAGE_DIR) + path.sep
      return resolved.startsWith(root) ? resolved : null
    }
    return path.join(STORAGE_DIR, 'audio', path.basename(audioUrl))
  }

  /**
   * 清理临时文件
   */
  _cleanupTempFiles(exportId) {
    const prefix = path.join(TEMP_DIR, exportId)
    try {
      for (const ext of ['_concat.mp4', '_audio.aac', '_merged.mp4', '_subtitled.mp4', '.srt']) {
        const filePath = prefix + ext
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
      }
    } catch (error) {
      logger.warn('Temp file cleanup error:', error.message)
    }
  }
}

export const videoCompositingService = new VideoCompositingService()
export default videoCompositingService
