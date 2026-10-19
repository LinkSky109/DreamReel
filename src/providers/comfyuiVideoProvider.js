/**
 * ComfyUI 视频 Provider
 *
 * 对接自托管 ComfyUI（API 格式工作流，异步任务：提交 → 轮询 → 取产物）。
 * 协议对齐用户侧 comfyui_client.py；安全模型对齐 ai/docs/...（附录 C）与 openaiImageProvider：
 *   - 主机白名单 + 固定路径白名单
 *   - 下载字节上限（流式，超限即断）
 *   - 不跟随 ComfyUI 返回的任意 URL（防被当 SSRF 代理）
 *   - 并发上限（信号量）
 *   - 看门狗：超过 maxPollMs 自动取消，防 GPU 泄漏
 *
 * 接口适配 BaseVideoProvider：
 *   generateVideo(params) → { taskId(=prompt_id), status:'generating' }
 *   getTaskStatus(taskId) → { status, videoUrl?, error? }，完成时把 webm/mp4 落到 storage/videos/
 *   cancelTask(taskId)    → interrupt + queue delete
 */

import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { BaseVideoProvider } from './baseVideoProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { buildWorkflow, loadDefaultTemplate, loadTemplateFile } from './comfyuiWorkflow.js'
import { recordInvocation } from '../services/metricsRecorder.js'
import { estimateCost } from '../services/costEstimator.js'

const VIDEOS_DIR = path.join(config.storage.path, 'videos')
if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true })

const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.mkv']

function allowedPath(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/prompt' || p === '/queue' || p === '/interrupt' || p === '/view') return true
  if (p === '/history' || p.startsWith('/history/')) return true
  if (p === '/system_stats' || p === '/object_info' || p === '/upload/image') return true
  return false
}

class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max)
    this.active = 0
    this.queue = []
  }
  async acquire() {
    if (this.active < this.max) {
      this.active += 1
      return
    }
    await new Promise((resolve) => this.queue.push(resolve))
    this.active += 1
  }
  release() {
    this.active = Math.max(0, this.active - 1)
    const next = this.queue.shift()
    if (next) next()
  }
}

export class ComfyuiVideoProvider extends BaseVideoProvider {
  constructor(cfg = config.video) {
    super(cfg)
    const c = cfg?.comfyui || {}
    this.name = 'comfyui'
    this.baseUrl = (c.baseUrl || '').replace(/\/+$/, '')
    this.apiToken = c.apiToken || ''
    this.allowedHosts =
      Array.isArray(c.allowedHosts) && c.allowedHosts.length
        ? c.allowedHosts
        : this.baseUrl
          ? [new URL(this.baseUrl).hostname]
          : []
    this.pollIntervalMs = c.pollIntervalMs ?? 3000
    this.maxPollMs = c.maxPollMs ?? 1800000
    this.submitTimeoutMs = c.submitTimeoutMs ?? 30000
    this.downloadMaxBytes = c.downloadMaxBytes ?? 268435456
    this.maxConcurrent = c.maxConcurrent ?? 1
    this.model = c.model || 'wan22-ti2v'
    // 本 provider 自行记录终态指标（videoService 检测到该标记则不再重复记录）
    this.recordsOwnMetrics = true
    this.semaphore = new Semaphore(this.maxConcurrent)
    this.tasks = new Map()
    this.template = c.workflow ? loadTemplateFile(c.workflow) : loadDefaultTemplate()
    this.defaults = {
      width: c.defaultWidth ?? 832,
      height: c.defaultHeight ?? 480,
      length: c.defaultLength ?? 49,
      steps: c.defaultSteps ?? 20,
      cfg: c.defaultCfg ?? 5.0,
      sampler: c.defaultSampler ?? 'uni_pc',
      scheduler: c.defaultScheduler ?? 'simple',
      shift: c.defaultShift ?? 8.0,
      fps: c.defaultFps ?? 16,
    }
  }

  supportsReferenceImages() {
    return true
  }

  isConfigured() {
    return Boolean(this.baseUrl)
  }

  _assertEndpoint(urlStr) {
    let u
    try {
      u = new URL(urlStr)
    } catch {
      throw new Error(`非法 ComfyUI URL: ${urlStr}`)
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      throw new Error('ComfyUI 仅允许 http/https')
    }
    if (!this.allowedHosts.includes(u.hostname)) {
      throw new Error(
        `host '${u.hostname}' 不在白名单 [${this.allowedHosts.join(', ')}]（COMFYUI_ALLOWED_HOSTS）`
      )
    }
    if (!allowedPath(u.pathname)) {
      throw new Error(`ComfyUI 路径不在白名单: ${u.pathname}`)
    }
    return u
  }

