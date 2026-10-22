import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R3-T3.2：身份只来自认证上下文。
 * - ALLOW_ANONYMOUS=false 时，即使 REQUIRE_AUTH=false，匿名请求也应 401
 * - body/query 中的 userId 不再能指定身份
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-identity-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'false'
process.env.ALLOW_ANONYMOUS = 'false'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { authService } = await import('../src/services/authService.js')
const { storageService } = await import('../src/services/storageService.js')
const { projectService } = await import('../src/services/projectService.js')

const password = 'secret-123'
let userA
let userB

before(() => {
  userA = authService.register({
    username: `identityA${Date.now()}`,
    email: `identityA-${Date.now()}@example.com`,
    password,
  })
  userB = authService.register({
    username: `identityB${Date.now()}`,
    email: `identityB-${Date.now()}@example.com`,
    password,
  })
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('匿名请求不再回退 default', () => {
  it('匿名读接口 401', async () => {
    const res = await request(app).get('/api/projects')
    assert.equal(res.status, 401, JSON.stringify(res.body))
  })

  it('匿名写接口 401', async () => {
    const res = await request(app).post('/api/projects').send({ name: '匿名项目' })
    assert.equal(res.status, 401, JSON.stringify(res.body))
  })

  it('匿名社区写接口 401', async () => {
    const res = await request(app)
      .post('/api/community/reviews')
      .send({ title: 'x', content: 'y', rating: 5, userId: userA.user.id })
    assert.equal(res.status, 401, JSON.stringify(res.body))
  })
})

describe('body/query 不能指定身份', () => {
  it('创建项目忽略 body.userId，归属 token 用户', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ name: '身份测试', userId: userB.user.id })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.userId, userA.user.id)

    const stored = await projectService.getProject(res.body.id)
    assert.equal(stored.userId, userA.user.id)
  })

  it('查询他人额度返回自己的额度', async () => {
    const mine = await request(app).get('/api/quota/me').set('Authorization', `Bearer ${userA.token}`)
    const cast = await request(app)
      .get(`/api/quota/${userB.user.id}`)
      .set('Authorization', `Bearer ${userA.token}`)
    assert.equal(cast.status, 200, JSON.stringify(cast.body))
    assert.deepEqual(cast.body, mine.body)
  })

  it('社区发帖忽略 body.userId', async () => {
    const res = await request(app)
      .post('/api/community/reviews')
      .set('Authorization', `Bearer ${userA.token}`)
      .send({ title: '身份影评', content: '内容', rating: 5, userId: userB.user.id })
    assert.equal(res.status, 201, JSON.stringify(res.body))
    assert.equal(res.body.data.userId, userA.user.id)
  })
})
