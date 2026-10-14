import { generateId } from '../utils/idGenerator.js'

/** 世界观实体类型 */
export const WORLD_TYPES = ['race', 'faction', 'event', 'item', 'culture', 'location', 'power', 'other']

export const WORLD_TYPE_LABELS = {
  race: '种族',
  faction: '势力',
  event: '重要事件',
  item: '装备',
  culture: '文化',
  location: '地点',
  power: '力量体系',
  other: '其他',
}

/**
 * 世界观实体（Sprint 25）
 */
export class WorldEntity {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.type = WORLD_TYPES.includes(data.type) ? data.type : 'other'
    this.name = data.name || ''
    this.aliases = Array.isArray(data.aliases) ? data.aliases : []
    this.description = data.description || ''
    this.attributes = data.attributes && typeof data.attributes === 'object' ? data.attributes : {}
    this.relations = Array.isArray(data.relations) ? data.relations : [] // [{ target, kind }]
    this.firstChapter = data.firstChapter ?? null
    this.mentions = data.mentions ?? 0
    this.provider = data.provider || 'heuristic'
    this.createdAt = data.createdAt || new Date().toISOString()
  }

  toJSON() {
    return { ...this }
  }
}
