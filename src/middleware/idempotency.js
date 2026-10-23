import { fail } from '../http/respond.js'
import { getRedisClient } from '../services/redisClient.js'

/**
 * Idempotency-Key 支持（默认进程内；配置 REDIS_URL 后多实例共享）。
 *
 * 语义：
 * - 仅对 POST/PUT/PATCH/DELETE 且带 Idempotency-Key 的请求生效；
 * - 同一 key + 方法 + 路径 + 用户 视为同一操作；
 * - 处理中重复请求返回 409 CONFLICT；
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

function replay(res, record) {
  if (record.state === 'pending') {
    return fail(res, 409, 'CONFLICT', '相同 Idempotency-Key 的请求正在处理中')
  }
  res.setHeader('Idempotent-Replayed', 'true')
  return res.status(record.status).json(record.body)
}

export function idempotency({ ttlMs = 24 * 60 * 60 * 1000, redis = null } = {}) {
  if (!sweeper) {
    sweeper = setInterval(sweep, 60_000)
    sweeper.unref?.()
  }
  return async (req, res, next) => {
    const raw = req.get('idempotency-key')
    if (!raw || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next()
    if (raw.length > 200) return fail(res, 400, 'BAD_REQUEST', 'Idempotency-Key 过长')

    const identity = req.auth?.userId || req.ip || 'anonymous'
    const baseKey = `${req.method}:${req.baseUrl}${req.path}:${identity}:${raw}`

    let client = null
    try {
      client = redis || (await getRedisClient())
    } catch {
      client = null
    }

    if (client) {
      const key = `idempotency:${baseKey}`
      let existingRecord = null
      try {
        const existing = await client.get(key)
        if (existing) existingRecord = JSON.parse(existing)
      } catch {
        client = null
      }
      if (existingRecord) return replay(res, existingRecord)

      if (client) {
        let racedRecord = null
        let created = null
        try {
          created = await client.set(key, JSON.stringify({ state: 'pending' }), {
            NX: true,
            PX: ttlMs,
          })
          if (!created) {
            const raced = await client.get(key)
            if (raced) racedRecord = JSON.parse(raced)
          }
        } catch {
          client = null
        }
        if (racedRecord) return replay(res, racedRecord)
        if (created) {
          const originalJson = res.json.bind(res)
          res.json = (body) => {
            if (res.statusCode < 500) {
              client
                .set(key, JSON.stringify({ state: 'done', status: res.statusCode, body }), { PX: ttlMs })
                .catch(() => {})
            } else {
              client.del(key).catch(() => {})
            }
            return originalJson(body)
          }
          return next()
        }
      }
    }

    const now = Date.now()
    const existing = entries.get(baseKey)
    if (existing && existing.expiresAt > now) return replay(res, existing)

    entries.set(baseKey, { state: 'pending', expiresAt: now + ttlMs })

    const originalJson = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode < 500) {
        entries.set(baseKey, {
          state: 'done',
          status: res.statusCode,
          body,
          expiresAt: Date.now() + ttlMs,
        })
      } else {
        entries.delete(baseKey)
      }
      return originalJson(body)
    }
    return next()
  }
}
