import { generateId } from '../utils/idGenerator.js'

/**
 * 小说项目（Sprint 19 / S19-1）
 * 一部小说的顶层容器：来源、风格（全书统一）、状态、目录与计数。
 */
export class NovelProject {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.title = data.title || ''
    this.author = data.author || ''
    this.category = data.category || ''
    this.sourceType = data.sourceType || 'text' // text | qishuxia-txt | qishuxia-chapters
    this.sourceRef = data.sourceRef || ''
    // 风格：MVP 为全书统一
    this.style = data.style || { scope: 'book', name: '', description: '' }
    this.status = data.status || 'created' // created | ingested | extracted | reviewed
    this.dir = data.dir || ''
    this.counts = data.counts || { chapters: 0, characters: 0 }
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || this.createdAt
  }

  toJSON() {
    return { ...this }
  }
}
