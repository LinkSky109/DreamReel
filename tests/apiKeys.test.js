import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R1-T1B.3：API Key 只存哈希、强制登录、身份只来自 token。
 * REQUIRE_AUTH=true 让 authGate/requirePermission 真实生效。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-apikeys-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'true'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { authService } = await import('../src/services/authService.js')
const { storageService } = await import('../src/services/storageService.js')
const { apiKeyService, hashApiKey } = await import('../src/services/apiKeyService.js')

const password = 'secret-123'
let owner
let viewer

before(() => {
  storageService.data.apiKeys = {}
  owner = authService.register({
    username: `keyowner${Date.now()}`,
    email: `keyowner-${Date.now()}@example.com`,
    password,
  })
  storageService.data.users[owner.user.id].roles = ['owner']
  viewer = authService.register({
    username: `keyviewer${Date.now()}`,
    email: `keyviewer-${Date.now()}@example.com`,
    password,
  })
  storageService.data.users[viewer.user.id].roles = ['viewer']
})

beforeEach(() => {
  storageService.data.apiKeys = {}
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('ApiKeyService 哈希存储', () => {
  it('创建后库里只有 keyHash，明文只返回一次', async () => {
    const created = await apiKeyService.createKey({ name: 'ci', userId: 'u1' })
    assert.match(created.apiKey, /^drk_/)

    const stored = storageService.get('apiKeys')[created.id]
    assert.equal(stored.key, undefined)
    assert.equal(stored.keyHash, hashApiKey(created.apiKey))
    assert.equal(stored.keyHash.length, 64)

    const listed = apiKeyService.listKeys({ userId: 'u1' }).items[0]
    assert.equal(listed.key, undefined)
    assert.equal(listed.keyHash, undefined)
    assert.equal(listed.apiKey, undefined)
  })

  it('validate 按 hash 命中，错误 key 返回 null', async () => {
    const created = await apiKeyService.createKey({ name: 'ci', userId: 'u1' })
    const record = apiKeyService.validate(created.apiKey)
    assert.equal(record.id, created.id)
    assert.equal(record.callCount, 1)
    assert.equal(apiKeyService.validate('drk_not-the-key'), null)
  })

  it('旧明文记录在读取时惰性迁移为 hash', async () => {
    storageService.data.apiKeys = {
      legacy: {
        id: 'legacy',
        name: 'old',
        userId: 'u1',
        scopes: ['project:read'],
        key: 'drk_legacysecret',
        keyPrefix: 'drk_legacy',
        revoked: false,
        callCount: 0,
      },
    }

    const record = apiKeyService.validate('drk_legacysecret')
    assert.equal(record.id, 'legacy')

    const stored = storageService.data.apiKeys.legacy
    assert.equal(stored.key, undefined)
    assert.equal(stored.keyHash, hashApiKey('drk_legacysecret'))
  })

  it('拒绝白名单外的 scope', async () => {
    await assert.rejects(
      () => apiKeyService.createKey({ userId: 'u1', scopes: ['admin:everything'] }),
      /无效的权限范围/
    )
  })
})

describe('API Key 路由鉴权与归属', () => {
  it('匿名创建 401', async () => {
    const res = await request(app).post('/api/api-keys').send({ name: 'x' })
    assert.equal(res.status, 401)
  })

  it('viewer 创建 403', async () => {
    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${viewer.token}`)
      .send({ name: 'x' })
    assert.equal(res.status, 403)
  })

  it('owner 创建时忽略 body.userId，归属 token 用户', async () => {
    const res = await request(app)
      .post('/api/api-keys')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'admin-key', userId: 'attacker', scopes: ['project:read'] })
    assert.equal(res.status, 201)
    assert.ok(res.body.apiKey)
    assert.equal(JSON.stringify(res.body).includes('keyHash'), false)

    const stored = Object.values(storageService.get('apiKeys')).find(
      (k) => k.id === res.body.id
    )
    assert.equal(stored.userId, owner.user.id)
  })

  it('列表只返回本人 key，且不泄漏完整 key/hash', async () => {
    await apiKeyService.createKey({ name: 'viewer-key', userId: viewer.user.id })
    const res = await request(app)
      .get('/api/api-keys')
      .set('Authorization', `Bearer ${owner.token}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.total, 0)
    assert.equal(JSON.stringify(res.body).includes('drk_'), false)
  })

  it('开放 API 用哈希校验 key（不回传 hash）', async () => {
    const created = await apiKeyService.createKey({
      name: 'open-api',
      userId: owner.user.id,
      scopes: ['project:read'],
    })
    const res = await request(app)
      .get('/api/open/v1/key/info')
      .set('Authorization', `Bearer ${created.apiKey}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.name, 'open-api')
    assert.equal(JSON.stringify(res.body).includes('keyHash'), false)
  })

  it('不能吊销他人 key', async () => {
    const viewerKey = await apiKeyService.createKey({ name: 'v', userId: viewer.user.id })
    const res = await request(app)
      .delete(`/api/api-keys/${viewerKey.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
    assert.notEqual(res.status, 200)
  })
})
