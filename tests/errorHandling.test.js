import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R3-T3.6（首片）：AppError + 集中错误映射 + requestId。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-errors-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'true'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { authService } = await import('../src/services/authService.js')
const { storageService } = await import('../src/services/storageService.js')
const { projectService } = await import('../src/services/projectService.js')
const { errorHandler } = await import('../src/middleware/errorHandler.js')
const { AppError } = await import('../src/utils/appError.js')

let token
let userId
let projectId

before(() => {
  const reg = authService.register({
    username: `errors${Date.now()}`,
    email: `errors-${Date.now()}@example.com`,
    password: 'secret-123',
  })
  token = reg.token
  userId = reg.user.id
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('集中错误映射', () => {
  before(async () => {
    const project = await projectService.createProject({ name: '错误映射项目', userId })
    projectId = project.id
  })

  it('AppError 404 返回稳定 code 与 requestId', async () => {
    const res = await request(app)
      .get(`/api/analysis/project/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-request-id', 'req-test-404')
    assert.equal(res.status, 404)
    assert.equal(res.body.code, 'NOT_FOUND')
    assert.equal(res.body.requestId, 'req-test-404')
    assert.equal(res.header['x-request-id'], 'req-test-404')
    assert.match(res.body.error, /还没有分析结果/ )
  })

  it('版本路由业务错误走集中映射', async () => {
    const res = await request(app)
      .get(`/api/projects/${projectId}/versions/not-exist-version`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-request-id', 'req-test-version')
    assert.equal(res.status, 404)
    assert.equal(res.body.code, 'NOT_FOUND')
    assert.equal(res.body.requestId, 'req-test-version')
  })

  it('未知错误 500 不泄漏 message', () => {
    const req = { id: 'req-test-500', method: 'GET', originalUrl: '/api/boom' }
    const res = {
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(body) {
        this.body = body
        return this
      },
    }
    errorHandler(new Error('database password is hunter2'), req, res)
    assert.equal(res.statusCode, 500)
    assert.equal(res.body.code, 'INTERNAL_ERROR')
    assert.equal(res.body.error, 'Internal server error')
    assert.equal(res.body.requestId, 'req-test-500')
    assert.doesNotMatch(JSON.stringify(res.body), /hunter2/)
  })

  it('AppError 工厂生成稳定状态码', () => {
    assert.equal(AppError.badRequest('x').status, 400)
    assert.equal(AppError.notFound().code, 'NOT_FOUND')
    assert.equal(AppError.validation('x', [{ path: 'a' }]).status, 422)
    assert.equal(AppError.internal().expose, false)
  })
})
