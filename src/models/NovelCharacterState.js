import { generateId } from '../utils/idGenerator.js'

/**
 * 角色成长状态（Sprint 20 / S20-3；S32 扩展为「按集形象时间线」）
 * 按集锚点记录角色的外貌/装备/能力/伤势演进，供剧本与出图提示词按剧情时间点使用，
 * 避免「开局就穿终态装备」。
 *
 * - episodeNo：集号（1 起，全书唯一），作为时间线锚点
 * - appearance：该集应有外观（首次出现时从原文推导；之后由上一集 + 本集剧情增量更新）
 * - equipment：该集已持有的装备/道具（不允许出现尚未获得的）
 * - injuries：伤势/状态（如「右臂骨折」）
 * - abilities：该集能力阶段
 * - source：llm | manual | base
 */
export class NovelCharacterState {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.characterId = data.characterId
    this.episodeNo = data.episodeNo ?? data.chapterIndex ?? null // 时间线锚点（集号）
    this.chapterIndex = data.chapterIndex ?? data.episodeNo ?? null // 兼容旧字段
    this.chapterTitle = data.chapterTitle || ''
    this.appearance = data.appearance ?? data.appearanceDelta ?? ''
    this.appearanceDelta = data.appearanceDelta || ''
    this.equipment = data.equipment || ''
    this.injuries = data.injuries || ''
    this.abilities = data.abilities || ''
    this.relationships = data.relationships || ''
    this.note = data.note || ''
    this.source = data.source || 'llm'
    this.updatedAt = data.updatedAt || new Date().toISOString()
    this.createdAt = data.createdAt || new Date().toISOString()
  }

  toJSON() {
    return { ...this }
  }
}

export default NovelCharacterState
