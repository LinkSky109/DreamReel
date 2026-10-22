import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/server.js'
import './helpers/pg-teardown.js'

describe('API 版本与契约', () => {
  it('GET /api/v1/meta 返回版本元信息', async () => {
    const res = await request(app).get('/api/v1/meta')
    assert.equal(res.status, 200)
    assert.equal(res.headers['x-api-version'], 'v1')
    assert.equal(res.body.success, true)
    assert.equal(res.body.data.version, 'v1')
    assert.equal(res.body.data.base, '/api/v1')
    assert.ok(res.body.data.errorCodes.includes('VALIDATION_ERROR'))
  })

  it('旧 /api 带弃用提示，v1 不带', async () => {
    const legacy = await request(app).get('/api/novels')
    assert.equal(legacy.headers['x-api-version'], 'legacy')
    assert.equal(legacy.headers.deprecation, 'true')
    assert.match(legacy.headers.link, /\/api\/v1/)

    const v1 = await request(app).get('/api/v1/novels')
    assert.equal(v1.headers['x-api-version'], 'v1')
    assert.equal(v1.headers.deprecation, undefined)
    assert.equal(v1.status, legacy.status)
  })

  it('v1 与 legacy 返回同一份数据', async () => {
    const legacy = await request(app).get('/api/novels')
    const v1 = await request(app).get('/api/v1/novels')
    assert.deepEqual(v1.body, legacy.body)
  })

  it('批量出图非法参数在 v1 返回 422', async () => {
    const res = await request(app)
      .post('/api/v1/novels/not-exist/assets/bulk-generate')
      .send({ limit: 999 })
    assert.equal(res.status, 422)
    assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  })

  it('v1 每个响应都带 request id', async () => {
    const res = await request(app).get('/api/v1/meta')
    assert.ok(res.headers['x-request-id'])
  })
})
