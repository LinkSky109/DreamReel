import { generateId } from '../utils/idGenerator.js'

/**
 * 分镜（镜头）模型
 */
export const SHOT_STATUS = {
  PENDING: 'pending',
  GENERATING: 'generating',
  COMPLETED: 'completed',
  FAILED: 'failed',
}

export class Shot {
  constructor({
    id,
    projectId,
    index,
    shotType,
    description,
    dialogue,
    narration,
    duration,
    cameraMovement,
    characterIds,
    sceneId,
    referenceImages,
    videoUrl,
    status,
    consistencyScore,
    prompt,
    model,
    errorMessage,
    locked,
    versions,
    characterActions,
    directorGuidance,
    createdAt,
    updatedAt,
  }) {
    this.id = id || generateId()
    this.projectId = projectId
    this.index = index ?? 0
    this.shotType = shotType || 'medium' // close-up / medium / wide / extreme-wide
    this.description = description || ''
    this.dialogue = dialogue || ''
    this.narration = narration || ''
    this.duration = duration || 5
    this.cameraMovement = cameraMovement || 'static'
    this.characterIds = characterIds || []
    this.sceneId = sceneId || null
    this.referenceImages = Array.isArray(referenceImages) ? referenceImages : []
    this.videoUrl = videoUrl || null
    this.status = status || SHOT_STATUS.PENDING
    this.consistencyScore = consistencyScore ?? null
    this.prompt = prompt || ''
    this.model = model || ''
    this.errorMessage = errorMessage || ''
    this.locked = locked || false
    this.versions = versions || [] // [{ videoUrl, prompt, model, createdAt, consistencyScore }]
    this.characterActions = characterActions || {} // { characterId: { expression, action, position } }
    // R29：导演模式为该镜头生成的表演/节奏指导
    this.directorGuidance = directorGuidance || ''
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
  }

  updateStatus(status, extra = {}) {
    this.status = status
    if (extra.videoUrl) this.videoUrl = extra.videoUrl
    if (extra.errorMessage) this.errorMessage = extra.errorMessage
    if (extra.consistencyScore !== undefined) this.consistencyScore = extra.consistencyScore
    this.updatedAt = new Date().toISOString()
    return this
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      index: this.index,
      shotType: this.shotType,
      description: this.description,
      dialogue: this.dialogue,
      narration: this.narration,
      duration: this.duration,
      cameraMovement: this.cameraMovement,
      characterIds: this.characterIds,
      sceneId: this.sceneId,
      referenceImages: this.referenceImages,
      videoUrl: this.videoUrl,
      status: this.status,
      consistencyScore: this.consistencyScore,
      prompt: this.prompt,
      model: this.model,
      errorMessage: this.errorMessage,
      locked: this.locked,
      versions: this.versions,
      characterActions: this.characterActions,
      directorGuidance: this.directorGuidance,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

export default Shot
