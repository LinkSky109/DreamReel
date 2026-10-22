import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R3-T3.4：付费端点额度与匿名 mock。
 * - 匿名不消耗额度，provider 强制 mock
 * - 登录用户超额返回 429
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-quota-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'false'
process.env.ALLOW_ANONYMOUS = 'true'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { authService } = await import('../src/services/authService.js')
const { storageService } = await import('../src/services/storageService.js')
const { quotaService } = await import('../src/services/quotaService.js')
const { requireLlmQuota } = await import('../src/middleware/quotaGuard.js')
const { resolveProviderConfig } = await import('../src/providers/providerResolver.js')
const config = (await import('../src/config/index.js')).default

let user
let token

function runGuard(req) {
  const res = {
    code: 200,
    body: null,
    status(code) {
      this.code = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
    setHeader() {},
  }
  let nextCalled = false
  requireLlmQuota(req, res, () => {
    nextCalled = true
  })
  return { res, nextCalled }
}

before(() => {
  const reg = authService.register({
    username: `quota${Date.now()}`,
    email: `quota-${Date.now()}@example.com`,
    password: 'secret-123',
  })
  user = reg.user
  token = reg.token
})

describe('requireLlmQuota', () => {
  it('匿名放行且不消耗额度', () => {
    const before = storageService.getUsage('default').daily.llmCalls
    const { res, nextCalled } = runGuard({ userId: 'default' })
    assert.equal(nextCalled, true)
    assert.equal(res.code, 200)
    assert.equal(storageService.getUsage('default').daily.llmCalls, before)
  })

  it('登录用户放行并消耗一次', () => {
    const before = storageService.getUsage(user.id).daily.llmCalls
    const { nextCalled } = runGuard({ userId: user.id })
    assert.equal(nextCalled, true)
    assert.equal(storageService.getUsage(user.id).daily.llmCalls, before + 1)
  })

  it('超额返回 429 QUOTA_EXCEEDED', async () => {
    const limit = quotaService.checkLlmQuota(user.id).limit
    storageService.incrementUsage(user.id, 'llm', limit)
    const { res, nextCalled } = runGuard({ userId: user.id })
    assert.equal(nextCalled, false)
    assert.equal(res.code, 429)
    assert.equal(res.body.code, 'QUOTA_EXCEEDED')

    const http = await request(app)
      .post('/api/novels/not-exist/extract')
      .set('Authorization', `Bearer ${token}`)
      .send({})
    assert.equal(http.status, 429)
  })
})

describe('匿名 provider 强制 mock', () => {
  it('匿名解析为 mock，真实用户仍按全局配置', () => {
    const original = { provider: config.llm.provider, key: config.llm.deepseekApiKey }
    config.llm.provider = 'deepseek'
    config.llm.deepseekApiKey = 'test-key'
    try {
      const anon = resolveProviderConfig('llm', null, 'default')
      assert.equal(anon.provider, 'mock')
      assert.equal(anon.source, 'anonymous-mock')

      const real = resolveProviderConfig('llm', null, user.id)
      assert.equal(real.provider, 'deepseek')
      assert.equal(real.source, 'global-default')
    } finally {
      config.llm.provider = original.provider
      config.llm.deepseekApiKey = original.key
    }
  })
})
