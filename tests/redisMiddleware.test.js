import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R3-T3.8（首片）：Redis 限流/幂等抽象 + 安全响应头。
 * 无 Redis 服务时用 fake client 验证语义；真实多实例由部署环境验证。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-redis-mw-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'false'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { rateLimit } = await import('../src/middleware/rateLimit.js')
const { idempotency } = await import('../src/middleware/idempotency.js')
const { storageService } = await import('../src/services/storageService.js')

function fakeRedis() {
  const store = new Map()
  return {
    async incr(key) {
      const next = Number(store.get(key)?.value || 0) + 1
      store.set(key, { value: next, expiresAt: store.get(key)?.expiresAt || Date.now() + 60_000 })
      return next
    },
    async pExpire(key, ms) {
      const entry = store.get(key) || { value: 0 }
      entry.expiresAt = Date.now() + ms
      store.set(key, entry)
      return 1
    },
    async pTTL(key) {
      const entry = store.get(key)
      return entry ? Math.max(0, entry.expiresAt - Date.now()) : -2
    },
    async get(key) {
      return store.get(key)?.raw ?? null
    },
    async set(key, value, options = {}) {
      if (options.NX && store.has(key)) return null
      store.set(key, { raw: value })
      return 'OK'
    },
    async del(key) {
      store.delete(key)
      return 1
    },
  }
}

function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    req: { id: 'test-req' },
    getHeader(key) {
      return this.headers[key]
    },
    setHeader(key, value) {
      this.headers[key] = value
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
    path: '/items',
    ip: '127.0.0.1',
    auth: { userId: 'u1' },
    get(name) {
      return headers[name.toLowerCase()]
    },
  }
}

before(() => {
  // app import 即可，无需额外准备
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('Redis 限流', () => {
  it('超过 max 返回 429，并在 fake Redis 中共享计数', async () => {
    const redis = fakeRedis()
    const mw = rateLimit({ windowMs: 60_000, max: 2, bucket: 'test', redis })
    const req = { method: 'GET', ip: '1.2.3.4', auth: null }
    const statuses = []
    for (let i = 0; i < 3; i++) {
      const res = mockRes()
      await mw(req, res, () => {})
      statuses.push(res.statusCode)
    }
    assert.deepEqual(statuses, [200, 200, 429])
  })
})

describe('Redis 幂等', () => {
  it('重复 key 命中处理中返回 409，完成后重放', async () => {
    const redis = fakeRedis()
    const mw = idempotency({ ttlMs: 60_000, redis })
    const headers = { 'idempotency-key': 'key-1' }

    const res1 = mockRes()
    let called = false
    await mw(mockReq(headers), res1, () => {
      called = true
    })
    assert.equal(called, true)

    const res2 = mockRes()
    let called2 = false
    await mw(mockReq(headers), res2, () => {
      called2 = true
    })
    assert.equal(called2, false)
    assert.equal(res2.statusCode, 409)

    res1.status(200)
    res1.json({ ok: true })
    await new Promise((resolve) => setTimeout(resolve, 0))

    const res3 = mockRes()
    let called3 = false
    await mw(mockReq(headers), res3, () => {
      called3 = true
    })
    assert.equal(called3, false)
    assert.equal(res3.statusCode, 200)
    assert.deepEqual(res3.body, { ok: true })
    assert.equal(res3.headers['Idempotent-Replayed'], 'true')
  })
})

describe('安全响应头', () => {
  it('健康检查带 CSP/框架防护，测试环境不带 HSTS', async () => {
    const res = await request(app).get('/health')
    assert.equal(res.status, 200)
    assert.match(res.headers['content-security-policy'], /default-src 'self'/)
    assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/)
    assert.equal(res.headers['x-frame-options'], 'DENY')
    assert.equal(res.headers['strict-transport-security'], undefined)
  })
})
