import { BaseVideoProvider } from './baseVideoProvider.js'
import ffmpeg from '../utils/ffmpeg.js'
import config from '../config/index.js'
import path from 'path'
import fs from 'fs'
import logger from '../utils/logger.js'

const VIDEOS_DIR = path.join(config.storage.path, 'videos')

// 确保目录存在
if (!fs.existsSync(VIDEOS_DIR)) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true })
}

/**
 * Mock 视频生成 Provider
 * 使用 ffmpeg 生成真实占位视频，便于端到端测试合成导出流程
 */
export class MockVideoProvider extends BaseVideoProvider {
  constructor(config) {
    super(config)
    this.name = 'mock'
    this.tasks = new Map()
  }

  supportsReferenceImages() {
    return true
  }

  async generateVideo(params) {
    const taskId = `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const outputPath = path.join(VIDEOS_DIR, `${taskId}.mp4`)
    const videoUrl = `/storage/videos/${taskId}.mp4`

    this.tasks.set(taskId, {
      status: 'generating',
      params,
      outputPath,
      videoUrl,
      createdAt: Date.now(),
    })

    // 异步生成占位视频
    this._generatePlaceholder(taskId, params, outputPath).catch((error) => {
      logger.error(`Mock video generation failed for ${taskId}:`, error.message)
      const task = this.tasks.get(taskId)
      if (task) {
        task.status = 'failed'
        task.error = error.message
      }
    })

    return { taskId, status: 'generating' }
  }

  async _generatePlaceholder(taskId, params, outputPath) {
    // 从 prompt 提取前 20 个字符作为画面文字
    const text = (params.prompt || 'DreamReel').slice(0, 20)
    const duration = params.duration || 5

    await ffmpeg.generatePlaceholder({
      outputPath,
      duration,
      text,
      resolution: params.resolution || '720p',
      aspectRatio: params.aspectRatio || '16:9',
    })

    const task = this.tasks.get(taskId)
    if (task) {
      task.status = 'completed'
      task.completedAt = Date.now()
      logger.info(`Mock video generated: ${taskId} (${duration}s)`)
    }
  }

  async getTaskStatus(taskId) {
    const task = this.tasks.get(taskId)
    if (!task) {
      return { status: 'not_found', error: 'Task not found' }
    }
    return {
      status: task.status,
      videoUrl: task.videoUrl,
      error: task.error,
    }
  }

  async cancelTask(taskId) {
    const task = this.tasks.get(taskId)
    if (task && task.status === 'generating') {
      task.status = 'cancelled'
      return { success: true }
    }
    return { success: false, reason: 'Task not in generating state' }
  }
}

export default MockVideoProvider
