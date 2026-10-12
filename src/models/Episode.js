import { generateId } from '../utils/idGenerator.js'

/**
 * 集（Sprint 21 / S21-2）
 * 1 章 ≥ 1 集；每集目标 85–95s（成片秒数）。剧本文本另存磁盘，集内只存分镜剧本与引用。
 */
export class Episode {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.seasonId = data.seasonId
    this.episodeNo = data.episodeNo ?? 1
    this.chapterIndex = data.chapterIndex ?? null
    this.chapterTitle = data.chapterTitle || ''
    this.title = data.title || ''
    this.targetSeconds = data.targetSeconds ?? 90
    this.sourceFile = data.sourceFile || '' // 相对 novels/<id>/ 的源文本路径
    this.screenplay = data.screenplay || null // { shots:[{index,description,dialogue,duration}], totalSeconds }
    this.status = data.status || 'planned' // planned | scripted
    this.createdAt = data.createdAt || new Date().toISOString()
  }

  toJSON() {
    return { ...this }
  }
}
