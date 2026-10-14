import { generateId } from '../utils/idGenerator.js'

/** 阶段顺序：进入更靠后的阶段后，之前的阶段锁定（不可修改/重新生成） */
export const STAGES = ['source', 'characters', 'world', 'series', 'episodes', 'assets', 'compose']

/**
 * 小说项目（Sprint 19+）
 * 一部小说 = 一个项目；含阶段进度、备选集合与选定项。
 */
export class NovelProject {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.title = data.title || ''
    this.author = data.author || ''
    this.category = data.category || ''
    this.sourceType = data.sourceType || 'text' // text | qishuxia-txt | qishuxia-chapters
    this.sourceRef = data.sourceRef || ''
    this.style = data.style || { scope: 'book', name: '', description: '' }
    // 阶段进度（进入下一阶段后，之前的阶段锁定）
    this.stage = STAGES.includes(data.stage) ? data.stage : 'source'
    this.status = data.status || 'created'
    this.dir = data.dir || ''
    this.counts = data.counts || { chapters: 0, characters: 0 }
    // 备选集合（多次生成）与选定项
    this.characterSets = Array.isArray(data.characterSets) ? data.characterSets : []
    this.selectedCharacterSet = data.selectedCharacterSet || null
    this.worldSets = Array.isArray(data.worldSets) ? data.worldSets : []
    this.selectedWorldSet = data.selectedWorldSet || null
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || this.createdAt
  }

  toJSON() {
    return { ...this }
  }
}
