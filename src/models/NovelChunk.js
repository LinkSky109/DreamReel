import { generateId } from '../utils/idGenerator.js'

/**
 * 小说切片（Sprint 19 / S19-3）
 * 按章节切分后的一段原文。
 *
 * 新数据只存偏移（startOffset/endOffset），正文从 source/cleaned.txt 切片；
 * text 字段保留用于兼容旧数据与内存水合。
 */
export class NovelChunk {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.index = data.index ?? 0
    this.chapterTitle = data.chapterTitle || ''
    this.text = data.text || ''
    this.wordCount = data.wordCount ?? this.text.length
    // 偏移（新）：相对 source/cleaned.txt 的 UTF-16 code unit
    this.startOffset = data.startOffset ?? null
    this.endOffset = data.endOffset ?? null
    this.cleanedHash = data.cleanedHash || ''
  }

  toJSON() {
    return { ...this }
  }
}
