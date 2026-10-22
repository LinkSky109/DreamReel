import { describe, it, after, before } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import http from 'http'
import crypto from 'crypto'
import path from 'path'
import { createNovelProject, novelDir } from '../src/services/novelProjectService.js'
import { ingestNovel } from '../src/services/novelChunkService.js'
import { buildManifest, syncToQuark } from '../src/services/novelSyncService.js'
import { QuarkClient } from '../src/services/quarkClient.js'

const SAMPLE = `第1章 起点
张三走在路上，张三看见李四。
第2章 转折
王五出现，王五和张三对望。
`
const COOKIE = 'test-cookie=1; __puus=abc'

/** 最小可控夸克服务器：业务 API + 伪 OSS（PUT 分片 / POST 合并） */
function createFakeQuark() {
  const folders = new Map([['0', { name: '', parent: null }]])
  const files = new Map() // fid -> { name, parent, size, parts }
  const uploads = new Map() // uploadId -> { name, parent, parts: Map<number, Buffer> }
  const state = { pre: 0, puts: 0, completes: 0, finishes: 0, deletes: 0, mkdirs: 0, authFailures: 0, hashCtxParts: [] }
  let nextFid = 1

  const childrenOf = (fid) => [
    ...[...folders.entries()].filter(([id, f]) => f.parent === fid && id !== '0').map(([id, f]) => ({ fid: id, file_name: f.name, file_type: '0', dir: true })),
    ...[...files.entries()].filter(([, f]) => f.parent === fid).map(([id, f]) => ({ fid: id, file_name: f.name, file_type: '1', size: f.size })),
  ]

  const readBody = async (req) => {
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    return Buffer.concat(chunks)
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost')
    const p = url.pathname

    // 伪 OSS：/{bucket}/{objKey...}?partNumber=&uploadId=
    if (p.startsWith('/ul-zb/')) {
      const uploadId = url.searchParams.get('uploadId')
      const partNumber = url.searchParams.get('partNumber')
      const buf = await readBody(req)
      if (req.method === 'PUT') {
        state.puts++
        state.hashCtxParts.push({ part: Number(partNumber), ctx: req.headers['x-oss-hash-ctx'] || null })
        const up = uploads.get(uploadId)
        if (!up) {
          res.writeHead(404)
          return res.end()
        }
        up.parts.set(Number(partNumber), buf)
        const etag = crypto.createHash('md5').update(buf).digest('hex')
        res.writeHead(200, { etag: `"${etag}"` })
        return res.end()
      }
      if (req.method === 'POST') {
        state.completes++
        res.writeHead(200, { 'content-type': 'application/xml' })
        return res.end('<CompleteMultipartUploadResult><ETag>"ok"</ETag></CompleteMultipartUploadResult>')
      }
    }

    if (req.headers.cookie !== COOKIE) {
      state.authFailures++
      res.writeHead(401, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ status: 401, code: 40100, message: 'login required' }))
    }

    const ok = (data) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 200, code: 0, message: 'ok', data }))
    }

    if (p.endsWith('/file/sort') && req.method === 'GET') {
      const pdir = url.searchParams.get('pdir_fid') || '0'
      const list = childrenOf(pdir)
      return ok({ list, _total: list.length })
    }
    if (p.endsWith('/file') && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8'))
      state.mkdirs++
      const fid = String(nextFid++)
      folders.set(fid, { name: body.file_name, parent: body.pdir_fid })
      return ok({ fid })
    }
    if (p.endsWith('/file/delete') && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8'))
      state.deletes += 1
      for (const fid of body.filelist || []) files.delete(fid)
      return ok({ task_id: 'del' })
    }
    if (p.endsWith('/file/upload/pre') && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8'))
      state.pre++
      const uploadId = `up-${state.pre}`
      uploads.set(uploadId, { name: body.file_name, parent: body.pdir_fid, size: body.size, parts: new Map() })
      return ok({
        task_id: `task-${state.pre}`,
        auth_info: 'authinfo',
        upload_id: uploadId,
        obj_key: `${body.pdir_fid}/${body.file_name}`,
        bucket: 'ul-zb',
        callback: { callbackUrl: 'https://callback.local', callbackBody: 'x' },
      })
    }
    if (p.endsWith('/file/update/hash') && req.method === 'POST') {
      await readBody(req)
      return ok({})
    }
    if (p.endsWith('/file/upload/auth') && req.method === 'POST') {
      await readBody(req)
      return ok({ auth_key: 'sig-v1' })
    }
    if (p.endsWith('/file/upload/finish') && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8'))
      state.finishes++
      const taskNum = String(body.task_id).replace('task-', '')
      const up = uploads.get(`up-${taskNum}`)
      if (up) {
        const fid = String(nextFid++)
        files.set(fid, { name: up.name, parent: up.parent, size: up.size })
        return ok({ fid })
      }
      return ok({})
    }

    res.writeHead(404)
    res.end()
  })

  return {
    server,
    state,
    files,
    folders,
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
      const port = server.address().port
      return {
        apiBase: `http://127.0.0.1:${port}/1/clouddrive`,
        ossUrl: ({ objKey, query }) => `http://127.0.0.1:${port}/ul-zb/${objKey}${query || ''}`,
      }
    },
    async close() {
      await new Promise((resolve) => server.close(resolve))
    },
  }
}

