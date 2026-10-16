import { generateId } from '../utils/idGenerator.js'

/** 设定图类别（为图生视频预先成套产出） */
export const ASSET_CATEGORIES = ['character', 'clothing', 'equipment', 'architecture', 'scene', 'prop', 'other']

export const ASSET_CATEGORY_LABELS = {
  character: '角色',
  clothing: '衣物',
  equipment: '装备',
  architecture: '建筑',
  scene: '场景',
  prop: '道具',
  other: '其他',
}

/**
 * 小说设定图（Sprint 28）
 * 一部小说的成套设定图：角色/衣物/装备/建筑/场景/道具…，供后续图生视频复用。
 */
export class NovelAssetImage {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.category = ASSET_CATEGORIES.includes(data.category) ? data.category : 'other'
    this.name = data.name || ''
    this.prompt = data.prompt || ''
    this.source = data.source || 'manual' // manual | character | entity
    this.sourceId = data.sourceId || null
    this.status = data.status || 'draft' // draft | generated | failed
    this.imageUrl = data.imageUrl || null
    this.filePath = data.filePath || null
    this.provider = data.provider || null
    this.error = data.error || null
    this.meta = data.meta && typeof data.meta === 'object' ? data.meta : {}
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || this.createdAt
  }

  toJSON() {
    return { ...this }
  }
}
