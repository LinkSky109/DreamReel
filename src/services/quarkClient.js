import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * 夸克网盘客户端（Node 版，私有接口）
 *
 * 协议来自 ai-manga-factory 的 quarkpan 参考实现（cookie 登录 + 预上传 + OSS 分片 + 完成 + 结束）：
 *   1. POST /file/upload/pre      → task_id / auth_info / upload_id / obj_key / bucket / callback
 *   2. POST /file/update/hash     → 上报 md5/sha1（秒传/去重，失败可忽略）
 *   3. POST /file/upload/auth     → 取 auth_key（按 auth_meta 签名）
 *   4. PUT  https://{bucket}.{host}/{obj_key}?partNumber&uploadId → 分片上传，取 ETag
 *      · host 来自 pre.upload_url（实测 http://pds.quark.cn，需前置 bucket 子域 → ul-sz.pds.quark.cn）
 *   5. POST https://{bucket}.{host}/{obj_key}?uploadId            → CompleteMultipartUpload
 *   6. POST /file/upload/finish   → 通知夸克完成
 *
 * 设计：
 * - apiBase / ossUrl / fetchImpl / partSize 全部可注入 → 可用本地 mock 服务器做真实 HTTP 验证
 * - 并行分片必须带 x-oss-hash-ctx（前序字节的 SHA1 中间状态），否则 OSS 报 NoHashContext。
 *   本实现用 src/utils/sha1State.js 正确计算（不用参考实现里的硬编码样本映射）
 * - 不打印 cookie / auth_key
 */

import { sha1Init, sha1Update, hashContextBase64 } from '../utils/sha1State.js'

const DEFAULT_API_BASE = 'https://drive-pc.quark.cn/1/clouddrive'
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/94.0.4606.71 Safari/537.36 Core/1.94.225.400 QQBrowser/12.2.5544.400'
const OSS_USER_AGENT = 'aliyun-sdk-js/1.0.0 Chrome 139.0.0.0 on OS X 10.15.7 64-bit'

