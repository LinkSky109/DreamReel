import { generateId } from '../utils/idGenerator.js'

/**
 * 角色模型 — 用于角色一致性保持
 * 存储角色特征向量、参考图、外貌描述与造型信息
 * R23: 新增 wardrobe / makeup / styling 造型室字段（对标 LibTV「角色造型室」）
 */
export class Character {
  constructor({
    id, name, description, referenceImages, featureVector, projectId,
    wardrobe, makeup, styling,
    createdAt, updatedAt,
  }) {
    this.id = id || generateId()
    this.name = name
    this.description = description || ''
    this.referenceImages = referenceImages || []
    this.featureVector = featureVector || null
    this.projectId = projectId
    // R23 造型室
    this.wardrobe = wardrobe || ''      // 服装："米色风衣+白衬衫+黑色西裤"
    this.makeup = makeup || ''          // 妆容："素颜感、淡眉、裸色唇"
    this.styling = styling || ''        // 整体造型："通勤干练/古风仙侠/赛博朋克"
    this.isLocked = !!featureVector || this.referenceImages.length > 0
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
  }

  addReferenceImage(imageUrl) {
    if (!this.referenceImages.includes(imageUrl)) {
      this.referenceImages.push(imageUrl)
      this.isLocked = true
      this.updatedAt = new Date().toISOString()
    }
    return this
  }

  setFeatureVector(vector) {
    this.featureVector = vector
    this.isLocked = true
    this.updatedAt = new Date().toISOString()
    return this
  }

  /**
   * R23: 更新造型信息
   */
  updateStyling({ wardrobe, makeup, styling } = {}) {
    if (wardrobe !== undefined) this.wardrobe = wardrobe
    if (makeup !== undefined) this.makeup = makeup
    if (styling !== undefined) this.styling = styling
    this.updatedAt = new Date().toISOString()
    return this
  }

  /**
   * R23: 拼装造型提示词片段（注入视频生成 prompt）
   */
  buildStylingPrompt() {
    const parts = []
    if (this.styling) parts.push(`造型风格:${this.styling}`)
    if (this.wardrobe) parts.push(`服装:${this.wardrobe}`)
    if (this.makeup) parts.push(`妆容:${this.makeup}`)
    return parts.join('，')
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      referenceImages: this.referenceImages,
      isLocked: this.isLocked,
      projectId: this.projectId,
      wardrobe: this.wardrobe,
      makeup: this.makeup,
      styling: this.styling,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

export default Character
