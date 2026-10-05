import { BaseVideoProvider } from './baseVideoProvider.js'
import logger from '../utils/logger.js'

/**
 * Seedance 视频生成 Provider（字节跳动 / 火山引擎方舟）
 * 对标 LibTV 集成的 Seedance 2.5
 * 文档：https://www.volcengine.com/docs/82379
 */
export class SeedanceVideoProvider extends BaseVideoProvider {
  constructor(config) {
    super(config)
    this.name = 'seedance'
    this.apiKey = config.seedanceApiKey
    this.baseUrl = config.seedanceBaseUrl || 'https://ark.cn-beijing.volces.com/api/v3'
    this.model = config.seedanceModel || 'seedance-2.5'
    this.pollInterval = 5000
  }

  supportsReferenceImages() {
    return true
  }

  async generateVideo(params) {
    if (!this.apiKey) {
      throw new Error('Seedance API key not configured. Set SEEDANCE_API_KEY environment variable.')
    }

    const body = {
      model: this.model,
      content: [
        { type: 'text', text: params.prompt || '' },
      ],
      duration: params.duration || 5,
      aspect_ratio: params.aspectRatio === '9:16' ? '9:16' : '16:9',
      resolution: params.resolution || '720p',
    }

    if (params.referenceImages?.length) {
      body.content.push({ type: 'image_url', image_url: { url: params.referenceImages[0] } })
    }

    logger.info(`Seedance generateVideo: model=${this.model}, duration=${body.duration}`)

    const resp = await fetch(`${this.baseUrl}/contents/generations/tasks`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Seedance API error ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    return { taskId: data.id, status: 'generating' }
  }

  async getTaskStatus(taskId) {
    if (!this.apiKey) return { status: 'failed', error: 'Seedance API key not configured.' }

    const resp = await fetch(`${this.baseUrl}/contents/generations/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })

    if (!resp.ok) return { status: 'failed', error: `API error ${resp.status}` }

    const data = await resp.json()
    const statusMap = { queued: 'pending', running: 'generating', succeeded: 'completed', failed: 'failed', cancelled: 'cancelled' }
    const status = statusMap[data.status] || 'generating'
    return { status, videoUrl: data.content?.video_url || null, error: data.error?.message || null }
  }

  async cancelTask(taskId) {
    if (!this.apiKey) return { success: false, error: 'No API key' }
    await fetch(`${this.baseUrl}/contents/generations/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    return { success: true }
  }
}

export default SeedanceVideoProvider