describe('Sprint 31 夸克网盘同步：真实上传协议 + 增量 + 冲突 + 重试', () => {
  const created = []
  let fake
  let endpoints
  let client

  before(async () => {
    fake = createFakeQuark()
    endpoints = await fake.start()
    client = new QuarkClient({ cookie: COOKIE, apiBase: endpoints.apiBase, ossUrl: endpoints.ossUrl })
  })

  after(async () => {
    for (const id of created) {
      try {
        fs.rmSync(novelDir(id), { recursive: true, force: true })
      } catch {
        /* ignore */
      }
    }
    await fake.close()
  })

  async function makeNovel(title) {
    const project = await createNovelProject({ title })
    created.push(project.id)
    await ingestNovel(project.id, { sourceType: 'text', text: SAMPLE })
    return project.id
  }

  it('首个同步：真实调用 pre/auth/PUT/finish 并落盘（单分片）', async () => {
    const id = await makeNovel('夸克首次')
    const total = buildManifest(id, { scope: 'all' }).length
    const report = await syncToQuark(id, { client, root: 'DreamReel', scope: 'all' })

    assert.equal(report.backend, 'quark')
    assert.equal(report.uploaded, total)
    assert.deepEqual(report.failed, [])
    assert.equal(fake.state.pre, total)
    assert.equal(fake.state.finishes, total)
    assert.equal(fake.state.puts, total) // 每个文件 < partSize → 单分片
    assert.equal(fake.files.size, total)
    assert.ok([...fake.folders.values()].some((f) => f.name === 'DreamReel' && f.parent === '0'), '应创建根目录 DreamReel')
  })

  it('二次同步：内容未变全部跳过（增量去重）', async () => {
    const id = await makeNovel('夸克增量')
    const total = buildManifest(id, { scope: 'all' }).length
    await syncToQuark(id, { client, scope: 'all' })
    const preBefore = fake.state.pre
    const report = await syncToQuark(id, { client, scope: 'all' })
    assert.equal(report.uploaded, 0)
    assert.equal(report.skipped, total)
    assert.equal(fake.state.pre, preBefore, '未变化不应再发预上传请求')
  })

  it('大文件走多分片（按 partSize 切分）', async () => {
    const id = await makeNovel('夸克分片')
    const bigPath = path.join(novelDir(id), 'assets', 'big.bin')
    fs.writeFileSync(bigPath, crypto.randomBytes(3000))
    const small = new QuarkClient({ cookie: COOKIE, apiBase: endpoints.apiBase, ossUrl: endpoints.ossUrl, partSize: 1024 })

    const putsBefore = fake.state.puts
    const completesBefore = fake.state.completes
    fake.state.hashCtxParts = []
    const report = await syncToQuark(id, { client: small, scope: 'all' })
    assert.deepEqual(report.failed, [])
    const manifest = buildManifest(id, { scope: 'all' })
    const expectedPuts = manifest.reduce((n, f) => n + Math.ceil(f.size / 1024), 0)
    assert.equal(fake.state.puts - putsBefore, expectedPuts, '分片数应等于 Σceil(size/partSize)')
    assert.ok(fake.state.puts - putsBefore > manifest.length, '大文件应产生多分片')
    assert.equal(fake.state.completes - completesBefore, manifest.length)

    // 并行分片：第 2 片起必须带 x-oss-hash-ctx（否则真实 OSS 返回 NoHashContext）
    const withCtx = fake.state.hashCtxParts.filter((x) => x.part > 1)
    assert.ok(withCtx.length > 0, '多分片时应发送 hash ctx')
    for (const { part, ctx } of withCtx) {
      assert.ok(ctx, `分片 ${part} 缺少 x-oss-hash-ctx`)
      const decoded = JSON.parse(Buffer.from(ctx, 'base64').toString('utf8'))
      assert.equal(decoded.hash_type, 'sha1')
      assert.equal(Number(decoded.Nl), (part - 1) * 1024 * 8, `分片 ${part} 的 Nl 应为前序比特数`)
    }
  })

  it('onConflict=overwrite：远端同名先删除再上传（不产生副本）', async () => {
    const id = await makeNovel('夸克覆盖')
    await syncToQuark(id, { client, scope: 'all' })
    fs.rmSync(path.join(novelDir(id), 'sync'), { recursive: true, force: true }) // 模拟换机器

    const total = buildManifest(id, { scope: 'all' }).length
    const deletesBefore = fake.state.deletes
    const report = await syncToQuark(id, { client, onConflict: 'overwrite', scope: 'all' })
    assert.equal(report.uploaded, total)
    assert.ok(fake.state.deletes - deletesBefore >= total, '每个同名文件都应先删除')
  })

  it('onConflict=skip：远端已存在则跳过', async () => {
    const id = await makeNovel('夸克跳过')
    await syncToQuark(id, { client, scope: 'all' })
    fs.rmSync(path.join(novelDir(id), 'sync'), { recursive: true, force: true })

    const total = buildManifest(id, { scope: 'all' }).length
    const deletesBefore = fake.state.deletes
    const report = await syncToQuark(id, { client, onConflict: 'skip', scope: 'all' })
    assert.equal(report.uploaded, 0)
    assert.equal(report.skipped, total)
    assert.equal(fake.state.deletes, deletesBefore)
  })

  it('dry-run 只返回计划、不触发任何上传', async () => {
    const id = await makeNovel('夸克预习')
    const preBefore = fake.state.pre
    const report = await syncToQuark(id, { client, dryRun: true, scope: 'all' })
    assert.equal(report.dryRun, true)
    assert.equal(report.changed, buildManifest(id, { scope: 'all' }).length)
    assert.equal(fake.state.pre, preBefore)
  })

  it('未提供 cookie → 如实报错', async () => {
    const id = await makeNovel('夸克无cookie')
    await assert.rejects(() => syncToQuark(id, { cookie: '', scope: 'all' }), /QUARK_COOKIE/)
  })

  it('cookie 失效（401）→ 逐文件失败上报，不阻塞', async () => {
    const id = await makeNovel('夸克鉴权')
    const total = buildManifest(id, { scope: 'all' }).length
    const bad = new QuarkClient({ cookie: 'wrong', apiBase: endpoints.apiBase, ossUrl: endpoints.ossUrl })
    const report = await syncToQuark(id, { client: bad, retries: 0, scope: 'all' })
    assert.equal(report.uploaded, 0)
    assert.ok(report.failed.length >= 1)
    assert.match(report.failed[0].error, /鉴权失败|401/)
    assert.ok(total >= 1)
  })
})
