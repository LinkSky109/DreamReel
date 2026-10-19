import fs from 'fs'
import path from 'path'

/**
 * 极简 WebDAV 客户端（只覆盖同步所需的 MKCOL / PUT / HEAD）。
 * - 兼容群晖 / Nextcloud / 坚果云 / 阿里云盘 WebDAV 等标准实现
 * - Basic（用户名+密码）或 Bearer token 鉴权
 * - 单元测试可直接注入 baseUrl / 鉴权，无需读取环境变量
 * - 不打印任何凭据
 */

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

export class WebdavError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message)
    this.name = 'WebdavError'
    this.status = status
    this.retryable = retryable
  }
}

function encodeRemotePath(remotePath) {
  return String(remotePath || '')
    .split('/')
    .filter((seg) => seg.length > 0)
    .map((seg) => encodeURIComponent(seg))
    .join('/')
}

function joinRemote(...parts) {
  return parts
    .filter((p) => p !== undefined && p !== null && p !== '')
    .map((p) => String(p).replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/')
}

export class WebdavClient {
  /**
   * @param {object} opts
   * @param {string} opts.url        服务地址（含已有路径，如 https://dav.example.com/remote.php/dav/files/user）
   * @param {string} [opts.username]
   * @param {string} [opts.password]
   * @param {string} [opts.token]    Bearer token（优先于 Basic）
   * @param {number} [opts.timeoutMs]
   * @param {string} [opts.root]     远端根目录（如 DreamReel）
   */
  constructor({ url, username = '', password = '', token = '', timeoutMs = 60000, root = '' } = {}) {
    this.baseUrl = String(url || '').replace(/\/+$/, '')
    this.username = username
    this.password = password
    this.token = token
    this.timeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 60000
    this.root = String(root || '').replace(/^\/+|\/+$/g, '')
    this._collections = new Map()
  }

  get configured() {
    return Boolean(this.baseUrl)
  }

  _authHeader() {
    if (this.token) return `Bearer ${this.token}`
    if (this.username || this.password) {
      return `Basic ${Buffer.from(`${this.username}:${this.password}`).toString('base64')}`
    }
    return ''
  }

  _resolve(remotePath) {
    const encoded = encodeRemotePath(joinRemote(this.root, remotePath))
    return encoded ? `${this.baseUrl}/${encoded}` : this.baseUrl
  }

  async _request(method, remotePath, { body, headers = {} } = {}) {
    const auth = this._authHeader()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await fetch(this._resolve(remotePath), {
        method,
        headers: {
          ...(auth ? { Authorization: auth } : {}),
          'User-Agent': 'DreamReel-WebDAV-Sync/1.0',
          ...headers,
        },
        body,
        duplex: body ? 'half' : undefined,
        signal: controller.signal,
      })
      return res
    } catch (error) {
      const aborted = error.name === 'AbortError'
      throw new WebdavError(aborted ? `WebDAV ${method} 超时（${this.timeoutMs}ms）` : `WebDAV ${method} 网络失败：${error.message}`, {
        retryable: true,
      })
    } finally {
      clearTimeout(timer)
    }
  }

  _ensureOk(res, method, remotePath, { accept = [] } = {}) {
    if (res.ok || accept.includes(res.status)) return res
    const authHint = res.status === 401 || res.status === 403 ? '（鉴权失败：请检查 WEBDAV_USERNAME/WEBDAV_PASSWORD 或 WEBDAV_TOKEN）' : ''
    throw new WebdavError(`WebDAV ${method} ${remotePath} → HTTP ${res.status}${authHint}`, {
      status: res.status,
      retryable: RETRYABLE_STATUS.has(res.status),
    })
  }

  /** 递归创建远端目录（幂等：405/301 视为已存在） */
  async ensureCollection(remoteDir) {
    const clean = joinRemote(remoteDir)
    if (!clean) return
    if (this._collections.has(clean)) return this._collections.get(clean)
    const task = (async () => {
      const segments = clean.split('/')
      let acc = ''
      for (const seg of segments) {
        acc = acc ? `${acc}/${seg}` : seg
        await this._ensureCollectionSegment(acc)
      }
    })()
    this._collections.set(clean, task)
    try {
      await task
    } catch (error) {
      this._collections.delete(clean)
      throw error
    }
  }

  async _ensureCollectionSegment(remotePath) {
    const res = await this._request('MKCOL', remotePath)
    this._ensureOk(res, 'MKCOL', remotePath, { accept: [301, 405] })
  }

  /** HEAD：存在返回 true，404 返回 false */
  async exists(remotePath) {
    const res = await this._request('HEAD', remotePath)
    if (res.status === 404) return false
    return !this._ensureOk(res, 'HEAD', remotePath).status.toString().startsWith('4')
  }

  /** PUT 上传文件（流式，避免大视频占内存） */
  async putFile(remotePath, absPath, { contentType = 'application/octet-stream' } = {}) {
    const stat = fs.statSync(absPath)
    const stream = fs.createReadStream(absPath)
    const res = await this._request('PUT', remotePath, {
      body: stream,
      headers: { 'Content-Type': contentType, 'Content-Length': String(stat.size) },
    })
    this._ensureOk(res, 'PUT', remotePath, { accept: [201, 204] })
    return { status: res.status, size: stat.size }
  }
}

export function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  const map = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.json': 'application/json; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
  }
  return map[ext] || 'application/octet-stream'
}
