import config from '../config/index.js'
import { writeAudit } from '../services/auditLogService.js'

const SKIP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * 写操作审计：只记录已认证用户的非 GET 请求。
 * 不记录请求体，避免凭证/正文进入审计库。
 */
export function auditWrites(req, res, next) {
  if (!config.audit.enabled || SKIP_METHODS.has(req.method) || !req.user) return next()
  const started = Date.now()
  res.on('finish', () => {
    const fullPath = `${req.baseUrl}${req.path}`
    const segments = fullPath.split('/').filter(Boolean)
    writeAudit({
      orgId: req.auth?.orgId || req.user.orgId || 'default',
      actorId: req.user.id || req.user.userId,
      action: `${req.method} ${fullPath}`,
      resourceType: segments[1] || '',
      resourceId: req.params?.id || null,
      requestId: req.id,
      ip: req.ip,
      metadata: {
        status: res.statusCode,
        durationMs: Date.now() - started,
      },
    }).catch(() => {})
  })
  return next()
}

export default { auditWrites }
