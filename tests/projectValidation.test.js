import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R3-T3.3（首片）：项目更新白名单与 zod 校验。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-project-validate-'))
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

let owner
let project

function authed() {
  return { Authorization: `Bearer ${owner.token}` }
}

before(async () => {
  owner = authService.register({
    username: `validateowner${Date.now()}`,
    email: `validateowner-${Date.now()}@example.com`,
    password: 'secret-123',
  })
  project = await projectService.createProject({ name: '校验项目', userId: owner.user.id })
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('PUT /api/projects/:id 输入校验', () => {
  it('合法字段更新成功', async () => {
    const res = await request(app)
      .put(`/api/projects/${project.id}`)
      .set(authed())
      .send({ name: '新名称', platform: 'portrait', targetDuration: 90 })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.name, '新名称')
    assert.equal(res.body.platform, 'portrait')
  })

  it('非法 status/platform/name 返回 422', async () => {
    for (const body of [
      { status: 'bogus' },
      { platform: 'square' },
      { name: '' },
      { name: 123 },
      { targetDuration: -1 },
    ]) {
      const res = await request(app).put(`/api/projects/${project.id}`).set(authed()).send(body)
      assert.equal(res.status, 422, `${JSON.stringify(body)} -> ${res.status}`)
      assert.equal(res.body.error.code, 'VALIDATION_ERROR')
    }
  })

  it('未声明字段被剥离，不会落库', async () => {
    const res = await request(app)
      .put(`/api/projects/${project.id}`)
      .set(authed())
      .send({ name: '白名单', injectedField: 'evil' })
    assert.equal(res.status, 200)
    assert.equal(res.body.injectedField, undefined)

    const stored = await projectService.getProject(project.id)
    assert.equal(stored.injectedField, undefined)
  })

  it('视频/团队/广场写接口非法 body 返回 422', async () => {
    const cases = [
      ['put', `/api/video/shots/shot-1`, { projectId: project.id, duration: 'abc' }],
      ['post', '/api/video/generate', { projectId: project.id, prompt: '' }],
      ['post', '/api/teams', { name: '' }],
      ['post', `/api/gallery/${project.id}/publish`, { category: 'bogus' }],
    ]
    for (const [method, url, body] of cases) {
      const res = await request(app)[method](url).set(authed()).send(body)
      assert.equal(res.status, 422, `${method} ${url} -> ${res.status}: ${JSON.stringify(res.body)}`)
    }
  })

  it('小说写接口非法 body 返回 422', async () => {
    for (const body of [{ title: 123 }, { title: 'ok', sourceType: 'bogus' }]) {
      const res = await request(app).post('/api/novels').set(authed()).send(body)
      assert.equal(res.status, 422, `${JSON.stringify(body)} -> ${res.status}`)
    }
  })

  it('跨用户仍需 403（校验不绕过归属）', async () => {
    const other = authService.register({
      username: `validateother${Date.now()}`,
      email: `validateother-${Date.now()}@example.com`,
      password: 'secret-123',
    })
    const res = await request(app)
      .put(`/api/projects/${project.id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ name: '越权' })
    assert.equal(res.status, 403)
  })
})
