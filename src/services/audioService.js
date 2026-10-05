/**
 * 音频服务
 * 管理 BGM 库、音效库，提供查询和推荐功能
 */
import { BGM_LIBRARY, BGM_EMOTIONS, recommendBgmEmotion } from '../config/bgmLibrary.js'
import { SFX_LIBRARY, SFX_CATEGORIES } from '../config/sfxLibrary.js'
import { dubbingService } from './dubbingService.js'
import ffmpeg from '../utils/ffmpeg.js'
import logger from '../utils/logger.js'
import config from '../config/index.js'
import path from 'path'
import fs from 'fs'

const STORAGE_DIR = path.resolve(config.storage.path)

export class AudioService {
  constructor() {
    this.bgmDir = path.join(STORAGE_DIR, 'audio', 'bgm')
    this.sfxDir = path.join(STORAGE_DIR, 'audio', 'sfx')
    this.previewDir = path.join(STORAGE_DIR, 'audio', 'previews')
    this._ensureDirs()
  }

  _ensureDirs() {
    for (const dir of [this.bgmDir, this.sfxDir, this.previewDir]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
  }

  /**
   * 获取 BGM 列表（支持按情绪筛选和搜索）
   */
  listBgm({ emotion = 'all', search = '' } = {}) {
    let list = [...BGM_LIBRARY]

    if (emotion !== 'all') {
      list = list.filter((b) => b.emotion === emotion)
    }

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          b.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    // 检查文件是否存在
    const items = list.map((b) => ({
      ...b,
      url: `/audio/bgm/${b.filename}`,
      available: fs.existsSync(path.join(this.bgmDir, b.filename)),
    }))

    return { items, total: items.length, emotions: BGM_EMOTIONS }
  }

  /**
   * 获取单个 BGM
   */
  getBgm(bgmId) {
    const bgm = BGM_LIBRARY.find((b) => b.id === bgmId)
    if (!bgm) return null
    return {
      ...bgm,
      url: `/audio/bgm/${bgm.filename}`,
      available: fs.existsSync(path.join(this.bgmDir, bgm.filename)),
    }
  }

  /**
   * AI 推荐 BGM（基于剧本文本）
   */
  recommendBgm(scriptText) {
    const emotion = recommendBgmEmotion(scriptText)
    const candidates = BGM_LIBRARY.filter((b) => b.emotion === emotion)
    return {
      emotion,
      emotionName: BGM_EMOTIONS.find((e) => e.id === emotion)?.name || emotion,
      recommendations: candidates.slice(0, 3).map((b) => ({
        ...b,
        url: `/audio/bgm/${b.filename}`,
        available: fs.existsSync(path.join(this.bgmDir, b.filename)),
      })),
    }
  }

  /**
   * 获取音效列表（支持按分类筛选和搜索）
   */
  listSfx({ category = 'all', search = '' } = {}) {
    let list = [...SFX_LIBRARY]

    if (category !== 'all') {
      list = list.filter((s) => s.category === category)
    }

    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    const items = list.map((s) => ({
      ...s,
      url: `/audio/sfx/${s.filename}`,
      available: fs.existsSync(path.join(this.sfxDir, s.filename)),
    }))

    return { items, total: items.length, categories: SFX_CATEGORIES }
  }

  /**
   * 获取单个音效
   */
  getSfx(sfxId) {
    const sfx = SFX_LIBRARY.find((s) => s.id === sfxId)
    if (!sfx) return null
    return {
      ...sfx,
      url: `/audio/sfx/${sfx.filename}`,
      available: fs.existsSync(path.join(this.sfxDir, sfx.filename)),
    }
  }

  /**
   * 获取音频库统计
   */
  getStats() {
    return {
      bgmTotal: BGM_LIBRARY.length,
      bgmAvailable: BGM_LIBRARY.filter((b) => fs.existsSync(path.join(this.bgmDir, b.filename))).length,
      sfxTotal: SFX_LIBRARY.length,
      sfxAvailable: SFX_LIBRARY.filter((s) => fs.existsSync(path.join(this.sfxDir, s.filename))).length,
      emotions: BGM_EMOTIONS.length,
      categories: SFX_CATEGORIES.length,
    }
  }

  /**
   * R33：生成真实混音预听文件（配音 + BGM + 音效），返回可播放 URL。
   */
  async previewMix(project, options = {}) {
    if (!project) throw new Error('project is required')
    const audioConfig = project.audioConfig || {}
    const duration = options.duration
      || (project.shots || []).reduce((sum, shot) => sum + (shot.duration || 5), 0)
      || 15
    const previewId = `preview_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const outputPath = path.join(this.previewDir, `${previewId}.m4a`)
    const tracks = []
    let dubbingResult = null
    let placeholderVoices = false

    try {
      dubbingResult = await dubbingService.generateDubbing({
        project,
        language: options.language || 'zh',
        voiceId: options.voiceId || 'zh_male_calm',
        speed: options.speed || 1.0,
        burnSubtitles: false,
        dialogueAssignments: project.dialogueAssignments,
        pauseSeconds: project.dialoguePause ?? 0.4,
      })
      placeholderVoices = dubbingResult?.placeholderVoices === true
    } catch (error) {
      logger.warn(`Dubbing skipped during audio preview: ${error.message}`)
    }

    const voicePaths = (dubbingResult?.audioTracks || [])
      .map((track) => this._resolveAudioPath(track.audioUrl))
      .filter((filePath) => filePath && fs.existsSync(filePath))

    if (voicePaths.length > 0) {
      const voicePath = voicePaths.length === 1
        ? voicePaths[0]
        : await ffmpeg.concatAudio(voicePaths, path.join(this.previewDir, `${previewId}_voice.m4a`))
      tracks.push({ path: voicePath, volume: audioConfig.voiceVolume ?? 1.0 })
    }

    if (audioConfig.bgmId) {
      const bgm = this.getBgm(audioConfig.bgmId)
      const bgmPath = bgm ? path.join(this.bgmDir, bgm.filename) : null
      if (bgmPath && fs.existsSync(bgmPath)) {
        const processed = path.join(this.previewDir, `${previewId}_bgm.m4a`)
        await ffmpeg.processBgm(bgmPath, processed, {
          duration,
          fadeIn: audioConfig.bgmFadeIn ?? 2,
          fadeOut: audioConfig.bgmFadeOut ?? 2,
        })
        tracks.push({ path: processed, volume: audioConfig.bgmVolume ?? 0.3 })
      }
    }

    for (const sfxId of audioConfig.sfxIds || []) {
      const sfx = this.getSfx(sfxId)
      const sfxPath = sfx ? path.join(this.sfxDir, sfx.filename) : null
      if (sfxPath && fs.existsSync(sfxPath)) {
        tracks.push({ path: sfxPath, volume: audioConfig.sfxVolume ?? 0.5 })
      }
    }

    if (tracks.length === 0) {
      await ffmpeg.generateSilence(outputPath, duration)
    } else if (tracks.length === 1) {
      await ffmpeg.adjustVolumeAndPad(tracks[0].path, outputPath, tracks[0].volume, duration)
    } else {
      await ffmpeg.mixAudioTracks(tracks, outputPath, duration)
    }

    return {
      previewId,
      url: `/storage/audio/previews/${previewId}.m4a`,
      duration,
      tracks: tracks.map((track) => ({ volume: track.volume })),
      placeholderVoices,
      ttsProvider: dubbingResult?.ttsProvider || 'none',
      generatedAt: new Date().toISOString(),
    }
  }

  _resolveAudioPath(audioUrl) {
    if (!audioUrl || !audioUrl.startsWith('/storage/')) return null
    const resolved = path.resolve(STORAGE_DIR, audioUrl.replace('/storage/', ''))
    const root = path.resolve(STORAGE_DIR) + path.sep
    return resolved.startsWith(root) ? resolved : null
  }
}

export const audioService = new AudioService()
export default audioService
