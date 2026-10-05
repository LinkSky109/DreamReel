import { BaseVideoProvider } from './baseVideoProvider.js'
import logger from '../utils/logger.js'

/**
 * Minimax 视频生成 Provider（海螺 AI）
 * 对标 LibTV 集成的 Minimax H3
 * 文档：https://platform.minimaxi.com/document/Video%20Generation
 */
export class MinimaxVideoProvider extends BaseVideoProvider {
  constructor(config) {
    super(config)
    this.name = 'minimax'
    this.apiKey = config.minimaxApiKey
    this.groupId = config.minimaxGroupId
    this.baseUrl = config.minimaxBaseUrl || 'https://api.minimax.chat/v1'
    this.model = config.minimaxModel || 'video-01'
    this.pollInterval = 5000
  }

  supportsReferenceImages() {
    return true
  }

  async generateVideo(params) {
    if (!this.apiKey || !this.groupId) {
      throw new Error('Minimax API key / group id not configured. Set MINIMAX_API_KEY and MINIMAX_GROUP_ID.')
    }

    const body = {
      model: this.model,
      prompt: params.prompt || '',
      duration: params.duration || 5,
      aspect_ratio: params.aspectRatio === '9:16' ? '9:16' : '16:9',
      resolution: params.resolution || '720p',
    }

    if (params.referenceImages?.length) {
      body.first_frame_image = params.referenceImages[0]
    }

    logger.info(`Minimax generateVideo: model=${this.model}`)

    const resp = await fetch(`${this.baseUrl}/video_generation?GroupId=${this.groupId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Minimax API error ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    return { taskId: data.task_id, status: 'generating' }
  }

  async getTaskStatus(taskId) {
    if (!this.apiKey || !this.groupId) return { status: 'failed', error: 'Minimax not configured' }

    const resp = await fetch(`${this.baseUrl}/query/video_generation?task_id=${taskId}&GroupId=${this.groupId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })

    if (!resp.ok) return { status: 'failed', error: `API error ${resp.status}` }

    const data = await resp.json()
    const statusMap = { queue: 'pending', processing: 'generating', success: 'completed', fail: 'failed' }
    const status = statusMap[data.status] || 'generating'
    return { status, videoUrl: data.file?.download_url || data.videos?.[0]?.url || null, error: data.error_msg || null }
  }

  async cancelTask(taskId) {
    if (!this.apiKey || !this.groupId) return { success: false, error: 'Not configured' }
    await fetch(`${this.baseUrl}/cancel/video_generation?task_id=${taskId}&GroupId=${this.groupId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    return { success: true }
  }
}

export default MinimaxVideoProvider
