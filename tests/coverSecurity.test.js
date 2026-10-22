import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * R1-T1B.4：自定义封面路径穿越 / 扩展名白名单 / 越权写入。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-cover-'))
process.env.NODE_ENV = 'test'
process.env.REQUIRE_AUTH = 'false'
process.env.STORAGE_PATH = testStorage
process.env.JWT_SECRET =
  process.env.JWT_SECRET || 'test-jwt-secret-for-dreamreel-testing-only-32chars'

const { default: app } = await import('../src/server.js')
await import('./helpers/pg-teardown.js')
const { projectService } = await import('../src/services/projectService.js')
const { storageService } = await import('../src/services/storageService.js')

const thumbnailsDir = path.join(testStorage, 'thumbnails')
const pngPayload = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`

function coverFiles() {
  if (!fs.existsSync(thumbnailsDir)) return []
  return fs.readdirSync(thumbnailsDir)
}

before(() => {
  fs.mkdirSync(thumbnailsDir, { recursive: true })
})

beforeEach(() => {
  storageService.data.projects = {}
  projectService.projects.clear()
  fs.rmSync(thumbnailsDir, { recursive: true, force: true })
  fs.mkdirSync(thumbnailsDir, { recursive: true })
})

after(() => {
  if (storageService.saveTimer) clearTimeout(storageService.saveTimer)
  fs.rmSync(testStorage, { recursive: true, force: true })
})

describe('自定义封面上传安全', () => {
  it('合法 png 写入 thumbnails 并更新 coverUrl', async () => {
    const project = await projectService.createProject({ name: 'p', userId: 'default' })

    const res = await request(app)
      .post(`/api/projects/${project.id}/cover`)
      .send({ image: pngPayload })

    assert.equal(res.status, 200)
    assert.match(res.body.coverUrl, /^\/storage\/thumbnails\/cover_/)
    const filename = res.body.coverUrl.split('/').pop()
    const filepath = path.resolve(thumbnailsDir, filename)
    assert.ok(filepath.startsWith(thumbnailsDir + path.sep))
    assert.equal(fs.existsSync(filepath), true)
  })

  it('拒绝非白名单扩展名（gif/svg）且不落盘', async () => {
    const project = await projectService.createProject({ name: 'p', userId: 'default' })
    const before = coverFiles().length

    const gif = await request(app)
      .post(`/api/projects/${project.id}/cover`)
      .send({ image: `data:image/gif;base64,${Buffer.from('gif').toString('base64')}` })
    assert.equal(gif.status, 400)

    const svg = await request(app)
      .post(`/api/projects/${project.id}/cover`)
      .send({
        image: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
      })
    assert.equal(svg.status, 400)
    assert.equal(coverFiles().length, before)
  })

  it('拒绝路径穿越式 projectId，不在 thumbnails 外生成文件', async () => {
    const res = await request(app)
      .post('/api/projects/..%2F..%2Fevil/cover')
      .send({ image: pngPayload })

    assert.ok([400, 404].includes(res.status), `unexpected status ${res.status}`)
    assert.equal(coverFiles().length, 0)
    assert.equal(fs.existsSync(path.join(testStorage, 'evil')), false)
  })

  it('非 owner 上传返回 403 且不落盘', async () => {
    const project = await projectService.createProject({ name: 'p', userId: 'someone-else' })

    const res = await request(app)
      .post(`/api/projects/${project.id}/cover`)
      .send({ image: pngPayload })

    assert.equal(res.status, 403)
    assert.equal(coverFiles().length, 0)
  })
})
