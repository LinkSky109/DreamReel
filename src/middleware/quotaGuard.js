import { quotaService } from '../services/quotaService.js'
import { ANONYMOUS_USER_ID } from './identity.js'

/**
 * LLM 付费端点额度闸门。
 * - 匿名（default）不消耗额度：下游 providerResolver 会强制 mock
 * - 登录用户超出每日额度返回 429
 * - 未登录且匿名被关闭时由 authGate 先行 401
 */
export function requireLlmQuota(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: '未登录，请先登录' })
  }
  if (req.userId === ANONYMOUS_USER_ID) {
    return next()
  }

  const check = quotaService.checkLlmQuota(req.userId)
  if (!check.allowed) {
    res.setHeader('Retry-After', String(60 * 60))
    return res.status(429).json({
      error: check.reason,
      code: 'QUOTA_EXCEEDED',
      quota: { used: check.used, limit: check.limit, remaining: check.remaining },
    })
  }

  quotaService.consumeLlmQuota(req.userId)
  return next()
}

export default requireLlmQuota
