const QR_TOKEN = 'qr-token-123'
import { describe, it, after, before } from 'node:test'
import assert from 'node:assert/strict'
import http from 'http'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { QuarkAuth, QuarkAuthError, saveCookie, loadCookie } from '../src/services/quarkAuth.js'
import { QuarkClient } from '../src/services/quarkClient.js'

/** 最小可控夸克登录服务器：token → 轮询 → service ticket → Set-Cookie */
function createFakeQuarkAuth() {
  const state = { polls: 0, pendingTimes: 1, setCookieCalled: 0, expired: false, tickets: 0 }
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const p = url.pathname

    if (p.endsWith('/cas/ajax/getTokenForQrcodeLogin')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ status: 2000000, message: 'ok', data: { members: { token: QR_TOKEN } } }))
    }
    if (p.endsWith('/cas/ajax/getServiceTicketByQrcodeToken')) {
      state.polls += 1
      // 前 N 次返回「等待扫码」，之后返回成功
      if (state.expired) {
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ status: 50004002, message: 'expired' }))
      }
      if (state.polls > state.pendingTimes) {
        state.tickets += 1
        res.writeHead(200, { 'content-type': 'application/json' })
        return res.end(JSON.stringify({ status: 2000000, message: 'ok', data: { members: { service_ticket: `ticket-${state.tickets}` } } }))
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ status: 50004001, message: 'waiting' }))
    }
    if (p.endsWith('/account/info')) {
      state.setCookieCalled += 1
      const st = url.searchParams.get('st') || ''
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': ['__puus=puus-abc; Path=/; Domain=.quark.cn; HttpOnly', '__uid=12345; Path=/; Domain=.quark.cn'],
      })
      return res.end(JSON.stringify({ status: 200, data: { nickname: '测试用户', st } }))
    }
    // 伪 drive api，用于验证 cookie 可用性
    if (p.endsWith('/file/sort')) {
      const cookie = req.headers.cookie || ''
      if (!cookie.includes('__puus=puus-abc')) {
        res.writeHead(401)
        return res.end()
      }
      res.writeHead(200, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ status: 200, code: 0, data: { list: [], _total: 0 } }))
    }
    res.writeHead(404)
    res.end()
  })
  return {
    server,
    state,
    async start() {
      await new Promise((r) => server.listen(0, '127.0.0.1', r))
      const port = server.address().port
      return { authBase: `http://127.0.0.1:${port}`, panBase: `http://127.0.0.1:${port}` }
    },
    async close() {
      await new Promise((r) => server.close(r))
    },
  }
}

describe('Sprint 32 夸克扫码登录', () => {
  let fake
  let endpoints

  before(async () => {
    fake = createFakeQuarkAuth()
    endpoints = await fake.start()
  })
  after(async () => {
    await fake.close()
  })

  const newAuth = () => new QuarkAuth({ authBase: endpoints.authBase, panBase: endpoints.panBase })
  const noSleep = () => Promise.resolve()

  it('createQrSession 返回 token 与可扫码 URL', async () => {
    const session = await newAuth().createQrSession()
    assert.equal(session.token, 'qr-token-123')
    assert.ok(session.requestId)
    const u = new URL(session.qrUrl)
    assert.equal(u.origin + u.pathname, 'https://su.quark.cn/4_eMHBJ')
    assert.equal(u.searchParams.get('token'), 'qr-token-123')
    assert.equal(u.searchParams.get('client_id'), '532')
    assert.equal(u.searchParams.get('ssb'), 'weblogin')
  })

  it('轮询：等待 → 成功 → 换到 cookie', async () => {
    fake.state.polls = 0
    fake.state.pendingTimes = 2
    const auth = newAuth()
    const session = await auth.createQrSession()
    const states = []
    const result = await auth.waitForScan(session, { onPoll: (s) => states.push(s), sleep: noSleep })
    assert.deepEqual(states, ['pending', 'pending', 'success'])
    assert.match(result.cookie, /__puus=puus-abc/)
    assert.match(result.cookie, /__uid=12345/)
    assert.equal(fake.state.setCookieCalled, 1)
  })

  it('拿到的 cookie 可用于夸克 API（checkAuth 通过）', async () => {
    fake.state.polls = 0
    fake.state.pendingTimes = 0
    const auth = newAuth()
    const session = await auth.createQrSession()
    const { cookie } = await auth.waitForScan(session, { sleep: noSleep })
    const client = new QuarkClient({ cookie, apiBase: `${endpoints.panBase}/1/clouddrive` })
    const probe = await client.checkAuth()
    assert.equal(probe.ok, true)
  })

  it('二维码过期 → 明确失败', async () => {
    fake.state.expired = true
    fake.state.polls = 0
    const auth = newAuth()
    const session = await auth.createQrSession()
    await assert.rejects(() => auth.waitForScan(session, { sleep: noSleep }), /失效|拒绝/)
    fake.state.expired = false
  })

  it('轮询超时 → 明确失败（不无限等待）', async () => {
    fake.state.polls = 0
    fake.state.pendingTimes = 999
    const auth = newAuth()
    const session = await auth.createQrSession()
    await assert.rejects(() => auth.waitForScan(session, { timeoutMs: 0, sleep: noSleep }), /超时/)
    fake.state.pendingTimes = 1
  })

  it('cookie 落盘（0600）并可回读', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-quark-cookie-'))
    const file = path.join(dir, '.quark-cookie')
    saveCookie('__puus=abc; __uid=1', file)
    assert.equal(loadCookie(file), '__puus=abc; __uid=1')
    const mode = fs.statSync(file).mode & 0o777
    assert.equal(mode, 0o600, 'cookie 文件权限应为 0600')
    assert.equal(loadCookie(path.join(dir, 'missing')), '')
  })

  it('登录态接口若无 cookie 返回 → 明确报错', async () => {
    const bare = http.createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{}')
    })
    await new Promise((r) => bare.listen(0, '127.0.0.1', r))
    const port = bare.address().port
    const auth = new QuarkAuth({ authBase: `http://127.0.0.1:${port}`, panBase: `http://127.0.0.1:${port}` })
    await assert.rejects(() => auth.completeLogin('ticket'), QuarkAuthError)
    await new Promise((r) => bare.close(r))
  })
})
