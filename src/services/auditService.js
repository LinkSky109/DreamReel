import { storageService } from './storageService.js'
import logger from '../utils/logger.js'

/**
 * R20：审计日志服务
 * 记录关键操作，支持查询与过滤
 */

const MAX_AUDIT_ENTRIES = 2000

export class AuditService {
  _load() {
    return storageService.get('auditLogs') || []
  }

  _save(logs) {
    // 超出上限保留最新
    const trimmed = logs.slice(-MAX_AUDIT_ENTRIES)
    storageService.set('auditLogs', trimmed)
  }

  /**
   * 记录一条审计日志
   */
  record({ actor = 'system', action, resourceType = '', resourceId = '', details = {}, ip = '', result = 'success' }) {
    if (!action) throw new Error('audit action required')
    const logs = this._load()
    const entry = {
      id: `aud_${Date.now()}_${logs.length}`,
      actor,
      action,
      resourceType,
      resourceId,
      details,
      ip,
      result,
      timestamp: new Date().toISOString(),
    }
    logs.push(entry)
    this._save(logs)
    logger.debug(`Audit: ${actor} ${action} ${resourceType}/${resourceId}`)
    return entry
  }

  /**
   * 查询审计日志
   */
  list({ actor, action, resourceType, result, from, to, limit = 100 } = {}) {
    let logs = this._load()
    if (actor) logs = logs.filter((l) => l.actor === actor)
    if (action) logs = logs.filter((l) => l.action === action)
    if (resourceType) logs = logs.filter((l) => l.resourceType === resourceType)
    if (result) logs = logs.filter((l) => l.result === result)
    if (from) logs = logs.filter((l) => new Date(l.timestamp) >= new Date(from))
    if (to) logs = logs.filter((l) => new Date(l.timestamp) <= new Date(to))
    logs = logs.slice(-limit).reverse()
    return { total: logs.length, items: logs }
  }

  /**
   * 按动作类型统计
   */
  actionStats() {
    const stats = {}
    for (const l of this._load()) {
      stats[l.action] = (stats[l.action] || 0) + 1
    }
    return stats
  }
}

export const auditService = new AuditService()
export default auditService