  async _fetch(pathname, opts = {}, timeoutMs = this.submitTimeoutMs) {
    const url = `${this.baseUrl}${pathname}`
    this._assertEndpoint(url)
    const headers = { ...(opts.headers || {}) }
    if (this.apiToken) headers.Authorization = `Bearer ${this.apiToken}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...opts, headers, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  /** 健康检查 GET /system_stats */
  async healthCheck(timeoutMs = 5000) {
    if (!this.isConfigured()) return false
    try {
      const res = await this._fetch('/system_stats', {}, timeoutMs)
      return res.ok
    } catch {
      return false
    }
  }

  /** 上传本地文件（图片/音频）到 ComfyUI input，返回其文件名 */
  async _uploadFile(localPath) {
    const buf = fs.readFileSync(localPath)
    const form = new FormData()
    form.append('image', new Blob([buf]), path.basename(localPath))
    form.append('type', 'input')
    form.append('overwrite', 'true')
    const res = await this._fetch('/upload/image', { method: 'POST', body: form })
    if (!res.ok) throw new Error(`ComfyUI 上传失败 ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = await res.json().catch(() => ({}))
    return data.name || path.basename(localPath)
  }

  /**
   * 把 reference 解析成 ComfyUI 侧可用的输入名（图片或音频通用）：
   * - /storage/... 或本地文件路径 → 上传
   * - 纯文件名（无路径分隔）→ 视为已在 ComfyUI input 目录，直接透传
   * - 远程 URL → 不支持（防 SSRF），抛错
   */
  async _resolveAsset(reference) {
    if (!reference) return null
    const ref = String(reference)
    if (ref.startsWith('http://') || ref.startsWith('https://')) {
      throw new Error('ComfyUI 输入暂不支持远程 URL（防 SSRF），请传本地/已上传文件')
    }
    let localPath = null
    if (ref.startsWith('/storage/')) {
      localPath = path.join(config.storage.path, ref.replace(/^\/storage\//, ''))
    } else if (fs.existsSync(ref)) {
      localPath = ref
    }
    if (localPath) {
      if (!fs.existsSync(localPath)) throw new Error(`输入文件不存在: ${localPath}`)
      return this._uploadFile(localPath)
    }
    if (!ref.includes('/') && !ref.includes('\\')) return ref
    throw new Error(`无法解析 ComfyUI 输入: ${ref}`)
  }

  /** 批量解析/上传 */
  async _resolveAssets(list) {
    const out = []
    for (const item of list || []) {
      const name = await this._resolveAsset(item)
      if (name) out.push(name)
    }
    return out
  }

  async generateVideo(params = {}) {
    if (!this.isConfigured()) {
      throw new Error('ComfyUI 未配置。请设置 COMFYUI_BASE_URL。')
    }

    const localId = `comfy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const clientId = randomUUID()

    await this.semaphore.acquire()
    try {
      const images = await this._resolveAssets(
        (params.images?.length && params.images) ||
          (params.referenceImages?.length && params.referenceImages) ||
          (params.startImage ? [params.startImage] : [])
      )
      const audios = await this._resolveAssets(params.audios)
      // 画面比例 → 像素尺寸（32 对齐）
      const dims = this._resolveDims(params)
      const workflow = buildWorkflow(this.template, {
        prompts: params.prompts?.length ? params.prompts : params.prompt ? [params.prompt] : [],
        negativePrompts: params.negativePrompts?.length
          ? params.negativePrompts
          : params.negativePrompt
            ? [params.negativePrompt]
            : [],
        images,
        audios,
        width: dims.width,
        height: dims.height,
        length: params.length ?? this.defaults.length,
        steps: params.steps ?? this.defaults.steps,
        cfg: params.cfg ?? this.defaults.cfg,
        sampler: params.sampler ?? this.defaults.sampler,
        scheduler: params.scheduler ?? this.defaults.scheduler,
        shift: params.shift ?? this.defaults.shift,
        fps: params.fps ?? this.defaults.fps,
        seed: params.seed ?? Math.floor(Math.random() * 1e15),
        filenamePrefix: `dreamreel_${localId}`,
      })

      const task = {
        localId,
        clientId,
        status: 'generating',
        createdAt: Date.now(),
        params,
        videoUrl: null,
        error: null,
      }
      let promptId
      try {
        promptId = await this._submit(workflow, clientId)
      } catch (error) {
        this._recordOutcome(task, false, { error: error.message, errorClass: 'server' })
        throw error
      }
      task.promptId = promptId
      this.tasks.set(promptId, task)
      logger.info(`ComfyUI 任务已提交: ${promptId} (${dims.width}x${dims.height}, ${workflow[Object.keys(workflow)[0]].class_type})`)
      return { taskId: promptId, status: 'generating' }
    } finally {
      this.semaphore.release()
    }
  }

  _resolveDims(params) {
    const { width, height } = params
    if (width && height) return { width: align32(width), height: align32(height) }
    const resMap = { '480p': [832, 480], '720p': [1280, 720], '1080p': [1920, 1080] }
    let [w, h] = resMap[params.resolution] || [this.defaults.width, this.defaults.height]
    if (params.aspectRatio === '9:16') [w, h] = [h, w]
    return { width: align32(w), height: align32(h) }
  }

  async _submit(workflow, clientId) {
    const res = await this._fetch('/prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    })
    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      /* ignore */
    }
    if (!res.ok) {
      const nodeErrs = data?.node_errors ? JSON.stringify(data.node_errors).slice(0, 400) : ''
      throw new Error(`ComfyUI /prompt ${res.status}: ${(data?.error?.message || text).slice(0, 200)} ${nodeErrs}`)
    }
    if (!data?.prompt_id) throw new Error('ComfyUI /prompt 未返回 prompt_id')
    return data.prompt_id
  }

  async getTaskStatus(promptId) {
    const task = this.tasks.get(promptId)
    if (!task) return { status: 'not_found', error: 'Task not found' }
    if (task.status === 'completed') return { status: 'completed', videoUrl: task.videoUrl }
    if (task.status === 'failed') return { status: 'failed', error: task.error }
    if (task.status === 'cancelled') return { status: 'cancelled', error: task.error || 'cancelled' }

    // 看门狗
    if (Date.now() - task.createdAt >= this.maxPollMs) {
      await this.cancelTask(promptId, { record: false }).catch(() => {})
      task.status = 'failed'
      task.error = `ComfyUI 超时（>${this.maxPollMs}ms），已自动取消`
      this._recordOutcome(task, false, { error: task.error, errorClass: 'timeout' })
      return { status: 'failed', error: task.error }
    }

    let res
    try {
      res = await this._fetch(`/history/${promptId}`, {}, this.submitTimeoutMs)
    } catch (error) {
      logger.warn(`ComfyUI 查询 history 失败（继续轮询）: ${error.message}`)
      return { status: 'generating' }
    }
    if (!res.ok) return { status: 'generating' }

    const data = await res.json().catch(() => ({}))
    const entry = data[promptId]
    if (!entry) return { status: 'generating' } // 未出现 = 未结束

    const statusStr = entry?.status?.status_str
    if (statusStr === 'error') {
      task.status = 'failed'
      task.error = extractError(entry)
      this._recordOutcome(task, false, { error: task.error, errorClass: 'server' })
      return { status: 'failed', error: task.error }
    }
    if (statusStr !== 'success' && entry?.status?.completed !== true) {
      return { status: 'generating' }
    }

    const files = collectOutputFiles(entry.outputs)
    const video = pickVideo(files)
    if (!video) {
      task.status = 'failed'
      task.error = `ComfyUI 未产出视频文件（outputs keys: ${Object.keys(entry.outputs || {}).join(',')}）`
      this._recordOutcome(task, false, { error: task.error, errorClass: 'empty' })
      return { status: 'failed', error: task.error }
    }
    if (!task.videoUrl) {
      try {
        const local = await this._download(video, task.localId)
        task.videoUrl = `/storage/videos/${path.basename(local)}`
        task.status = 'completed'
        logger.info(`ComfyUI 完成: ${promptId} → ${task.videoUrl}`)
        this._recordOutcome(task, true)
      } catch (error) {
        task.status = 'failed'
        task.error = `ComfyUI 产物下载失败: ${error.message}`
        this._recordOutcome(task, false, { error: task.error, errorClass: 'network' })
        return { status: 'failed', error: task.error }
      }
    }
    return { status: 'completed', videoUrl: task.videoUrl }
  }

  /** 终态记录一次调用指标（best-effort：失败只告警，绝不影响生成） */
  _recordOutcome(task, success, { error = null, errorClass = null } = {}) {
    if (!task || task.recorded) return
    task.recorded = true
    try {
      const latencyMs = Date.now() - (task.createdAt || Date.now())
      const length = task.params?.length ?? this.defaults.length
      const fps = task.params?.fps ?? this.defaults.fps
      const durationSeconds = fps ? Math.max(1, Math.round(length / fps)) : null
      const cost = estimateCost('video', { provider: 'comfyui', model: this.model, ctx: { durationSeconds } })
      recordInvocation({
        stage: 'video',
        taskType: 'shot.video',
        provider: 'comfyui',
        model: this.model,
        projectId: task.params?.projectId ?? null,
        userId: task.params?.userId ?? null,
        success,
        errorClass,
        errorMessage: error,
        latencyMs,
        unit: 'second',
        unitCount: durationSeconds,
        currency: cost.currency,
        billingModel: cost.billingModel,
        planName: cost.planName,
        costEstimate: cost.costEstimate,
        pricingMissing: cost.pricingMissing,
        priceTableVersion: cost.priceTableVersion,
      })
    } catch (e) {
      logger.warn(`ComfyUI 指标记录失败（忽略，不影响生成）: ${e.message}`)
    }
  }

  async _download(ref, localId) {
    const qs = new URLSearchParams({
      filename: ref.filename,
      subfolder: ref.subfolder || '',
      type: ref.type || 'output',
    })
    const url = `${this.baseUrl}/view?${qs.toString()}`
    this._assertEndpoint(url.split('?')[0])

    const headers = this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}
    const res = await fetch(url, { headers })
    if (!res.ok) throw new Error(`ComfyUI 下载失败 ${res.status}`)

    const ext = VIDEO_EXTS.includes(path.extname(ref.filename).toLowerCase())
      ? path.extname(ref.filename)
      : '.webm'
    const dest = path.join(VIDEOS_DIR, `${localId}${ext}`)

    const reader = res.body.getReader()
    const chunks = []
    let received = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > this.downloadMaxBytes) {
        await reader.cancel().catch(() => {})
        throw new Error(`ComfyUI 产物超过下载上限 ${this.downloadMaxBytes} 字节`)
      }
      chunks.push(Buffer.from(value))
    }
    fs.writeFileSync(dest, Buffer.concat(chunks))
    return dest
  }

  async cancelTask(promptId, { record = true } = {}) {
    // 中断运行中 + 删除队列中（pending）
    let ok = false
    try {
      const res = await this._fetch('/interrupt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_id: promptId }),
      })
      ok = res.ok || ok
    } catch (error) {
      logger.warn(`ComfyUI interrupt 失败: ${error.message}`)
    }
    try {
      const res = await this._fetch('/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delete: [promptId] }),
      })
      ok = res.ok || ok
    } catch (error) {
      logger.warn(`ComfyUI queue delete 失败: ${error.message}`)
    }
    const task = this.tasks.get(promptId)
    if (task && task.status === 'generating') {
      task.status = 'cancelled'
      if (record) this._recordOutcome(task, false, { error: 'cancelled by user', errorClass: 'cancelled' })
    }
    return { success: ok }
  }
}

function align32(n) {
  return Math.max(32, Math.round(Number(n) / 32) * 32)
}

/** 从 history.outputs 收集所有文件引用（不写死 key：VHS 用 gifs，原生用 images/videos 等） */
export function collectOutputFiles(outputs = {}) {
  const files = []
  for (const nodeOutput of Object.values(outputs || {})) {
    if (!nodeOutput || typeof nodeOutput !== 'object') continue
    for (const arr of Object.values(nodeOutput)) {
      if (!Array.isArray(arr)) continue
      for (const item of arr) {
        if (item && typeof item === 'object' && item.filename) {
          files.push({
            filename: item.filename,
            subfolder: item.subfolder || '',
            type: item.type || 'output',
          })
        }
      }
    }
  }
  return files
}

function pickVideo(files) {
  return files.find((f) => VIDEO_EXTS.includes(path.extname(f.filename).toLowerCase())) || null
}

function extractError(entry) {
  const msgs = entry?.status?.messages || []
  for (const m of msgs) {
    if (Array.isArray(m) && m[0] === 'execution_error' && m[1]) {
      return `${m[1].exception_type || 'error'}: ${m[1].exception_message || ''}`.slice(0, 300)
    }
  }
  return 'ComfyUI 执行失败'
}

export default ComfyuiVideoProvider
