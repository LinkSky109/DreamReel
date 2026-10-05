import { BaseVideoProvider } from './baseVideoProvider.js'
import logger from '../utils/logger.js'

/**
 * Runway 视频生成 Provider
 * 文档：https://docs.runwayml.com/
 * 支持 Gen-3 Alpha 和 Gen-2 模型
 */
export class RunwayVideoProvider extends BaseVideoProvider {
  constructor(config) {
    super(config)
    this.name = 'runway'
    this.apiKey = config.runwayApiKey
    this.baseUrl = 'https://api.runwayml.com/v1'
    this.model = config.model || 'gen3a_turbo'
    this.maxRetries = config.maxRetries || 3
    this.pollInterval = config.pollInterval || 5000
  }

  supportsReferenceImages() {
    return true // Runway Gen-3 支持 image-to-video
  }

  async generateVideo(params) {
    try {
      if (!this.apiKey) {
        throw new Error('Runway API key not configured. Set RUNWAY_API_KEY environment variable.')
      }

      const body = {
        model: this.model,
        prompt: params.prompt,
        duration: params.duration || 5,
        ratio: params.aspectRatio === '9:16' ? '9:16' : '16:9',
      }

      // 参考图注入（角色一致性）
      if (params.referenceImages && params.referenceImages.length > 0) {
        body.runway_image = params.referenceImages[0]
        if (params.referenceImages.length > 1) {
          body.runway_image_end = params.referenceImages[1]
        }
      }

      // 风格修饰词
      if (params.styleModifier) {
        body.prompt = `${params.prompt}, ${params.styleModifier}`
      }

      logger.info(`Runway generateVideo: model=${this.model}, duration=${body.duration}, ratio=${body.ratio}`)

      const response = await fetch(`${this.baseUrl}/textToVideo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Runway API error ${response.status}: ${errorText}`)
        throw new Error(`Runway API error ${response.status}: ${errorText}`)
      }

      const data = await response.json()
      logger.info(`Runway task created: ${data.id}`)
      return { taskId: data.id, status: 'generating' }
    } catch (error) {
      logger.error('Runway generateVideo failed:', error.message)
      throw error
    }
  }

  async getTaskStatus(taskId) {
    try {
      if (!this.apiKey) {
        throw new Error('Runway API key not configured.')
      }

      const response = await fetch(`${this.baseUrl}/textToVideo/${taskId}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error(`Runway status API error ${response.status}: ${errorText}`)
        return { status: 'failed', error: `API error ${response.status}: ${errorText}` }
      }

      const data = await response.json()

      // Runway 状态映射
      const statusMap = {
        RUNWAY_STATUS_PENDING: 'pending',
        RUNWAY_STATUS_RUNNING: 'generating',
        RUNWAY_STATUS_SUCCEEDED: 'completed',
        RUNWAY_STATUS_FAILED: 'failed',
        RUNWAY_STATUS_CANCELLED: 'cancelled',
      }

      const status = statusMap[data.status] || 'generating'
      const videoUrl = data.output?.[0] || null
      const error = data.failure || null

      if (status === 'completed') {
        logger.info(`Runway task completed: ${taskId}`)
      } else if (status === 'failed') {
        logger.error(`Runway task failed: ${taskId}, error: ${error}`)
      }

      return { status, videoUrl, error }
    } catch (error) {
      logger.error('Runway getTaskStatus failed:', error.message)
      return { status: 'failed', error: error.message }
    }
  }

  async cancelTask(taskId) {
    try {
      if (!this.apiKey) {
        throw new Error('Runway API key not configured.')
      }

      const response = await fetch(`${this.baseUrl}/textToVideo/${taskId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}` },
      })

      if (!response.ok) {
        throw new Error(`Cancel failed: ${response.status}`)
      }

      logger.info(`Runway task cancelled: ${taskId}`)
      return { success: true }
    } catch (error) {
      logger.error('Runway cancelTask failed:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * 等待任务完成（带超时）
   */
  async waitForCompletion(taskId, timeoutMs = 300000) {
    const startTime = Date.now()
    while (Date.now() - startTime < timeoutMs) {
      const status = await this.getTaskStatus(taskId)
      if (status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled') {
        return status
      }
      await new Promise((resolve) => setTimeout(resolve, this.pollInterval))
    }
    return { status: 'failed', error: 'Timeout waiting for video generation' }
  }
}

export default RunwayVideoProvider
