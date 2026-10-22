import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * 开闸（REQUIRE_AUTH=true）下的 /api/v1 公开白名单回归。
 * 必须在导入 app/config 之前设置 env，因为 config 在 import 时求值。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-authgate-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'true'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { authService } = await import('../src/services/authService.js')
const { storageService } = await import('../src/services/storageService.js')

const email = `gate-${Date.now()}@example.com`
const password = 'secret-123'

let token

before(() => {
  authService.register({ username: `gate${Date.now()}`, email, password })
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('/api/v1 鉴权白名单', () => {
  it('v1 登录/注册公开，可正常拿到 token', async () => {
    const login = await request(app).post('/api/v1/auth/login').send({ email, password })
    assert.equal(login.status, 200)
    assert.ok(login.body.token)
    token = login.body.token

    const register = await request(app)
      .post('/api/v1/auth/register')
      .send({
        username: `gate2${Date.now()}`,
        email: `gate2-${Date.now()}@example.com`,
        password,
      })
    assert.equal(register.status, 201)
  })

  it('v1 非公开接口无 token 返回 401', async () => {
    const projects = await request(app).get('/api/v1/projects')
    assert.equal(projects.status, 401)
    assert.equal(projects.body.error, '未登录，请先登录')

    const apiKeys = await request(app).get('/api/v1/api-keys')
    assert.equal(apiKeys.status, 401)
  })

  it('携带 token 后 v1 受保护接口放行', async () => {
    const res = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
    assert.equal(res.status, 200)
  })
})
