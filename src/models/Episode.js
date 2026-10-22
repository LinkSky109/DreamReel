import { generateId } from '../utils/idGenerator.js'

/**
 * 集（Sprint 21 / S21-2）
 * 1 章 ≥ 1 集；每集目标 85–95s（成片秒数）。
 *
 * 新数据只存偏移（startOffset/endOffset），正文从 source/cleaned.txt 切片；
 * sourceFile 保留用于兼容旧数据。
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
    this.sourceFile = data.sourceFile || '' // 兼容旧数据：相对 novels/<id>/ 的源文本路径
    this.screenplay = data.screenplay || null // { shots:[{index,description,dialogue,duration}], totalSeconds }
    this.status = data.status || 'planned' // planned | scripted | assets | composed
    // 偏移（新）：一集可跨章，正文为 cleaned.txt 的连续片段
    this.chapterStart = data.chapterStart ?? null
    this.chapterEnd = data.chapterEnd ?? null
    this.startOffset = data.startOffset ?? null
    this.endOffset = data.endOffset ?? null
    this.estimatedSeconds = data.estimatedSeconds ?? null
    this.cleanedHash = data.cleanedHash || ''
    // 懒生成的分集大纲
    this.outline = data.outline || null
    // 源文本过短（整季 < 85s 时退回 1 章 1 集）
    this.shortSource = data.shortSource === true
    this.createdAt = data.createdAt || new Date().toISOString()
  }

  toJSON() {
    return { ...this }
  }
}
