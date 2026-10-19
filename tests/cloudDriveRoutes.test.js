import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import http from 'http'
import os from 'os'
import path from 'path'
import request from 'supertest'

/**
 * 网盘登录路由测试。
 * 用本地 mock 夸克登录服务，通过 QUARK_AUTH_BASE/QUARK_PAN_BASE 环境变量注入，
 * 因此在任何模块导入前先设好 env，再动态 import app。
 */
const testStorage = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-clouddrive-'))
process.env.NODE_ENV = 'test'
process.env.STORAGE_PATH = testStorage
process.env.QUARK_COOKIE = ''
process.env.QUARK_COOKIE_FILE = path.join(testStorage, '.quark-cookie')

const state = { polls: 0, pendingTimes: 1, loginRejects: false, ticket: 0 }

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const p = url.pathname
  if (p.endsWith('/cas/ajax/getTokenForQrcodeLogin')) {
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ status: 2000000, message: 'ok', data: { members: { token: `qr-${Date.now()}` } } }))
  }
  if (p.endsWith('/cas/ajax/getServiceTicketByQrcodeToken')) {
    state.polls += 1
    if (state.polls > state.pendingTimes) {
      state.ticket += 1
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ status: 2000000, message: 'ok', data: { members: { service_ticket: `t-${state.ticket}` } } }))
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ status: 50004001, message: 'waiting' }))
  }
  if (p.endsWith('/account/info')) {
    if (state.loginRejects) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end('{}') // 无 Set-Cookie → 服务端应判定失败
    }
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': ['__puus=ok; Path=/; Domain=.quark.cn'],
    })
    return res.end(JSON.stringify({ status: 200, data: { nickname: 'u' } }))
  }
  if (p.endsWith('/file/sort')) {
    if (!String(req.headers.cookie || '').includes('__puus=ok')) {
      res.writeHead(401)
      return res.end()
    }
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify({ status: 200, code: 0, data: { list: [], _total: 0 } }))
  }
  res.writeHead(404)
  res.end()
})

await new Promise((r) => server.listen(0, '127.0.0.1', r))
const port = server.address().port
process.env.QUARK_AUTH_BASE = `http://127.0.0.1:${port}`
process.env.QUARK_PAN_BASE = `http://127.0.0.1:${port}`
process.env.QUARK_API_BASE = `http://127.0.0.1:${port}/1/clouddrive`

const { default: app } = await import('../src/server.js')

describe('网盘登录入口（/api/cloud-drive）', () => {
  before(() => {
    state.polls = 0
    state.pendingTimes = 1
    state.loginRejects = false
  })
  after(async () => {
    await new Promise((r) => server.close(r))
    fs.rmSync(testStorage, { recursive: true, force: true })
  })

  it('POST /quark/qr 返回可展示的 SVG 与轮询 token', async () => {
    const res = await request(app).post('/api/cloud-drive/quark/qr').send({})
    assert.equal(res.status, 200)
    assert.ok(res.body.data.token)
    assert.match(res.body.data.svg, /^<svg /)
    assert.ok(res.body.data.expiresInSec > 0)
  })

  it('轮询：pending → success，cookie 落盘且不返回给前端', async () => {
    state.polls = 0
    state.pendingTimes = 1
    const qr = await request(app).post('/api/cloud-drive/quark/qr').send({})
    const token = qr.body.data.token

    const first = await request(app).get(`/api/cloud-drive/quark/qr/${token}/status`)
    assert.equal(first.body.data.state, 'pending')

    const second = await request(app).get(`/api/cloud-drive/quark/qr/${token}/status`)
    assert.equal(second.body.data.state, 'success')
    assert.equal(second.body.data.canListRoot, true)
    assert.equal(JSON.stringify(second.body).includes('__puus'), false, '响应不得包含 cookie')

    const saved = fs.readFileSync(process.env.QUARK_COOKIE_FILE, 'utf-8')
    assert.match(saved, /__puus=ok/)
  })

  it('未知 token → 404（二维码会过期）', async () => {
    const res = await request(app).get('/api/cloud-drive/quark/qr/nope/status')
    assert.equal(res.status, 404)
  })

  it('GET /quark/status 反映登录来源，?verify=1 走真实校验', async () => {
    const res = await request(app).get('/api/cloud-drive/quark/status')
    assert.equal(res.body.data.configured, true)
    assert.equal(res.body.data.source, 'file')

    const verified = await request(app).get('/api/cloud-drive/quark/status?verify=1')
    assert.equal(verified.body.data.verified, true)
  })

  it('登录态不可用（无 cookie 返回）→ state=failed 且不写文件', async () => {
    fs.rmSync(process.env.QUARK_COOKIE_FILE, { force: true })
    state.polls = 0
    state.pendingTimes = 0
    state.loginRejects = true
    const qr = await request(app).post('/api/cloud-drive/quark/qr').send({})
    const res = await request(app).get(`/api/cloud-drive/quark/qr/${qr.body.data.token}/status`)
    assert.equal(res.body.data.state, 'failed')
    assert.equal(fs.existsSync(process.env.QUARK_COOKIE_FILE), false)
    state.loginRejects = false
  })

  it('POST /quark/logout 删除落盘 cookie', async () => {
    state.polls = 0
    state.pendingTimes = 0
    const qr = await request(app).post('/api/cloud-drive/quark/qr').send({})
    await request(app).get(`/api/cloud-drive/quark/qr/${qr.body.data.token}/status`)
    assert.ok(fs.existsSync(process.env.QUARK_COOKIE_FILE))

    const res = await request(app).post('/api/cloud-drive/quark/logout').send({})
    assert.equal(res.body.data.removed, true)
    assert.equal(fs.existsSync(process.env.QUARK_COOKIE_FILE), false)
  })
})
