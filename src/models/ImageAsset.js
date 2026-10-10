import { generateId } from '../utils/idGenerator.js'

/**
 * R32：图片生成资产
 * 独立于 project 持久化，避免项目对象继续膨胀；projectId 作为归属索引。
 */
export class ImageAsset {
  constructor({
    id,
    projectId,
    userId,
    prompt,
    enhancedPrompt,
    provider,
    model,
    size,
    width,
    height,
    aspectRatio,
    style,
    status,
    filePath,
    url,
    textRendered,
    errorMessage,
    createdAt,
    completedAt,
  } = {}) {
    this.id = id || `img_${Date.now()}_${generateId().slice(0, 8)}`
    this.projectId = projectId || null
    this.userId = userId || 'default'
    this.prompt = prompt || ''
    this.enhancedPrompt = enhancedPrompt || ''
    this.provider = provider || 'mock'
    this.model = model || 'mock'
    this.size = size || '1024x576'
    this.width = width || 1024
    this.height = height || 576
    this.aspectRatio = aspectRatio || '16:9'
    this.style = style || 'cinematic'
    this.status = status || 'generating'
    this.filePath = filePath || null
    this.url = url || null
    this.textRendered = textRendered === true
    this.errorMessage = errorMessage || ''
    this.createdAt = createdAt || new Date().toISOString()
    this.completedAt = completedAt || null
  }

  toJSON() {
    return {
      id: this.id,
      projectId: this.projectId,
      userId: this.userId,
      prompt: this.prompt,
      enhancedPrompt: this.enhancedPrompt,
      provider: this.provider,
      model: this.model,
      size: this.size,
      width: this.width,
      height: this.height,
      aspectRatio: this.aspectRatio,
      style: this.style,
      status: this.status,
      filePath: this.filePath,
      url: this.url,
      textRendered: this.textRendered,
      errorMessage: this.errorMessage,
      createdAt: this.createdAt,
      completedAt: this.completedAt,
    }
  }
}

export default ImageAsset