export class QuarkError extends Error {
  constructor(message, { status = 0, retryable = false, code = null } = {}) {
    super(message)
    this.name = 'QuarkError'
    this.status = status
    this.retryable = retryable
    this.code = code
  }
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

function ossDate() {
  return new Date().toUTCString()
}

function md5B64(input) {
  return crypto.createHash('md5').update(input).digest('base64')
}

function hashFile(absPath) {
  return new Promise((resolve, reject) => {
    const md5 = crypto.createHash('md5')
    const sha1 = crypto.createHash('sha1')
    const stream = fs.createReadStream(absPath)
    stream.on('data', (chunk) => {
      md5.update(chunk)
      sha1.update(chunk)
    })
    stream.on('error', reject)
    stream.on('end', () => resolve({ md5: md5.digest('hex'), sha1: sha1.digest('hex') }))
  })
}

function sanitizeRemoteName(name) {
  return String(name).replace(/[\\/:*?"<>|]+/g, '-').trim().replace(/^\.+/, '') || 'unnamed'
}

export class QuarkClient {
  constructor({
    cookie,
    apiBase = DEFAULT_API_BASE,
    // 上传域名模板：{bucket}.{host}（host 优先取 pre 返回的 upload_url，退回此处）
    ossHost = 'pds.quark.cn',
    ossUrl,
    fetchImpl,
    timeoutMs = 60000,
    partSize = 4 * 1024 * 1024,
    userAgent = DEFAULT_USER_AGENT,
  } = {}) {
    this.cookie = cookie || ''
    this.apiBase = String(apiBase).replace(/\/+$/, '')
    this.ossHost = String(ossHost || 'pds.quark.cn').replace(/^https?:\/\//, '').replace(/\/+$/, '')
    this.fetchImpl = fetchImpl || ((...args) => fetch(...args))
    this.timeoutMs = timeoutMs
    this.partSize = partSize
    this.userAgent = userAgent
    this._folderCache = new Map()
    // 允许测试整体替换 URL 构造
    this._ossUrl =
      ossUrl ||
      (({ bucket, host, objKey, query }) => `https://${bucket}.${host || this.ossHost}/${objKey}${query || ''}`)
  }

  /** 从 pre 返回的 upload_url 解析上传域名（实测：upload_url 只是基础域，需前置 bucket 子域） */
  _uploadHost(pre) {
    const raw = pre && pre.upload_url
    if (!raw) return this.ossHost
    try {
      return new URL(raw).host
    } catch {
      return String(raw).replace(/^https?:\/\//, '').replace(/\/.*$/, '') || this.ossHost
    }
  }

  get configured() {
    return Boolean(this.cookie)
  }

  _baseHeaders(extra = {}) {
    return {
      'user-agent': this.userAgent,
      origin: 'https://pan.quark.cn',
      referer: 'https://pan.quark.cn/',
      'accept-language': 'zh-CN,zh;q=0.9',
      accept: 'application/json, text/plain, */*',
      'content-type': 'application/json',
      ...(this.cookie ? { cookie: this.cookie } : {}),
      ...extra,
    }
  }

  async _fetch(url, { method = 'GET', headers, body, duplex } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await this.fetchImpl(url, { method, headers, body, duplex, signal: controller.signal })
    } catch (error) {
      const aborted = error.name === 'AbortError'
      throw new QuarkError(aborted ? `夸克请求超时（${this.timeoutMs}ms）` : `夸克网络失败：${error.message}`, {
        retryable: true,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  /** 调用夸克业务 API：自动补 pr/fr/uc_param_str/__t/__dt 参数并解析统一信封 */
  async _api(method, apiPath, { params = {}, json } = {}) {
    const search = new URLSearchParams({
      pr: 'ucpro',
      fr: 'pc',
      uc_param_str: '',
      __t: String(Date.now()),
      __dt: '1000',
      ...params,
    })
    const url = `${this.apiBase}/${String(apiPath).replace(/^\/+/, '')}?${search.toString()}`
    const res = await this._fetch(url, {
      method,
      headers: this._baseHeaders(),
      body: json !== undefined ? JSON.stringify(json) : undefined,
    })

    if (res.status === 401 || res.status === 403) {
      throw new QuarkError(`夸克鉴权失败（HTTP ${res.status}）：cookie 可能已过期`, { status: res.status })
    }
    if (res.status >= 400) {
      throw new QuarkError(`夸克接口 HTTP ${res.status}`, {
        status: res.status,
        retryable: RETRYABLE_STATUS.has(res.status),
      })
    }

    let body
    try {
      body = await res.json()
    } catch {
      throw new QuarkError('夸克接口返回非 JSON', { retryable: false })
    }

    const code = body && body.code
    if (body && (body.status === 'error' || (code !== undefined && code !== 0 && code !== 200))) {
      const message = body.message || body.error || '未知错误'
      const authish = /login|auth|登录|cookie/i.test(String(message))
      throw new QuarkError(`夸克接口错误：${message}`, { code, retryable: !authish && false })
    }
    return body && body.data !== undefined ? body.data : body
  }

  /** 认证探针：列出根目录，成功即 cookie 可用 */
  async checkAuth() {
    const data = await this.listFiles('0', { page: 1, size: 1 })
    return { ok: true, items: data.list ? data.list.length : 0 }
  }

  async listFiles(pdirFid = '0', { page = 1, size = 200, sort = 'file_type:asc,updated_at:desc' } = {}) {
    const data = await this._api('GET', 'file/sort', {
      params: { pdir_fid: pdirFid, _page: page, _size: size, _sort: sort },
    })
    const items = (data && data.list) || []
    return { list: items, total: (data && data._total) || items.length }
  }

  async createFolder(name, parentFid = '0') {
    const data = await this._api('POST', 'file', {
      json: { pdir_fid: parentFid, file_name: sanitizeRemoteName(name), dir_init_lock: false, dir_path: '' },
    })
    const fid = (data && (data.fid || data.file_id)) || (data && data.list && data.list[0] && data.list[0].fid)
    if (fid) return String(fid)
    const created = await this.findChild(parentFid, name, { folder: true })
    if (!created) throw new QuarkError(`创建远端目录失败：${name}`)
    return String(created.fid)
  }

  async deleteFiles(fids) {
    const list = Array.isArray(fids) ? fids : [fids]
    await this._api('POST', 'file/delete', { json: { action_type: 2, filelist: list, exclude_fids: [] } })
    return list.length
  }

  async findChild(pdirFid, name, { folder = false } = {}) {
    const clean = sanitizeRemoteName(name)
    let page = 1
    for (;;) {
      const { list } = await this.listFiles(pdirFid, { page, size: 200 })
      if (!list.length) return null
      for (const item of list) {
        const itemName = item.file_name || item.name || ''
        const isFolder = String(item.file_type) === '0' || item.dir === true
        if (itemName === clean && isFolder === folder) return item
      }
      if (list.length < 200) return null
      page += 1
    }
  }

  /** 按 parts（相对 root 的目录数组）逐级查找/创建目录，返回末端 fid */
  async ensureFolder(parts, rootFid = '0') {
    const key = parts.join('/')
    if (this._folderCache.has(key)) return this._folderCache.get(key)
    let parent = rootFid
    const acc = []
    for (const raw of parts) {
      acc.push(raw)
      const accKey = acc.join('/')
      if (this._folderCache.has(accKey)) {
        parent = this._folderCache.get(accKey)
        continue
      }
      const existing = await this.findChild(parent, raw, { folder: true })
      parent = existing ? String(existing.fid) : await this.createFolder(raw, parent)
      this._folderCache.set(accKey, parent)
    }
    this._folderCache.set(key, parent)
    return parent
  }

  async _uploadAuth({ taskId, authInfo, authMeta }) {
    const data = await this._api('POST', 'file/upload/auth', {
      json: { task_id: taskId, auth_info: authInfo, auth_meta: authMeta },
    })
    return (data && data.auth_key) || ''
  }

  async _putPart({ buf, taskId, authInfo, uploadId, objKey, bucket, host, partNumber, mimeType, hashCtx }) {
    const date = ossDate()
    const authMeta = [
      'PUT',
      '',
      mimeType,
      date,
      `x-oss-date:${date}`,
      ...(hashCtx ? [`x-oss-hash-ctx:${hashCtx}`] : []),
      `x-oss-user-agent:${OSS_USER_AGENT}`,
      `/${bucket}/${objKey}?partNumber=${partNumber}&uploadId=${uploadId}`,
    ].join('\n')
    const authKey = await this._uploadAuth({ taskId, authInfo, authMeta })
    const query = `?partNumber=${partNumber}&uploadId=${uploadId}`
    const url = this._ossUrl({ bucket, host, objKey, query })
    const res = await this._fetch(url, {
      method: 'PUT',
      headers: {
        'content-type': mimeType,
        'content-length': String(buf.length),
        'x-oss-date': date,
        ...(hashCtx ? { 'x-oss-hash-ctx': hashCtx } : {}),
        'x-oss-user-agent': OSS_USER_AGENT,
        ...(authKey ? { authorization: authKey } : {}),
      },
      body: buf,
    })
    if (res.status !== 200) {
      const body = await res.text().catch(() => '')
      const code = (body.match(/<Code>([^<]+)<\/Code>/) || [])[1]
      throw new QuarkError(`分片 ${partNumber} 上传失败 HTTP ${res.status}${code ? `（${code}）` : ''}`, {
        status: res.status,
        retryable: RETRYABLE_STATUS.has(res.status),
      })
    }
    const etag = (res.headers.get('etag') || '').replace(/"/g, '')
    if (!etag) throw new QuarkError(`分片 ${partNumber} 未返回 ETag`)
    return etag
  }

  async _completeMultipart({ taskId, authInfo, uploadId, objKey, bucket, host, parts, callback }) {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<CompleteMultipartUpload>',
      ...parts.map((p) => `<Part>\n<PartNumber>${p.partNumber}</PartNumber>\n<ETag>"${p.etag}"</ETag>\n</Part>`),
      '</CompleteMultipartUpload>',
    ].join('\n')
    const xmlMd5 = md5B64(Buffer.from(xml, 'utf8'))
    const callbackB64 = callback ? Buffer.from(JSON.stringify(callback), 'utf8').toString('base64') : ''
    const date = ossDate()
    const authMeta = [
      'POST',
      xmlMd5,
      'application/xml',
      date,
      ...(callbackB64 ? [`x-oss-callback:${callbackB64}`] : []),
      `x-oss-date:${date}`,
      `x-oss-user-agent:${OSS_USER_AGENT}`,
      `/${bucket}/${objKey}?uploadId=${uploadId}`,
    ].join('\n')
    const authKey = await this._uploadAuth({ taskId, authInfo, authMeta })
    const url = this._ossUrl({ bucket, host, objKey, query: `?uploadId=${uploadId}` })
    const res = await this._fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/xml',
        'content-md5': xmlMd5,
        'x-oss-date': date,
        'x-oss-user-agent': OSS_USER_AGENT,
        ...(callbackB64 ? { 'x-oss-callback': callbackB64 } : {}),
        ...(authKey ? { authorization: authKey } : {}),
      },
      body: xml,
    })
    // 200 = 合并+callback 成功；203 = 合并成功但 callback 失败（文件已上传）
    if (res.status !== 200 && res.status !== 203) {
      throw new QuarkError(`合并分片失败 HTTP ${res.status}`, {
        status: res.status,
        retryable: RETRYABLE_STATUS.has(res.status),
      })
    }
    return { status: res.status }
  }

  /** 上传单个文件到 parentFid；自动按 partSize 决定单/多分片 */
  async uploadFile(absPath, parentFid = '0', { mimeType = 'application/octet-stream', category = '' } = {}) {
    const stat = fs.statSync(absPath)
    const fileName = path.basename(absPath)
    const now = Date.now()

    const pre = await this._api('POST', 'file/upload/pre', {
      json: {
        ccp_hash_update: true,
        parallel_upload: true,
        pdir_fid: parentFid,
        dir_name: '',
        size: stat.size,
        file_name: fileName,
        format_type: mimeType,
        l_updated_at: now,
        l_created_at: now,
        category,
      },
    })
    const taskId = pre && pre.task_id
    if (!taskId) throw new QuarkError('预上传失败：未返回 task_id')
    const authInfo = pre.auth_info || ''
    const uploadId = pre.upload_id || ''
    const objKey = pre.obj_key || ''
    const bucket = pre.bucket || 'ul-zb'
    const callback = pre.callback || null
    const host = this._uploadHost(pre)

    const { md5, sha1 } = await hashFile(absPath)
    try {
      await this._api('POST', 'file/update/hash', { json: { task_id: taskId, md5, sha1 } })
    } catch {
      /* 秒传/去重失败不影响真实上传 */
    }

    // 并行分片：第 2 片起必须带「前序字节的 SHA1 中间状态」，否则 OSS 返回 NoHashContext
    const parts = []
    const totalParts = Math.max(1, Math.ceil(stat.size / this.partSize))
    let hashState = sha1Init()
    const fd = fs.openSync(absPath, 'r')
    try {
      for (let i = 0; i < totalParts; i++) {
        const offset = i * this.partSize
        const length = Math.min(this.partSize, stat.size - offset)
        const buf = Buffer.allocUnsafe(length)
        fs.readSync(fd, buf, 0, length, offset)
        const partNumber = i + 1
        const etag = await this._putPart({
          buf,
          taskId,
          authInfo,
          uploadId,
          objKey,
          bucket,
          host,
          partNumber,
          mimeType,
          hashCtx: partNumber > 1 ? hashContextBase64(hashState) : null,
        })
        parts.push({ partNumber, etag })
        hashState = sha1Update(hashState, buf)
      }
    } finally {
      fs.closeSync(fd)
    }

    await this._completeMultipart({ taskId, authInfo, uploadId, objKey, bucket, host, parts, callback })
    const finish = await this._api('POST', 'file/upload/finish', { json: { task_id: taskId, obj_key: objKey } })
    return { taskId, fileName, size: stat.size, md5, parts: parts.length, finish: finish || null }
  }
}

export { sanitizeRemoteName }
