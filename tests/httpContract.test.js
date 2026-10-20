import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import request from 'supertest'
import { z } from 'zod'
import { ok, fail } from '../src/http/respond.js'
import { validateBody } from '../src/middleware/validate.js'
import { rateLimit, resetRateLimits } from '../src/middleware/rateLimit.js'
import { idempotency, resetIdempotency } from '../src/middleware/idempotency.js'

function miniApp() {
  const app = express()
  app.use(express.json())
  app.use((req, res, next) => {
    req.id = 'test-request-id'
    res.setHeader('x-api-version', 'v1')
    next()
  })
  return app
}

describe('统一响应 http/respond', () => {
  it('ok 返回 success/data/meta', async () => {
    const app = miniApp()
    app.get('/ok', (_req, res) => ok(res, { a: 1 }))
    app.get('/fail', (_req, res) => fail(res, 404, 'NOT_FOUND', '不存在', [{ path: 'id' }]))
    const good = await request(app).get('/ok')
    assert.equal(good.status, 200)
    assert.deepEqual(good.body.data, { a: 1 })
    assert.equal(good.body.meta.requestId, 'test-request-id')
    assert.equal(good.body.meta.apiVersion, 'v1')

    const bad = await request(app).get('/fail')
    assert.equal(bad.status, 404)
    assert.equal(bad.body.error.code, 'NOT_FOUND')
    assert.equal(bad.body.error.details[0].path, 'id')
  })
})

describe('validateBody', () => {
  const schema = z.object({ limit: z.coerce.number().int().min(1).max(3) })
  it('合法请求通过并写入 req.validated', async () => {
    const app = miniApp()
    app.post('/v', validateBody(schema), (req, res) => ok(res, req.validated.body))
    const res = await request(app).post('/v').send({ limit: '2' })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.data, { limit: 2 })
  })

  it('非法请求返回 422 VALIDATION_ERROR', async () => {
    const app = miniApp()
    app.post('/v', validateBody(schema), (_req, res) => ok(res, {}))
    const res = await request(app).post('/v').send({ limit: 99 })
    assert.equal(res.status, 422)
    assert.equal(res.body.error.code, 'VALIDATION_ERROR')
    assert.ok(res.body.error.details.length >= 1)
  })
})

describe('rateLimit', () => {
  beforeEach(() => resetRateLimits())

  it('超过上限返回 429 与 RateLimit 头', async () => {
    const app = miniApp()
    app.use(rateLimit({ windowMs: 60_000, max: 2, bucket: 'test' }))
    app.get('/r', (_req, res) => ok(res, {}))
    const first = await request(app).get('/r')
    const second = await request(app).get('/r')
    const third = await request(app).get('/r')
    assert.equal(first.status, 200)
    assert.equal(second.status, 200)
    assert.equal(third.status, 429)
    assert.equal(third.body.error.code, 'RATE_LIMITED')
    assert.equal(third.headers['ratelimit-remaining'], '0')
    assert.ok(third.headers['retry-after'])
  })
})

describe('idempotency', () => {
  beforeEach(() => resetIdempotency())

  it('相同 key 重放首次响应', async () => {
    const app = miniApp()
    app.use(idempotency({ ttlMs: 60_000 }))
    let calls = 0
    app.post('/once', (_req, res) => {
      calls += 1
      ok(res, { calls })
    })
    const a = await request(app).post('/once').set('Idempotency-Key', 'k1').send({})
    const b = await request(app).post('/once').set('Idempotency-Key', 'k1').send({})
    assert.equal(a.status, 200)
    assert.deepEqual(b.body.data, { calls: 1 })
    assert.equal(b.headers['idempotent-replayed'], 'true')
    assert.equal(calls, 1)
  })

  it('不同 key 正常执行', async () => {
    const app = miniApp()
    app.use(idempotency({ ttlMs: 60_000 }))
    let calls = 0
    app.post('/once', (_req, res) => {
      calls += 1
      ok(res, { calls })
    })
    await request(app).post('/once').set('Idempotency-Key', 'k1').send({})
    const b = await request(app).post('/once').set('Idempotency-Key', 'k2').send({})
    assert.deepEqual(b.body.data, { calls: 2 })
    assert.equal(b.headers['idempotent-replayed'], undefined)
  })
})
