import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert'
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import config from '../src/config/index.js'
import { ComfyuiVideoProvider } from '../src/providers/comfyuiVideoProvider.js'
import { readInvocationMetrics, metricsDir } from '../src/services/metricsStore.js'


/**
 * 假 ComfyUI 服务：模拟 /system_stats /prompt /history /view /interrupt /queue /upload/image
 */
function startFakeComfy(opts = {}) {
  const state = { historyCalls: 0, interrupted: false, queueDeleted: false, submitted: null }
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x')
    const send = (code, body, type = 'application/json') => {
      res.writeHead(code, { 'Content-Type': type })
      res.end(body)
    }
    if (url.pathname === '/system_stats') return send(200, JSON.stringify({ system: { os: 'test' } }))
    if (url.pathname === '/prompt') {
      let raw = ''
      req.on('data', (c) => (raw += c))
      req.on('end', () => {
        state.submitted = JSON.parse(raw)
        if (opts.rejectPrompt) return send(400, JSON.stringify({ error: { message: 'bad' }, node_errors: { 9: 'x' } }))
        send(200, JSON.stringify({ prompt_id: 'pid-1' }))
      })
      return
    }
    if (url.pathname.startsWith('/history/')) {
      state.historyCalls += 1
      const doneAfter = opts.doneAfter ?? 1
      if (state.historyCalls < doneAfter) return send(200, JSON.stringify({}))
      if (opts.execError) {
        return send(200, JSON.stringify({
          'pid-1': { status: { status_str: 'error', completed: true, messages: [['execution_error', { exception_type: 'torch.OutOfMemoryError', exception_message: 'OOM' }]] }, outputs: {} },
        }))
      }
      return send(200, JSON.stringify({
        'pid-1': { status: { status_str: 'success', completed: true }, outputs: { '11': { images: [{ filename: 'out.webm', subfolder: '', type: 'output' }] } } },
      }))
    }
    if (url.pathname === '/view') {
      const bytes = opts.bigOutput ? Buffer.alloc(100, 1) : Buffer.from('WEBMDATA')
      res.writeHead(200, { 'Content-Type': 'video/webm' })
      return res.end(bytes)
    }
    if (url.pathname === '/interrupt') { state.interrupted = true; return send(200, '') }
    if (url.pathname === '/queue') { state.queueDeleted = true; return send(200, '{}') }
    if (url.pathname === '/upload/image') { return send(200, JSON.stringify({ name: 'uploaded.png' })) }
    return send(404, '{}')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, state, url: `http://127.0.0.1:${server.address().port}` }))
  })
}

function providerFor(url, extra = {}) {
  return new ComfyuiVideoProvider({
    comfyui: {
      baseUrl: url,
      allowedHosts: ['127.0.0.1'],
      pollIntervalMs: 5,
      maxPollMs: 10000,
      submitTimeoutMs: 2000,
      downloadMaxBytes: 1024 * 1024,
      maxConcurrent: 1,
      ...extra,
    },
  })
}

