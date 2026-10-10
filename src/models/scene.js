import { generateId } from '../utils/idGenerator.js'

/**
 * 场景模型 — 用于场景一致性保持
 */
export class Scene {
  constructor({ id, name, description, referenceImages, environmentType, projectId, createdAt, updatedAt }) {
    this.id = id || generateId()
    this.name = name
    this.description = description || ''
    this.referenceImages = referenceImages || []
    this.environmentType = environmentType || 'indoor' // indoor / outdoor / specific
    this.projectId = projectId
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      referenceImages: this.referenceImages,
      environmentType: this.environmentType,
      projectId: this.projectId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

export default Scene
