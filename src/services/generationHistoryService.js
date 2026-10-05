import logger from '../utils/logger.js'
import { storageService } from './storageService.js'

/**
 * 视频生成历史记录服务
 * 记录每次视频生成的详细信息，方便调试和回溯
 */

const MAX_HISTORY_PER_PROJECT = 100
const MAX_HISTORY_TOTAL = 1000

class GenerationHistoryService {
  constructor() {
    this.history = []
    this._load()
  }

  _load() {
    try {
      const data = storageService.data.generationHistory || []
      this.history = data
    } catch (error) {
      logger.warn('Failed to load generation history:', error.message)
      this.history = []
    }
  }

  _persist() {
    try {
      // 限制总记录数
      if (this.history.length > MAX_HISTORY_TOTAL) {
        this.history = this.history.slice(-MAX_HISTORY_TOTAL)
      }
      storageService.data.generationHistory = this.history
      storageService.save()
    } catch (error) {
      logger.error('Failed to persist generation history:', error.message)
    }
  }

  /**
   * 记录一次生成
   */
  recordGeneration({ projectId, shotId, prompt, provider, status, durationMs, error, style, resolution, userId }) {
    try {
      const record = {
        id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        projectId,
        shotId: shotId || null,
        prompt: prompt || '',
        provider: provider || 'unknown',
        status: status || 'completed', // completed / failed / cancelled
        durationMs: durationMs || 0,
        error: error || null,
        style: style || null,
        resolution: resolution || null,
        userId: userId || 'default',
        createdAt: new Date().toISOString(),
      }

      this.history.push(record)

      // 限制每个项目的记录数
      const projectHistory = this.history.filter((h) => h.projectId === projectId)
      if (projectHistory.length > MAX_HISTORY_PER_PROJECT) {
        const toRemove = projectHistory.length - MAX_HISTORY_PER_PROJECT
        const removeIds = new Set(
          projectHistory
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .slice(0, toRemove)
            .map((h) => h.id)
        )
        this.history = this.history.filter((h) => !removeIds.has(h.id))
      }

      this._persist()
      logger.info(`Generation recorded: ${record.id} for shot ${shotId} - ${status}`)
      return record
    } catch (error) {
      logger.error('Failed to record generation:', error.message)
      return null
    }
  }

  /**
   * 获取项目的生成历史
   */
  getProjectHistory(projectId, { limit = 50, offset = 0, status, provider } = {}) {
    let list = this.history.filter((h) => h.projectId === projectId)

    if (status) {
      list = list.filter((h) => h.status === status)
    }
    if (provider) {
      list = list.filter((h) => h.provider === provider)
    }

    list.sort((a, b) => {
      const timeDiff = new Date(b.createdAt) - new Date(a.createdAt)
      if (timeDiff !== 0) return timeDiff
      // 同一毫秒内创建的，用 id 排序（id 包含时间戳和随机数）
      return b.id.localeCompare(a.id)
    })

    return {
      total: list.length,
      items: list.slice(offset, offset + limit),
    }
  }

  /**
   * 获取镜头的生成历史
   */
  getShotHistory(shotId, { limit = 20 } = {}) {
    const list = this.history
      .filter((h) => h.shotId === shotId)
      .sort((a, b) => {
        const timeDiff = new Date(b.createdAt) - new Date(a.createdAt)
        if (timeDiff !== 0) return timeDiff
        return b.id.localeCompare(a.id)
      })
    return list.slice(0, limit)
  }

  /**
   * 获取用户的生成历史
   */
  getUserHistory(userId, { limit = 50, offset = 0 } = {}) {
    const list = this.history
      .filter((h) => h.userId === userId)
      .sort((a, b) => {
        const timeDiff = new Date(b.createdAt) - new Date(a.createdAt)
        if (timeDiff !== 0) return timeDiff
        return b.id.localeCompare(a.id)
      })
    return {
      total: list.length,
      items: list.slice(offset, offset + limit),
    }
  }

  /**
   * 获取生成统计
   */
  getStats(projectId) {
    const projectHistory = this.history.filter((h) => h.projectId === projectId)

    const total = projectHistory.length
    const completed = projectHistory.filter((h) => h.status === 'completed').length
    const failed = projectHistory.filter((h) => h.status === 'failed').length
    const cancelled = projectHistory.filter((h) => h.status === 'cancelled').length

    const completedDurations = projectHistory
      .filter((h) => h.status === 'completed' && h.durationMs > 0)
      .map((h) => h.durationMs)

    const avgDuration =
      completedDurations.length > 0
        ? Math.round(completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length)
        : 0

    const providerStats = {}
    for (const h of projectHistory) {
      if (!providerStats[h.provider]) {
        providerStats[h.provider] = { total: 0, completed: 0, failed: 0 }
      }
      providerStats[h.provider].total++
      if (h.status === 'completed') providerStats[h.provider].completed++
      if (h.status === 'failed') providerStats[h.provider].failed++
    }

    return {
      total,
      completed,
      failed,
      cancelled,
      successRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDurationMs: avgDuration,
      avgDurationSec: (avgDuration / 1000).toFixed(1),
      providerStats,
    }
  }

  /**
   * 清除项目的生成历史
   */
  clearProjectHistory(projectId) {
    const before = this.history.length
    this.history = this.history.filter((h) => h.projectId !== projectId)
    const removed = before - this.history.length
    this._persist()
    return { removed }
  }

  /**
   * 删除单条历史记录
   */
  deleteRecord(recordId) {
    const before = this.history.length
    this.history = this.history.filter((h) => h.id !== recordId)
    const removed = before - this.history.length
    if (removed > 0) this._persist()
    return { removed }
  }
}

export const generationHistoryService = new GenerationHistoryService()
export default generationHistoryService
