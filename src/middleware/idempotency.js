import { fail } from '../http/respond.js'

/**
 * Idempotency-Key 支持（进程内实现，Redis 版在 Phase 7 替换）。
 *
 * 语义：
 * - 仅对 POST/PUT/PATCH/DELETE 且带 Idempotency-Key 的请求生效；
 * - 同一 key + 方法 + 路径 + 用户 视为同一操作；
 * - 处理中重复请求返回 409 IDEMPOTENCY_IN_PROGRESS；
 * - 已完成请求重放原状态码与响应体，并带 Idempotent-Replayed: true；
 * - 5xx 不缓存，允许客户端重试。
 */
const entries = new Map() // key -> { state, status, body, expiresAt }
let sweeper = null

function sweep() {
  const now = Date.now()
  for (const [key, entry] of entries) {
    if (entry.expiresAt <= now) entries.delete(key)
  }
}

export function resetIdempotency() {
  entries.clear()
}

export function idempotency({ ttlMs = 24 * 60 * 60 * 1000 } = {}) {
  if (!sweeper) {
    sweeper = setInterval(sweep, 60_000)
    sweeper.unref?.()
  }
  return (req, res, next) => {
    const raw = req.get('idempotency-key')
    if (!raw || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
    if (raw.length > 200) return fail(res, 400, 'BAD_REQUEST', 'Idempotency-Key 过长')

    const identity = req.auth?.userId || req.ip || 'anonymous'
    const key = `${req.method}:${req.baseUrl}${req.path}:${identity}:${raw}`
    const now = Date.now()
    const existing = entries.get(key)

    if (existing && existing.expiresAt > now) {
      if (existing.state === 'pending') {
        return fail(res, 409, 'CONFLICT', '相同 Idempotency-Key 的请求正在处理中')
      }
      res.setHeader('Idempotent-Replayed', 'true')
      return res.status(existing.status).json(existing.body)
    }

    entries.set(key, { state: 'pending', expiresAt: now + ttlMs })

    const originalJson = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode < 500) {
        entries.set(key, { state: 'done', status: res.statusCode, body, expiresAt: Date.now() + ttlMs })
      } else {
        entries.delete(key)
      }
      return originalJson(body)
    }
    return next()
  }
}
