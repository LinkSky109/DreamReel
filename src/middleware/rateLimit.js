import { fail } from '../http/respond.js'

/**
 * 进程内固定窗口限流。Redis/网关限流在 Phase 7 接入，这里保留同样的接口语义：
 * 超限返回 429 + RATE_LIMITED，并带 RateLimit-* 头。
 *
 * 注意：多实例部署时进程内计数不共享；生产应以网关或 Redis 为准。
 */
const buckets = new Map() // key -> { count, resetAt }
let sweeper = null

function sweep() {
  const now = Date.now()
  for (const [key, entry] of buckets) {
    if (entry.resetAt <= now) buckets.delete(key)
  }
}

function ensureSweeper(windowMs) {
  if (sweeper) return
  sweeper = setInterval(sweep, Math.max(windowMs, 30000))
  sweeper.unref?.()
}

export function rateLimit({
  windowMs = 60_000,
  max = 600,
  bucket = 'default',
  keyGenerator,
  skip,
} = {}) {
  ensureSweeper(windowMs)
  return (req, res, next) => {
    if (req.method === 'OPTIONS' || (skip && skip(req))) return next()
    const identity = keyGenerator ? keyGenerator(req) : req.auth?.userId || req.ip || 'anonymous'
    const key = `${bucket}:${identity}`
    const now = Date.now()
    let entry = buckets.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs }
      buckets.set(key, entry)
    }
    entry.count += 1
    const remaining = Math.max(0, max - entry.count)
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)))
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)))
      return fail(res, 429, 'RATE_LIMITED', '请求过于频繁，请稍后重试', { bucket, retryAfterMs: entry.resetAt - now })
    }
    return next()
  }
}

export function resetRateLimits() {
  buckets.clear()
}
