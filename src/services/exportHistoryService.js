import { storageService } from './storageService.js'
import logger from '../utils/logger.js'
import fs from 'fs'
import { generateId } from '../utils/idGenerator.js'

/**
 * 导出历史服务
 * 记录每次导出的元数据
 */
export class ExportHistoryService {
  constructor() {
    if (!storageService.data.exports) storageService.data.exports = {}
  }

  /**
   * 记录一次导出
   */
  recordExport(projectId, { outputPath, outputUrl, duration, shotCount, hasAudio, hasSubtitles, format }) {
    if (!storageService.data.exports[projectId]) {
      storageService.data.exports[projectId] = []
    }

    const record = {
      id: generateId(),
      projectId,
      outputPath,
      outputUrl,
      duration,
      shotCount,
      hasAudio,
      hasSubtitles,
      format: format || 'mp4',
      fileSize: this._getFileSize(outputPath),
      exportedAt: new Date().toISOString(),
    }

    storageService.data.exports[projectId].push(record)
    // 只保留最近 20 条
    if (storageService.data.exports[projectId].length > 20) {
      storageService.data.exports[projectId] = storageService.data.exports[projectId].slice(-20)
    }
    storageService.save()
    logger.info(`Export recorded for project ${projectId}: ${duration}s`)
    return record
  }

  /**
   * 获取项目的导出历史
   */
  getExportHistory(projectId) {
    const history = storageService.data.exports[projectId] || []
    return history.sort((a, b) => new Date(b.exportedAt) - new Date(a.exportedAt))
  }

  /**
   * 删除单条导出记录（不删除文件）
   */
  deleteExportRecord(projectId, exportId) {
    const history = storageService.data.exports[projectId] || []
    const index = history.findIndex((e) => e.id === exportId)
    if (index === -1) {
      throw new Error(`Export record not found: ${exportId}`)
    }
    history.splice(index, 1)
    storageService.save()
    return { success: true }
  }

  /**
   * 清理项目的导出历史
   */
  cleanupProject(projectId) {
    delete storageService.data.exports[projectId]
    storageService.save()
  }

  _getFileSize(filePath) {
    try {
      const stats = fs.statSync(filePath)
      return stats.size
    } catch {
      return null
    }
  }
}

export const exportHistoryService = new ExportHistoryService()
export default exportHistoryService
