import { BaseVideoProvider } from './baseVideoProvider.js'
import logger from '../utils/logger.js'

/**
 * 通义万相视频生成 Provider（阿里云 DashScope）
 * 对标 LibTV 集成的 MaxWan 3.0
 * 文档：https://help.aliyun.com/zh/dashscope/
 */
export class WanVideoProvider extends BaseVideoProvider {
  constructor(config) {
    super(config)
    this.name = 'wan'
    this.apiKey = config.wanApiKey
    this.baseUrl = config.wanBaseUrl || 'https://dashscope.aliyuncs.com/api/v1'
    this.model = config.wanModel || 'wanx2.1-t2v-plus'
    this.pollInterval = 5000
  }

  supportsReferenceImages() {
    return true
  }

  async generateVideo(params) {
    if (!this.apiKey) {
      throw new Error('Wan API key not configured. Set WAN_API_KEY environment variable.')
    }

    const body = {
      model: this.model,
      input: {
        prompt: params.prompt || '',
      },
      parameters: {
        duration: params.duration || 5,
        aspect_ratio: params.aspectRatio === '9:16' ? '9:16' : '16:9',
        resolution: params.resolution || '720p',
      },
    }

    if (params.referenceImages?.length) {
      body.input.img_url = params.referenceImages[0]
    }

    logger.info(`Wan generateVideo: model=${this.model}`)

    const resp = await fetch(`${this.baseUrl}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: JSON.stringify(body),
    })

    if (!resp.ok) {
      const errText = await resp.text()
      throw new Error(`Wan API error ${resp.status}: ${errText}`)
    }

    const data = await resp.json()
    return { taskId: data.output?.task_id, status: 'generating' }
  }

  async getTaskStatus(taskId) {
    if (!this.apiKey) return { status: 'failed', error: 'Wan API key not configured.' }

    const resp = await fetch(`${this.baseUrl}/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })

    if (!resp.ok) return { status: 'failed', error: `API error ${resp.status}` }

    const data = await resp.json()
    const statusMap = { PENDING: 'pending', RUNNING: 'generating', SUCCEEDED: 'completed', FAILED: 'failed', CANCELED: 'cancelled' }
    const status = statusMap[data.output?.task_status] || 'generating'
    return { status, videoUrl: data.output?.video_url || null, error: data.output?.message || null }
  }

  async cancelTask(taskId) {
    if (!this.apiKey) return { success: false, error: 'No API key' }
    await fetch(`${this.baseUrl}/tasks/${taskId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
    })
    return { success: true }
  }
}

export default WanVideoProvider
