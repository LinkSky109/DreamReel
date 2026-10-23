import { fail } from '../http/respond.js'
import { getRedisClient } from '../services/redisClient.js'

/**
 * 固定窗口限流：默认进程内；配置 REDIS_URL 后切到 Redis，多实例共享计数。
 * 超限返回 429 + RATE_LIMITED，并带 RateLimit-* 头。
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

function memoryHit(key, windowMs) {
  const now = Date.now()
  let entry = buckets.get(key)
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + windowMs }
    buckets.set(key, entry)
  }
  entry.count += 1
  return { count: entry.count, ttlMs: Math.max(0, entry.resetAt - now), resetAt: entry.resetAt }
}

async function redisHit(redis, key, windowMs) {
  const count = await redis.incr(key)
  if (count === 1) await redis.pExpire(key, windowMs)
  const ttlMs = Math.max(0, await redis.pTTL(key))
  return { count, ttlMs, resetAt: Date.now() + ttlMs }
}

export function rateLimit({
  windowMs = 60_000,
  max = 600,
  bucket = 'default',
  keyGenerator,
  skip,
  redis = null,
} = {}) {
  ensureSweeper(windowMs)
  return async (req, res, next) => {
    if (req.method === 'OPTIONS' || (skip && skip(req))) return next()
    const identity = keyGenerator ? keyGenerator(req) : req.auth?.userId || req.ip || 'anonymous'
    const key = `ratelimit:${bucket}:${identity}`

    let hit
    try {
      const client = redis || (await getRedisClient())
      hit = client ? await redisHit(client, key, windowMs) : memoryHit(key, windowMs)
    } catch {
      hit = memoryHit(key, windowMs)
    }

    const remaining = Math.max(0, max - hit.count)
    res.setHeader('RateLimit-Limit', String(max))
    res.setHeader('RateLimit-Remaining', String(remaining))
    res.setHeader('RateLimit-Reset', String(Math.ceil(hit.resetAt / 1000)))
    if (hit.count > max) {
      res.setHeader('Retry-After', String(Math.ceil(hit.ttlMs / 1000)))
      return fail(res, 429, 'RATE_LIMITED', '请求过于频繁，请稍后重试', { bucket, retryAfterMs: hit.ttlMs })
    }
    return next()
  }
}

export function resetRateLimits() {
  buckets.clear()
}
