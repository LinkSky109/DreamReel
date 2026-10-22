import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R3-T3.1：项目级 IDOR 全覆盖。
 * 非所有者访问所有 :projectId 路由一律 403；所有者读接口 200。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-idor-'))
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
const { apiKeyService } = await import('../src/services/apiKeyService.js')
const { collaborationService } = await import('../src/services/collaborationService.js')

const password = 'secret-123'
let owner
let other
let project
let otherApiKey

function authed(user) {
  return { Authorization: `Bearer ${user.token}` }
}

before(async () => {
  owner = authService.register({
    username: `idorowner${Date.now()}`,
    email: `idorowner-${Date.now()}@example.com`,
    password,
  })
  other = authService.register({
    username: `idorother${Date.now()}`,
    email: `idorother-${Date.now()}@example.com`,
    password,
  })
  otherApiKey = await apiKeyService.createKey({ name: 'idor', userId: other.user.id })

  project = await projectService.createProject({
    name: 'IDOR 测试项目',
    userId: owner.user.id,
  })
  await projectService.updateProject(project.id, {
    shots: [{ id: 'shot-1', description: '测试镜头', status: 'completed', videoUrl: '/storage/x.mp4' }],
  })
})

beforeEach(() => {
  projectService.recycleBin.clear()
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('项目读取/写入越权', () => {
  const cases = [
    ['get', (id) => `/api/projects/${id}`],
    ['put', (id) => `/api/projects/${id}`],
    ['post', (id) => `/api/projects/${id}/favorite`],
    ['post', (id) => `/api/projects/${id}/archive`],
    ['post', (id) => `/api/projects/${id}/duplicate`],
    ['get', (id) => `/api/projects/${id}/export`],
    ['get', (id) => `/api/projects/${id}/model-config`],
    ['put', (id) => `/api/projects/${id}/model-config`],
  ]

  for (const [method, build] of cases) {
    it(`${method.toUpperCase()} ${build(':id')} 非所有者 403`, async () => {
      const res = await request(app)[method](build(project.id))
        .set(authed(other))
        .send({ name: '越权改名', video: null })
      assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`)
    })
  }

  it('所有者读取项目 200', async () => {
    const res = await request(app).get(`/api/projects/${project.id}`).set(authed(owner))
    assert.equal(res.status, 200)
    assert.equal(res.body.id, project.id)
  })

  it('不存在的项目返回 404', async () => {
    const res = await request(app).get('/api/projects/not-exist-idor').set(authed(other))
    assert.equal(res.status, 404)
  })
})

describe('版本路由越权', () => {
  let versionId

  before(async () => {
    const res = await request(app)
      .post(`/api/projects/${project.id}/versions`)
      .set(authed(owner))
      .send({ label: 'v1' })
    assert.equal(res.status, 201)
    versionId = res.body.id
  })

  const cases = [
    ['get', (id) => `/api/projects/${id}/versions`],
    ['post', (id) => `/api/projects/${id}/versions`],
    ['get', (id) => `/api/projects/${id}/versions/compare?from=v1&to=v2`],
  ]

  for (const [method, build] of cases) {
    it(`${method.toUpperCase()} ${build(':id')} 非所有者 403`, async () => {
      const res = await request(app)[method](build(project.id)).set(authed(other)).send({ label: 'x' })
      assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`)
    })
  }

  it('版本详情/回滚/删除 非所有者 403', async () => {
    const detail = await request(app)
      .get(`/api/projects/${project.id}/versions/${versionId}`)
      .set(authed(other))
    assert.equal(detail.status, 403)

    const rollback = await request(app)
      .post(`/api/projects/${project.id}/versions/${versionId}/rollback`)
      .set(authed(other))
    assert.equal(rollback.status, 403)

    const remove = await request(app)
      .delete(`/api/projects/${project.id}/versions/${versionId}`)
      .set(authed(other))
    assert.equal(remove.status, 403)
  })

  it('所有者可读取版本列表', async () => {
    const res = await request(app).get(`/api/projects/${project.id}/versions`).set(authed(owner))
    assert.equal(res.status, 200)
  })
})

describe('导出/分析/协作/视频 越权', () => {
  const cases = [
    ['post', '/api/export/project/:id'],
    ['post', '/api/export/project/:id/sync'],
    ['get', '/api/export/project/:id/history'],
    ['post', '/api/analysis/project/:id'],
    ['post', '/api/analysis/project/:id/sync'],
    ['get', '/api/analysis/project/:id'],
    ['get', '/api/collab/:id/comments'],
    ['post', '/api/collab/:id/comments'],
    ['get', '/api/collab/:id/activities'],
    ['get', '/api/collab/:id/share'],
    ['put', '/api/collab/:id/share'],
    ['get', '/api/video/history/:id'],
    ['get', '/api/video/history/:id/stats'],
    ['delete', '/api/video/history/:id'],
    ['get', '/api/video/queue/project/:id'],
    ['post', '/api/video/queue/cancel-project/:id'],
    ['post', '/api/video/generate-all/:id'],
  ]

  for (const [method, template] of cases) {
    it(`${method.toUpperCase()} ${template} 非所有者 403`, async () => {
      const res = await request(app)
        [method](template.replace(':id', project.id))
        .set(authed(other))
        .send({ content: '越权评论', isPublic: true })
      assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`)
    })
  }

  it('body 指定 projectId 的生成接口同样 403', async () => {
    for (const endpoint of ['/api/video/generate', '/api/video/regenerate', '/api/video/candidates']) {
      const res = await request(app)
        .post(endpoint)
        .set(authed(other))
        .send({ projectId: project.id, shotId: 'shot-1', prompt: 'x' })
      assert.equal(res.status, 403, `${endpoint} expected 403, got ${res.status}`)
    }
  })
})

describe('回收站越权', () => {
  it('非所有者不能恢复或永久删除回收站项目', async () => {
    const victim = await projectService.createProject({ name: '回收站越权', userId: owner.user.id })
    await projectService.deleteProject(victim.id, { deletedBy: owner.user.id })

    const restore = await request(app)
      .post(`/api/projects/recycle-bin/${victim.id}/restore`)
      .set(authed(other))
    assert.equal(restore.status, 403)

    const purge = await request(app)
      .delete(`/api/projects/recycle-bin/${victim.id}`)
      .set(authed(other))
    assert.equal(purge.status, 403)
  })
})

describe('公开分享链接', () => {
  it('公开分享可通过 token 读取项目，无需登录', async () => {
    const share = collaborationService.setShareSettings(project.id, { isPublic: true })
    const res = await request(app).get(`/api/collab/shared/${share.shareToken}/project`)
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.id, project.id)
  })

  it('未公开时返回 404', async () => {
    const share = collaborationService.setShareSettings(project.id, { isPublic: false })
    const res = await request(app).get(`/api/collab/shared/${share.shareToken}/project`)
    assert.equal(res.status, 404)
  })
})

describe('开放 API 越权', () => {
  it('他人的 API Key 读取项目 403', async () => {
    const res = await request(app)
      .get(`/api/open/v1/projects/${project.id}`)
      .set('Authorization', `Bearer ${otherApiKey.apiKey}`)
    assert.equal(res.status, 403, `expected 403, got ${res.status}: ${JSON.stringify(res.body)}`)
  })

  it('他人的 API Key 触发视频生成 403', async () => {
    const res = await request(app)
      .post('/api/open/v1/videos/generate')
      .set('Authorization', `Bearer ${otherApiKey.apiKey}`)
      .send({ projectId: project.id })
    assert.equal(res.status, 403)
  })
})
