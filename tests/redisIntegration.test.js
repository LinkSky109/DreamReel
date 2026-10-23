import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from 'redis'
import { rateLimit } from '../src/middleware/rateLimit.js'
import { idempotency } from '../src/middleware/idempotency.js'

/**
 * R3-T3.8：真实 Redis 集成（多实例共享限流/幂等）。
 * 仅在提供 TEST_REDIS_URL 时运行；CI 无 Redis 时跳过。
 */
const redisUrl = process.env.TEST_REDIS_URL
const options = { skip: redisUrl ? false : '未设置 TEST_REDIS_URL' }

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    req: { id: 'redis-int' },
    setHeader(key, value) {
      this.headers[key] = value
    },
    getHeader(key) {
      return this.headers[key]
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

function mockReq(headers = {}) {
  return {
    method: 'POST',
    baseUrl: '/api',
    path: '/shared',
    ip: '10.0.0.1',
    auth: { userId: 'redis-int-user' },
    get(name) {
      return headers[name.toLowerCase()]
    },
  }
}

describe('真实 Redis 多实例语义', () => {
  it('两个实例共享限流计数', options, async () => {
    const client = createClient({ url: redisUrl })
    await client.connect()
    const bucket = `integration:${Date.now()}`
    const key = `ratelimit:${bucket}:10.0.0.1`
    try {
      const instanceA = rateLimit({ windowMs: 60_000, max: 2, redis: client, bucket })
      const instanceB = rateLimit({ windowMs: 60_000, max: 2, redis: client, bucket })
      const req = { method: 'GET', ip: '10.0.0.1', auth: null, baseUrl: '/api', path: '/x' }

      const r1 = mockRes()
      await instanceA(req, r1, () => {})
      const r2 = mockRes()
      await instanceB(req, r2, () => {})
      const r3 = mockRes()
      await instanceB(req, r3, () => {})

      assert.equal(r1.statusCode, 200)
      assert.equal(r2.statusCode, 200)
      assert.equal(r3.statusCode, 429)
    } finally {
      await client.del(key).catch(() => {})
      await client.quit()
    }
  })

  it('两个实例共享幂等状态', options, async () => {
    const client = createClient({ url: redisUrl })
    await client.connect()
    const headers = { 'idempotency-key': `int-${Date.now()}` }
    try {
      const instanceA = idempotency({ ttlMs: 30_000, redis: client })
      const instanceB = idempotency({ ttlMs: 30_000, redis: client })

      const resA = mockRes()
      let calledA = false
      await instanceA(mockReq(headers), resA, () => {
        calledA = true
      })
      assert.equal(calledA, true)

      const resB = mockRes()
      let calledB = false
      await instanceB(mockReq(headers), resB, () => {
        calledB = true
      })
      assert.equal(calledB, false)
      assert.equal(resB.statusCode, 409)

      resA.status(201)
      resA.json({ id: 'created' })
      await new Promise((resolve) => setTimeout(resolve, 50))

      const resC = mockRes()
      let calledC = false
      await instanceB(mockReq(headers), resC, () => {
        calledC = true
      })
      assert.equal(calledC, false)
      assert.equal(resC.statusCode, 201)
      assert.deepEqual(resC.body, { id: 'created' })
      assert.equal(resC.headers['Idempotent-Replayed'], 'true')
    } finally {
      await client.quit()
    }
  })
})
