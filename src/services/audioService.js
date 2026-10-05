/**
 * 音频服务
 * 管理 BGM 库、音效库，提供查询和推荐功能
 */
import { BGM_LIBRARY, BGM_EMOTIONS, recommendBgmEmotion } from '../config/bgmLibrary.js'
import { SFX_LIBRARY, SFX_CATEGORIES } from '../config/sfxLibrary.js'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const STORAGE_DIR = path.resolve(__dirname, '../../storage')

export class AudioService {
  constructor() {
    this.bgmDir = path.join(STORAGE_DIR, 'audio', 'bgm')
    this.sfxDir = path.join(STORAGE_DIR, 'audio', 'sfx')
    this._ensureDirs()
  }

  _ensureDirs() {
    for (const dir of [this.bgmDir, this.sfxDir]) {
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
}

export const audioService = new AudioService()
export default audioService
