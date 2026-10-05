import { BaseVideoProvider } from './baseVideoProvider.js'
import logger from '../utils/logger.js'

/**
 * Pika 视频生成 Provider
 * 文档：https://docs.pika.art/
 * 支持 Pika 1.0 和 Pika 2.0 模型
 */
export class PikaVideoProvider extends BaseVideoProvider {
  constructor(config) {
    super(config)
    this.name = 'pika'
    this.apiKey = config.pikaApiKey
    this.baseUrl = 'https://api.pika.art/v1'
    this.model = config.model || 'pika-1.0'
    this.pollInterval = config.pollInterval || 5000
  }

  supportsReferenceImages() {
    return true // Pika 支持 image-to-video
  }

  async generateVideo(params) {
    try {
      if (!this.apiKey) {
        throw new Error('Pika API key not configured. Set PIKA_API_KEY environment variable.')
      }

      const body = {
        model: this.model,
        prompt: params.prompt,
        duration: params.duration || 5,
        aspect_ratio: params.aspectRatio === '9:16' ? '9:16' : '16:9',
      }

      // 参考图注入
      if (params.referenceImages && params.referenceImages.length > 0) {
        body.image = params.referenceImages[0]
      }

      // 风格修饰词
      if (params.styleModifier) {
        body.prompt = `${params.prompt}, ${params.styleModifier}`
      }

      logger.info(`Pika generateVideo: model=${this.model}, duration=${body.duration}`)

      const response = await fetch(`${this.baseUrl}/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Pika API error ${response.status}: ${errorText}`)
        throw new Error(`Pika API error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      logger.info(`Pika task created: ${data.id}`)
      return { taskId: data.id, status: 'generating' }
    } catch (error) {
      logger.error('Pika generateVideo failed:', error.message)
      throw error
    }
  }

  async getTaskStatus(taskId) {
    try {
      if (!this.apiKey) {
        throw new Error('Pika API key not configured.')
      }

      const response = await fetch(`${this.baseUrl}/generations/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      if (!response.ok) {
        return { status: 'failed', error: `API error ${response.status}` }
      }

      const data = await response.json()

      // Pika 状态映射
      const statusMap = {
        queued: 'pending',
        processing: 'generating',
        completed: 'completed',
        failed: 'failed',
        cancelled: 'cancelled',
      }

      const status = statusMap[data.status] || 'generating'
      const videoUrl = data.video_url || data.output?.video || null
      const error = data.error || null

      return { status, videoUrl, error }
    } catch (error) {
      logger.error('Pika getTaskStatus failed:', error.message)
      return { status: 'failed', error: error.message }
    }
  }

  async cancelTask(taskId) {
    try {
      const response = await fetch(`${this.baseUrl}/generations/${taskId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      if (!response.ok) {
        throw new Error(`Cancel failed: ${response.status}`)
      }

      return { success: true }
    } catch (error) {
      logger.error('Pika cancelTask failed:', error.message)
      return { success: false, error: error.message }
    }
  }
}

export default PikaVideoProvider
