import { generateId } from '../utils/idGenerator.js'

/**
 * 季（Sprint 21 / S21-1）
 * 按大事件/内容分块；每季 ≥ 200 集。
 */
export class Season {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.seasonNo = data.seasonNo ?? 1
    this.title = data.title || ''
    this.synopsis = data.synopsis || ''
    this.episodeCount = data.episodeCount ?? 0
    this.chapterStart = data.chapterStart ?? null
    this.chapterEnd = data.chapterEnd ?? null
    this.createdAt = data.createdAt || new Date().toISOString()
  }

  toJSON() {
    return { ...this }
  }
}
