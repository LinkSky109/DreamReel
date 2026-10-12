import { generateId } from '../utils/idGenerator.js'

/**
 * 小说切片（Sprint 19 / S19-3）
 * 按章节切分后的一段原文。
 */
export class NovelChunk {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.index = data.index ?? 0
    this.chapterTitle = data.chapterTitle || ''
    this.text = data.text || ''
    this.wordCount = data.wordCount ?? this.text.length
  }

  toJSON() {
    return { ...this }
  }
}
