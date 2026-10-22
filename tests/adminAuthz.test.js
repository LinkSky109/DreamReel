import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * 管理面鉴权矩阵（REQUIRE_AUTH=true）。
 * 覆盖：enterprise / system / webhooks / teams / cloud-drive。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-admin-authz-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'true'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { authService } = await import('../src/services/authService.js')
const { storageService } = await import('../src/services/storageService.js')

const password = 'secret-123'
let ownerToken
let viewerToken

function registerWithRoles(prefix, roles) {
  const stamp = `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
  const result = authService.register({
    username: stamp,
    email: `${stamp}@example.com`,
    password,
  })
  storageService.data.users[result.user.id].roles = roles
  return result.token
}

before(() => {
  ownerToken = registerWithRoles('owner', ['owner'])
  viewerToken = registerWithRoles('viewer', ['viewer'])
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

function authed(token) {
  return { Authorization: `Bearer ${token}` }
}

describe('管理面无 token 一律 401', () => {
  const endpoints = [
    ['get', '/api/enterprise/overview'],
    ['get', '/api/v1/enterprise/overview'],
    ['get', '/api/system/info'],
    ['get', '/api/v1/system/info'],
    ['get', '/api/webhooks'],
    ['get', '/api/v1/webhooks'],
    ['get', '/api/teams'],
    ['get', '/api/v1/teams'],
    ['get', '/api/cloud-drive/quark/status'],
    ['get', '/api/v1/cloud-drive/quark/status'],
  ]

  for (const [method, url] of endpoints) {
    it(`${method.toUpperCase()} ${url}`, async () => {
      const res = await request(app)[method](url)
      assert.equal(res.status, 401)
    })
  }
})

describe('viewer token：企业/系统/云盘 403，团队与 Webhook 仅本人可用', () => {
  it('enterprise 403', async () => {
    const res = await request(app).get('/api/enterprise/overview').set(authed(viewerToken))
    assert.equal(res.status, 403)
  })

  it('enterprise 审计 403（缺 audit:read）', async () => {
    const res = await request(app).get('/api/enterprise/audit').set(authed(viewerToken))
    assert.equal(res.status, 403)
  })

  it('system 403', async () => {
    const res = await request(app).get('/api/system/info').set(authed(viewerToken))
    assert.equal(res.status, 403)
  })

  it('cloud-drive 403', async () => {
    const res = await request(app)
      .get('/api/cloud-drive/quark/status')
      .set(authed(viewerToken))
    assert.equal(res.status, 403)
  })

  it('webhooks 200（只列本人）', async () => {
    const res = await request(app).get('/api/webhooks').set(authed(viewerToken))
    assert.equal(res.status, 200)
    assert.deepEqual(res.body.webhooks, [])
  })

  it('teams 200（只列本人可见）', async () => {
    const res = await request(app).get('/api/teams').set(authed(viewerToken))
    assert.equal(res.status, 200)
    assert.equal(res.body.total, 0)
  })
})

describe('owner token：管理面放行', () => {
  it('enterprise overview 200', async () => {
    const res = await request(app).get('/api/enterprise/overview').set(authed(ownerToken))
    assert.equal(res.status, 200)
  })

  it('enterprise audit 200', async () => {
    const res = await request(app).get('/api/enterprise/audit').set(authed(ownerToken))
    assert.equal(res.status, 200)
  })

  it('system info 200', async () => {
    const res = await request(app).get('/api/system/info').set(authed(ownerToken))
    assert.equal(res.status, 200)
  })

  it('cloud-drive status 200', async () => {
    const res = await request(app)
      .get('/api/cloud-drive/quark/status')
      .set(authed(ownerToken))
    assert.equal(res.status, 200)
  })

  it('webhooks 与 teams 200', async () => {
    const webhooks = await request(app).get('/api/webhooks').set(authed(ownerToken))
    assert.equal(webhooks.status, 200)
    const teams = await request(app).get('/api/teams').set(authed(ownerToken))
    assert.equal(teams.status, 200)
  })

  it('团队详情仅成员/管理员可读', async () => {
    const created = await request(app)
      .post('/api/teams')
      .set(authed(ownerToken))
      .send({ name: 'secret-team' })
    assert.equal(created.status, 201)

    const own = await request(app)
      .get(`/api/teams/${created.body.id}`)
      .set(authed(ownerToken))
    assert.equal(own.status, 200)

    const other = await request(app)
      .get(`/api/teams/${created.body.id}`)
      .set(authed(viewerToken))
    assert.equal(other.status, 403)

    const projects = await request(app)
      .get(`/api/teams/${created.body.id}/projects`)
      .set(authed(viewerToken))
    assert.equal(projects.status, 403)
  })
})
