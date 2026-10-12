import { generateId } from '../utils/idGenerator.js'

/**
 * 角色成长状态（Sprint 20 / S20-3）
 * 按章节/集锚点记录角色的外貌/关系/能力演进。
 */
export class NovelCharacterState {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.characterId = data.characterId
    this.chapterIndex = data.chapterIndex ?? null // 章节/集锚点
    this.chapterTitle = data.chapterTitle || ''
    this.appearanceDelta = data.appearanceDelta || ''
    this.relationships = data.relationships || ''
    this.abilities = data.abilities || ''
    this.note = data.note || ''
    this.createdAt = data.createdAt || new Date().toISOString()
  }

  toJSON() {
    return { ...this }
  }
}
