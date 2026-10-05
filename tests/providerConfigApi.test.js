/**
 * Provider 配置 API 集成测试
 * Phase 1: 验证项目级配置和用户偏好 API
 *
 * 运行方式:
 *   NODE_ENV=test node --test tests/providerConfigApi.test.js
 */

import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import request from 'supertest'

// 动态导入 app（避免在模块加载时初始化）
let app

// 使用唯一后缀避免持久化存储中的用户冲突
const uniqueSuffix = Date.now().toString(36)

describe('Phase 1: Provider 配置 API', () => {
  before(async () => {
    const { default: expressApp } = await import('../src/server.js')
    app = expressApp
  })

  describe('GET /api/providers/available', () => {
    it('应返回所有阶段的 Provider 目录', async () => {
      const res = await request(app).get('/api/providers/available')
      assert.strictEqual(res.status, 200)
      assert.ok(res.body.video)
      assert.ok(res.body.llm)
      assert.ok(res.body.tts)
      assert.ok(Array.isArray(res.body.video.models))
      assert.ok(Array.isArray(res.body.llm.models))
      assert.ok(Array.isArray(res.body.tts.models))
    })

    it('应支持按 stage=video 过滤', async () => {
      const res = await request(app).get('/api/providers/available?stage=video')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.stage, 'video')
      assert.ok(Array.isArray(res.body.models))
    })

    it('应支持按 stage=llm 过滤', async () => {
      const res = await request(app).get('/api/providers/available?stage=llm')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.stage, 'llm')
      assert.ok(Array.isArray(res.body.models))
    })

    it('应支持按 stage=tts 过滤', async () => {
      const res = await request(app).get('/api/providers/available?stage=tts')
      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.stage, 'tts')
      assert.ok(Array.isArray(res.body.models))
    })

    it('每个 provider 应包含 configured 字段', async () => {
      const res = await request(app).get('/api/providers/available?stage=video')
      assert.strictEqual(res.status, 200)
      for (const provider of res.body.models) {
        assert.strictEqual(typeof provider.id, 'string')
        assert.strictEqual(typeof provider.name, 'string')
        assert.strictEqual(typeof provider.configured, 'boolean')
        assert.ok(Array.isArray(provider.models))
      }
    })
  })

  describe('Project 模型配置 API', () => {
    let projectId
    let authToken

    before(async () => {
      // 创建测试用户并登录
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: `phase1test_${uniqueSuffix}`,
          email: `phase1_${uniqueSuffix}@test.com`,
          password: 'password123',
        })
      authToken = registerRes.body.token

      // 创建测试项目
      const projectRes = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Phase 1 Test Project' })
      projectId = projectRes.body.id
    })

    it('GET /api/projects/:id/model-config 应返回配置和 resolved 值', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/model-config`)
        .set('Authorization', `Bearer ${authToken}`)

      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.projectId, projectId)
      assert.ok(res.body.preferences)
      assert.ok(res.body.resolved)
      assert.ok(res.body.resolved.video)
      assert.ok(res.body.resolved.llm)
      assert.ok(res.body.resolved.tts)
      assert.ok(res.body.resolved.video.provider)
      assert.ok(res.body.resolved.video.source)
    })

    it('PUT /api/projects/:id/model-config 应保存配置', async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/model-config`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          video: { provider: 'mock', model: 'mock', config: {} },
        })

      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.preferences.video.provider, 'mock')
      assert.strictEqual(res.body.preferences.video.model, 'mock')
      assert.strictEqual(res.body.resolved.video.provider, 'mock')
      assert.strictEqual(res.body.resolved.video.source, 'project')
    })

    it('保存后 GET 应返回更新后的配置', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/model-config`)
        .set('Authorization', `Bearer ${authToken}`)

      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.preferences.video.provider, 'mock')
    })

    it('PUT 配置 null 应清除项目级配置', async () => {
      const res = await request(app)
        .put(`/api/projects/${projectId}/model-config`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          video: null,
        })

      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.preferences.video, null)
      // 回退到全局默认或用户默认
      assert.ok(['global-default', 'user-default', 'fallback'].includes(res.body.resolved.video.source))
    })

    it('无权限用户应无法修改他人项目配置', async () => {
      // 注册另一个用户
      const otherRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: `phase1other_${uniqueSuffix}`,
          email: `phase1other_${uniqueSuffix}@test.com`,
          password: 'password123',
        })
      const otherToken = otherRes.body.token

      const res = await request(app)
        .put(`/api/projects/${projectId}/model-config`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({
          video: { provider: 'mock', model: 'mock', config: {} },
        })

      assert.strictEqual(res.status, 403)
      assert.ok(res.body.error)
    })
  })

  describe('User 模型偏好 API', () => {
    let authToken

    before(async () => {
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          username: `phase1usertest_${uniqueSuffix}`,
          email: `phase1user_${uniqueSuffix}@test.com`,
          password: 'password123',
        })
      authToken = registerRes.body.token
    })

    it('GET /api/auth/me/model-preferences 应返回用户偏好', async () => {
      const res = await request(app)
        .get('/api/auth/me/model-preferences')
        .set('Authorization', `Bearer ${authToken}`)

      assert.strictEqual(res.status, 200)
      assert.ok(res.body.preferences)
      assert.ok(res.body.resolved)
      assert.ok(res.body.resolved.video)
      assert.ok(res.body.resolved.llm)
      assert.ok(res.body.resolved.tts)
    })

    it('PUT /api/auth/me/model-preferences 应保存用户偏好', async () => {
      const res = await request(app)
        .put('/api/auth/me/model-preferences')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          video: { provider: 'mock', model: 'mock', config: {} },
          llm: { provider: 'mock', model: 'mock', config: {} },
        })

      assert.strictEqual(res.status, 200)
      assert.strictEqual(res.body.preferences.video.provider, 'mock')
      assert.strictEqual(res.body.preferences.llm.provider, 'mock')
      assert.strictEqual(res.body.resolved.video.source, 'user-default')
    })

    it('未登录应返回 401', async () => {
      const res = await request(app)
        .get('/api/auth/me/model-preferences')
      assert.strictEqual(res.status, 401)
    })
  })
})
