import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/server.js'
import { projectService } from '../src/services/projectService.js'
import { storageService } from '../src/services/storageService.js'
import { imageService } from '../src/services/imageService.js'

const TEST_USER = 'default'

describe('R32 图片生成 HTTP 路由', () => {
  let projectId
  let shotId

  before(async () => {
    const project = await projectService.createProject({ name: 'R32 路由测试项目', userId: TEST_USER })
    projectId = project.id
    const hydrated = await projectService.getProject(projectId)
    shotId = hydrated.addShot({ description: '雨夜街头' }).id
    await projectService.updateProject(projectId, { shots: hydrated.shots })
  })

  after(async () => {
    for (const asset of Object.values(storageService.get('imageAssets') || {})) {
      try {
        imageService.deleteAsset(asset.id, TEST_USER)
      } catch { /* ignore */ }
    }
    try {
      await projectService.deleteProject(projectId)
    } catch { /* ignore */ }
    storageService._flush()
  })

  beforeEach(() => {
    storageService.data.usage[TEST_USER] = {}
  })

  it('GET /api/images/providers 返回当前 provider 与模型目录', async () => {
    const res = await request(app).get('/api/images/providers')
    assert.equal(res.status, 200)
    assert.equal(res.body.current, 'mock')
    assert.ok(res.body.available.includes('mock'))
    assert.ok(res.body.available.includes('openai'))
  })

  it('POST /api/images/generate 成功返回 201 与 completed 资产', async () => {
    const res = await request(app)
      .post('/api/images/generate')
      .send({ projectId, prompt: '雨夜霓虹', count: 1, aspectRatio: '16:9', style: 'cinematic' })
    assert.equal(res.status, 201)
    assert.equal(res.body.count, 1)
    assert.equal(res.body.assets[0].status, 'completed')
    assert.ok(res.body.assets[0].url.startsWith('/storage/images/'))
  })

  it('POST /api/images/generate 参数错误返回 400', async () => {
    const emptyPrompt = await request(app)
      .post('/api/images/generate')
      .send({ projectId, prompt: '  ', count: 1 })
    assert.equal(emptyPrompt.status, 400)

    const badCount = await request(app)
      .post('/api/images/generate')
      .send({ projectId, prompt: '测试', count: 9 })
    assert.equal(badCount.status, 400)
  })

  it('POST /api/images/generate 项目不存在返回 404', async () => {
    const res = await request(app)
      .post('/api/images/generate')
      .send({ projectId: 'no-such-project', prompt: '测试', count: 1 })
    assert.equal(res.status, 404)
  })

  it('GET/DELETE /api/images/assets 支持列表、详情与删除', async () => {
    const generated = await request(app)
      .post('/api/images/generate')
      .send({ projectId, prompt: '资产列表测试', count: 1 })
    const assetId = generated.body.assets[0].id

    const list = await request(app).get(`/api/images/assets?projectId=${projectId}`)
    assert.equal(list.status, 200)
    assert.ok(list.body.items.some((a) => a.id === assetId))

    const detail = await request(app).get(`/api/images/assets/${assetId}`)
    assert.equal(detail.status, 200)
    assert.equal(detail.body.id, assetId)

    const missing = await request(app).get('/api/images/assets/img_missing')
    assert.equal(missing.status, 404)

    const deleted = await request(app).delete(`/api/images/assets/${assetId}`)
    assert.equal(deleted.status, 200)
    assert.equal(deleted.body.deleted, true)
  })

  it('POST /api/images/assets/:id/apply 回填镜头参考图', async () => {
    const generated = await request(app)
      .post('/api/images/generate')
      .send({ projectId, prompt: '回填路由测试', count: 1 })
    const asset = generated.body.assets[0]

    const applied = await request(app)
      .post(`/api/images/assets/${asset.id}/apply`)
      .send({ targetType: 'shot', targetId: shotId, projectId })
    assert.equal(applied.status, 200)
    assert.ok(applied.body.referenceImages.includes(asset.url))

    const readback = await request(app).get(`/api/projects/${projectId}`)
    assert.equal(readback.status, 200)
    assert.ok(readback.body.shots[0].referenceImages.includes(asset.url))
  })
})
