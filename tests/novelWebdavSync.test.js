const WRONG_PW = 'wrong-password'
import { describe, it, after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import http from 'http'
import path from 'path'
import request from 'supertest'
import app from '../src/server.js'
import { createNovelProject, novelDir } from '../src/services/novelProjectService.js'
import { ingestNovel } from '../src/services/novelChunkService.js'
import { buildManifest, syncToWebdav, getLedger, getSyncState } from '../src/services/novelSyncService.js'

const SAMPLE = `第1章 起点
张三走在路上，张三看见李四。
李四说：张三你好。
第2章 转折
王五出现，王五和张三对望。
`

/** 最小可控 WebDAV 服务器：MKCOL / PUT / HEAD */
function createFakeWebdav() {
  const files = new Map() // pathname -> Buffer
  const collections = new Set()
  const state = {
    auth: '',
    putFailures: 0, // 前 N 次 PUT 返回 500（测重试）
    puts: 0,
    mkcols: 0,
    heads: 0,
  }

  const server = http.createServer(async (req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    if (state.auth && req.headers.authorization !== state.auth) {
      res.writeHead(401)
      return res.end()
    }
    if (req.method === 'MKCOL') {
      state.mkcols++
      if (files.has(pathname) || collections.has(pathname)) {
        res.writeHead(405)
        return res.end()
      }
      collections.add(pathname)
      res.writeHead(201)
      return res.end()
    }
    if (req.method === 'HEAD') {
      state.heads++
      if (files.has(pathname) || collections.has(pathname)) {
        res.writeHead(200)
        return res.end()
      }
      res.writeHead(404)
      return res.end()
    }
    if (req.method === 'PUT') {
      state.puts++
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      if (state.putFailures > 0) {
        state.putFailures--
        res.writeHead(500)
        return res.end()
      }
      files.set(pathname, Buffer.concat(chunks))
      res.writeHead(201)
      return res.end()
    }
    res.writeHead(405)
    res.end()
  })

  return {
    server,
    files,
    collections,
    state,
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      return `http://127.0.0.1:${server.address().port}`
    },
    async close() {
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

describe('Sprint 30 网盘同步：WebDAV 真实上传 + 增量去重 + 重试', () => {
  const created = []
  let dav
  let baseUrl
  const AUTH = `Basic ${Buffer.from('user:secret').toString('base64')}`

  before(async () => {
    dav = createFakeWebdav()
    baseUrl = await dav.start()
    dav.state.auth = AUTH
  })

  after(async () => {
    for (const id of created) {
      try {
        fs.rmSync(novelDir(id), { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    await dav.close()
  })

  function makeNovel(title) {
    const project = createNovelProject({ title })
    created.push(project.id)
    ingestNovel(project.id, { sourceType: 'text', text: SAMPLE })
    return project.id
  }

  it('首个同步：全部文件真实上传到 WebDAV（目录 + 文件）', async () => {
    const id = makeNovel('WebDAV首次')
    const total = buildManifest(id, { scope: 'all' }).length
    assert.ok(total >= 3)

    const report = await syncToWebdav(id, {
      url: baseUrl,
      username: 'user',
      password: 'secret',
      root: 'DreamReel',
      remoteDir: `novels/${id}`,
      scope: 'all',
    })

    assert.equal(report.backend, 'webdav')
    assert.equal(report.uploaded, total)
    assert.equal(report.skipped, 0)
    assert.deepEqual(report.failed, [])
    assert.equal(dav.files.size, total)
    for (const key of dav.files.keys()) assert.ok(key.startsWith(`/DreamReel/novels/${id}/`), key)
    assert.ok(dav.collections.size >= 1)
  })

  it('二次同步：内容未变则全部跳过（增量去重）', async () => {
    const id = makeNovel('WebDAV增量')
    const total = buildManifest(id, { scope: 'all' }).length
    const opts = { url: baseUrl, username: 'user', password: 'secret', remoteDir: `inc/${id}`, scope: 'all' }

    const first = await syncToWebdav(id, opts)
    assert.equal(first.uploaded, total)

    const putsBefore = dav.state.puts
    const second = await syncToWebdav(id, opts)
    assert.equal(second.uploaded, 0)
    assert.equal(second.skipped, total)
    assert.equal(dav.state.puts, putsBefore, '未变化时不应有 PUT')
  })

  it('内容变化后只重传该文件', async () => {
    const id = makeNovel('WebDAV变更')
    const opts = { url: baseUrl, username: 'user', password: 'secret', remoteDir: `delta/${id}`, scope: 'all' }
    await syncToWebdav(id, opts)

    const rawPath = path.join(novelDir(id), 'source', 'raw.txt')
    fs.appendFileSync(rawPath, '\n第3章 追加\n张三再次出现。\n')

    const report = await syncToWebdav(id, opts)
    assert.equal(report.uploaded, 1)
    assert.equal(report.skipped, buildManifest(id, { scope: 'all' }).length - 1)
  })

  it('dry-run 只返回计划、不产生 PUT', async () => {
    const id = makeNovel('WebDAV预习')
    const putsBefore = dav.state.puts
    const report = await syncToWebdav(id, {
      url: baseUrl,
      username: 'user',
      password: 'secret',
      remoteDir: `dry/${id}`,
      dryRun: true,
      scope: 'all',
    })
    assert.equal(report.dryRun, true)
    assert.equal(report.changed, buildManifest(id, { scope: 'all' }).length)
    assert.equal(dav.state.puts, putsBefore)
  })

  it('onConflict=skip：远端已存在则跳过（HEAD 探测）', async () => {
    const id = makeNovel('WebDAV跳过')
    const opts = { url: baseUrl, username: 'user', password: 'secret', remoteDir: `skip/${id}`, scope: 'all' }
    await syncToWebdav(id, opts)

    // 清掉 ledger 模拟「换了台机器」，但远端文件还在
    fs.rmSync(path.join(novelDir(id), 'sync'), { recursive: true, force: true })

    const total = buildManifest(id, { scope: 'all' }).length
    const putsBefore = dav.state.puts
    const report = await syncToWebdav(id, { ...opts, onConflict: 'skip' })
    assert.equal(report.uploaded, 0)
    assert.equal(report.skipped, total)
    assert.equal(dav.state.puts, putsBefore)
    assert.ok(dav.state.heads >= total)
  })

  it('瞬态 500 自动重试后成功', async () => {
    const id = makeNovel('WebDAV重试')
    dav.state.putFailures = 1
    const report = await syncToWebdav(id, {
      url: baseUrl,
      username: 'user',
      password: 'secret',
      remoteDir: `retry/${id}`,
      retries: 2,
      scope: 'all',
    })
    assert.equal(report.failed.length, 0)
    assert.equal(report.uploaded, buildManifest(id, { scope: 'all' }).length)
  })

  it('鉴权失败：逐文件失败上报（不抛异常、不阻塞）', async () => {
    const id = makeNovel('WebDAV鉴权')
    const total = buildManifest(id, { scope: 'all' }).length
    const report = await syncToWebdav(id, {
      url: baseUrl,
      username: 'user',
      password: WRONG_PW,
      remoteDir: `auth/${id}`,
      retries: 0,
      scope: 'all',
    })
    assert.equal(report.uploaded, 0)
    assert.equal(report.failed.length, total)
    assert.match(report.failed[0].error, /401/)
  })

  it('HTTP：POST /sync backend=webdav + GET /sync/ledger', async () => {
    const res0 = await request(app).post('/api/novels').send({ title: 'HTTP-WebDAV' })
    const id = res0.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })

    const res = await request(app).post(`/api/novels/${id}/sync`).send({
      backend: 'webdav',
      url: baseUrl,
      username: 'user',
      password: 'secret',
      remoteDir: `http/${id}`,
      scope: 'all',
    })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.uploaded, buildManifest(id, { scope: 'all' }).length)

    const ledger = await request(app).get(`/api/novels/${id}/sync/ledger`)
    assert.equal(ledger.status, 200)
    assert.ok(ledger.body.data.entries.length >= 1)
    assert.equal(getLedger(id).entries.length, ledger.body.data.entries.length)
    assert.equal(getSyncState(id).last.backend, 'webdav')
    assert.equal(ledger.body.data.last.backend, 'webdav')
  })

  it('清单排除系统垃圾文件与 sync/ 自身', async () => {
    const id = makeNovel('WebDAV过滤')
    fs.writeFileSync(path.join(novelDir(id), '.DS_Store'), 'junk')
    fs.writeFileSync(path.join(novelDir(id), 'source', 'raw.txt~'), 'backup')
    const manifest = buildManifest(id, { scope: 'all' })
    assert.ok(!manifest.some((f) => f.rel.includes('.DS_Store')))
    assert.ok(!manifest.some((f) => f.rel.endsWith('~')))
    assert.ok(!manifest.some((f) => f.rel.startsWith('sync')))
  })

  it('未配置 WebDAV 时如实报错', async () => {
    const id = makeNovel('WebDAV未配置')
    await assert.rejects(
      () => syncToWebdav(id, { url: '', username: '', password: '', root: 'X', remoteDir: 'y' }),
      /WebDAV 未配置/
    )
  })
})