describe('ComfyuiVideoProvider', () => {
  let ctx
  before(async () => {
    ctx = await startFakeComfy({ doneAfter: 2 })
  })
  after(() => ctx.server.close())
  beforeEach(() => fs.rmSync(metricsDir(), { recursive: true, force: true }))

  it('healthCheck 返回 true', async () => {
    const p = providerFor(ctx.url)
    assert.strictEqual(await p.healthCheck(), true)
  })

  it('提交 → 轮询 → 完成 → 下载产物到 storage/videos', async () => {
    const p = providerFor(ctx.url)
    const { taskId, status } = await p.generateVideo({ prompt: 'a cat', startImage: 'sample_scene.png' })
    assert.strictEqual(status, 'generating')
    assert.strictEqual(taskId, 'pid-1')

    let st = await p.getTaskStatus(taskId)
    assert.strictEqual(st.status, 'generating') // 第一次未完成
    st = await p.getTaskStatus(taskId)
    assert.strictEqual(st.status, 'completed')
    assert.match(st.videoUrl, /^\/storage\/videos\/comfy_.+\.webm$/)
    const localFile = path.join(config.storage.path, st.videoUrl.replace('/storage/', ''))
    assert.strictEqual(fs.existsSync(localFile), true)
    assert.strictEqual(fs.readFileSync(localFile, 'utf-8'), 'WEBMDATA')
  })

  it('提交体使用 API 格式工作流且含 prompt_id 所需结构', async () => {
    const p = providerFor(ctx.url)
    await p.generateVideo({ prompt: 'hello', startImage: 'sample_scene.png' })
    const body = ctx.state.submitted
    assert.ok(body.prompt && body.client_id)
    assert.strictEqual(body.prompt['9'].class_type, 'KSampler')
    assert.strictEqual(body.prompt['5'].inputs.text, 'hello')
    assert.ok(!JSON.stringify(body.prompt).includes('_meta'))
  })

  it('执行失败时返回 failed 并带异常信息', async () => {
    const bad = await startFakeComfy({ doneAfter: 1, execError: true })
    try {
      const p = providerFor(bad.url)
      const { taskId } = await p.generateVideo({ prompt: 'x', startImage: 'a.png' })
      const st = await p.getTaskStatus(taskId)
      assert.strictEqual(st.status, 'failed')
      assert.match(st.error, /OutOfMemoryError|OOM/)
    } finally {
      bad.server.close()
    }
  })

  it('/prompt 400 时抛错并带 node_errors', async () => {
    const bad = await startFakeComfy({ rejectPrompt: true })
    try {
      const p = providerFor(bad.url)
      await assert.rejects(() => p.generateVideo({ prompt: 'x', startImage: 'a.png' }), /node_errors|400/)
    } finally {
      bad.server.close()
    }
  })

  it('下载超过上限时报错', async () => {
    const big = await startFakeComfy({ doneAfter: 1, bigOutput: true })
    try {
      const p = providerFor(big.url, { downloadMaxBytes: 10 })
      const { taskId } = await p.generateVideo({ prompt: 'x', startImage: 'a.png' })
      const st = await p.getTaskStatus(taskId)
      assert.strictEqual(st.status, 'failed')
      assert.match(st.error, /上限/)
    } finally {
      big.server.close()
    }
  })

  it('看门狗：超时自动取消并返回 failed', async () => {
    const slow = await startFakeComfy({ doneAfter: 999 })
    try {
      const p = providerFor(slow.url, { maxPollMs: 0 })
      const { taskId } = await p.generateVideo({ prompt: 'x', startImage: 'a.png' })
      const st = await p.getTaskStatus(taskId)
      assert.strictEqual(st.status, 'failed')
      assert.match(st.error, /超时/)
      assert.strictEqual(slow.state.interrupted, true)
      assert.strictEqual(slow.state.queueDeleted, true)
    } finally {
      slow.server.close()
    }
  })

  it('cancelTask 调用 interrupt + queue delete', async () => {
    const p = providerFor(ctx.url)
    const { taskId } = await p.generateVideo({ prompt: 'x', startImage: 'a.png' })
    const r = await p.cancelTask(taskId)
    assert.strictEqual(r.success, true)
    assert.strictEqual(ctx.state.interrupted, true)
    assert.strictEqual(ctx.state.queueDeleted, true)
  })

  it('主机白名单：非白名单主机被拒绝', async () => {
    const p = new ComfyuiVideoProvider({ comfyui: { baseUrl: 'http://10.0.0.9:8188', allowedHosts: ['127.0.0.1'] } })
    assert.throws(() => p._assertEndpoint('http://10.0.0.9:8188/prompt'), /白名单/)
    assert.throws(() => p._assertEndpoint('http://127.0.0.1:8188/evil'), /白名单/)
  })

  it('未配置 baseUrl 时 generateVideo 抛错', async () => {
    const p = new ComfyuiVideoProvider({ comfyui: {} })
    await assert.rejects(() => p.generateVideo({ prompt: 'x' }), /未配置/)
  })

  it('完成时写入一条 comfyui 调用指标（含项目归属 / 免费成本）', async () => {
    const p = providerFor(ctx.url)
    const { taskId } = await p.generateVideo({
      prompt: 'x',
      startImage: 'a.png',
      projectId: 'proj1',
      userId: 'u1',
      length: 33,
      fps: 16,
    })
    await p.getTaskStatus(taskId) // generating
    const st = await p.getTaskStatus(taskId)
    assert.strictEqual(st.status, 'completed')

    const rows = readInvocationMetrics({ provider: 'comfyui', stage: 'video' })
    assert.strictEqual(rows.length, 1)
    const m = rows[0]
    assert.strictEqual(m.success, true)
    assert.strictEqual(m.projectId, 'proj1')
    assert.strictEqual(m.userId, 'u1')
    assert.strictEqual(m.billingModel, 'free')
    assert.strictEqual(m.costEstimate, 0)
    assert.strictEqual(m.unit, 'second')
    assert.strictEqual(m.unitCount, 2) // round(33/16)
    assert.ok(m.latencyMs >= 0)
  })

  it('失败时也写入指标（success=false）', async () => {
    const bad = await startFakeComfy({ doneAfter: 1, execError: true })
    try {
      const p = providerFor(bad.url)
      const { taskId } = await p.generateVideo({ prompt: 'x', startImage: 'a.png' })
      await p.getTaskStatus(taskId)
      const rows = readInvocationMetrics({ provider: 'comfyui' })
      assert.strictEqual(rows.length, 1)
      assert.strictEqual(rows[0].success, false)
    } finally {
      bad.server.close()
    }
  })

  it('同一任务只记一次指标（幂等）', async () => {
    const p = providerFor(ctx.url)
    const { taskId } = await p.generateVideo({ prompt: 'x', startImage: 'a.png' })
    await p.getTaskStatus(taskId)
    await p.getTaskStatus(taskId)
    await p.getTaskStatus(taskId) // 已完成后再查多次
    assert.strictEqual(readInvocationMetrics({ provider: 'comfyui' }).length, 1)
  })

  it('多参考图 + 多配音：按序写入提交体', async () => {
    const tpl = JSON.parse(JSON.stringify((await import('../src/providers/comfyuiWorkflow.js')).loadDefaultTemplate()))
    tpl['20'] = { class_type: 'LoadImage', inputs: { image: 'x.png' } }
    tpl['30'] = { class_type: 'LoadAudio', inputs: { audio: 'x.wav' } }
    const tplPath = path.join(config.storage.path, 'multi_template.json')
    fs.writeFileSync(tplPath, JSON.stringify(tpl))

    const p = new ComfyuiVideoProvider({
      comfyui: {
        baseUrl: ctx.url,
        allowedHosts: ['127.0.0.1'],
        pollIntervalMs: 5,
        maxPollMs: 10000,
        submitTimeoutMs: 2000,
        workflow: tplPath,
      },
    })
    await p.generateVideo({ prompt: 'multi', images: ['r1.png', 'r2.png'], audios: ['v1.wav'] })
    const wf = ctx.state.submitted.prompt
    assert.strictEqual(wf['7'].inputs.image, 'r1.png')
    assert.strictEqual(wf['20'].inputs.image, 'r2.png')
    assert.strictEqual(wf['30'].inputs.audio, 'v1.wav')
  })
})
