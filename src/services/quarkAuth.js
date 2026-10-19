import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

/**
 * 夸克扫码登录（私有接口）
 *
 * 流程（对齐 quarkpan 参考实现）：
 *   1. GET {authBase}/cas/ajax/getTokenForQrcodeLogin?client_id=532&v=1.2&request_id=<uuid> → members.token
 *   2. 二维码内容 = https://su.quark.cn/4_eMHBJ?token=<token>&client_id=532&ssb=weblogin&...
 *   3. 轮询 GET {authBase}/cas/ajax/getServiceTicketByQrcodeToken?...&token=<token> → members.service_ticket
 *   4. GET {panBase}/account/info?st=<ticket>&lw=scan → Set-Cookie（夸克登录态）
 *
 * 设计：authBase/panBase/fetchImpl 可注入 → 可用本地 mock 服务器做真实流程验证。
 * 只读取 Set-Cookie 中的夸克域 cookie；不打印 cookie / ticket。
 */

const DEFAULT_AUTH_BASE = 'https://uop.quark.cn'
const DEFAULT_PAN_BASE = 'https://pan.quark.cn'
const CLIENT_ID = '532'

const QR_BASE_URL = 'https://su.quark.cn/4_eMHBJ'
const QR_EXTRA = {
  uc_param_str: '',
  uc_biz_str: 'S:custom|OPT:SAREA@0|OPT:IMMERSIVE@1|OPT:BACK_BTN_STYLE@0',
}

export class QuarkAuthError extends Error {
  constructor(message, { status = 0 } = {}) {
    super(message)
    this.name = 'QuarkAuthError'
    this.status = status
  }
}

function buildQrUrl(token) {
  const params = new URLSearchParams({ token, client_id: CLIENT_ID, ssb: 'weblogin', ...QR_EXTRA })
  return `${QR_BASE_URL}?${params.toString()}`
}

/** 解析 Set-Cookie 头，返回 [{name, value}] */
function parseSetCookies(headers) {
  const raw = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  const list = raw.length ? raw : headers.get('set-cookie') ? [headers.get('set-cookie')] : []
  const out = []
  for (const line of list) {
    const first = String(line).split(';')[0]
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    out.push({ name: first.slice(0, eq).trim(), value: first.slice(eq + 1).trim() })
  }
  return out
}

function cookieHeaderFrom(pairs) {
  return pairs.map((c) => `${c.name}=${c.value}`).join('; ')
}

export class QuarkAuth {
  constructor({ authBase = DEFAULT_AUTH_BASE, panBase = DEFAULT_PAN_BASE, fetchImpl, timeoutMs = 30000, userAgent } = {}) {
    this.authBase = String(authBase || DEFAULT_AUTH_BASE).replace(/\/+$/, '')
    this.panBase = String(panBase || DEFAULT_PAN_BASE).replace(/\/+$/, '')
    this.fetchImpl = fetchImpl || ((...args) => fetch(...args))
    this.timeoutMs = timeoutMs
    this.userAgent =
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
  }

  async _get(url) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(url, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          'user-agent': this.userAgent,
          accept: 'application/json, text/plain, */*',
          'accept-language': 'zh-CN,zh;q=0.9',
          referer: `${this.panBase}/`,
          origin: this.panBase,
        },
        signal: controller.signal,
      })
      return res
    } catch (error) {
      throw new QuarkAuthError(error.name === 'AbortError' ? `夸克登录请求超时（${this.timeoutMs}ms）` : `夸克登录网络失败：${error.message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  /** ① 申请二维码 token 与内容 URL */
  async createQrSession() {
    const requestId = crypto.randomUUID()
    const url = `${this.authBase}/cas/ajax/getTokenForQrcodeLogin?${new URLSearchParams({ client_id: CLIENT_ID, v: '1.2', request_id: requestId })}`
    const res = await this._get(url)
    if (!res.ok) throw new QuarkAuthError(`获取二维码失败：HTTP ${res.status}`, { status: res.status })
    const body = await res.json()
    const token = body?.data?.members?.token
    if (body?.status !== 2000000 || !token) {
      throw new QuarkAuthError(`获取二维码失败：${body?.message || '未返回 token'}`)
    }
    return { token, requestId, qrUrl: buildQrUrl(token) }
  }

  /** ③ 轮询扫码状态 */
  async pollQrSession({ token, requestId }) {
    const url = `${this.authBase}/cas/ajax/getServiceTicketByQrcodeToken?${new URLSearchParams({
      client_id: CLIENT_ID,
      v: '1.2',
      token,
      request_id: requestId || crypto.randomUUID(),
    })}`
    const res = await this._get(url)
    if (!res.ok) throw new QuarkAuthError(`轮询登录状态失败：HTTP ${res.status}`, { status: res.status })
    const body = await res.json()
    const status = body?.status
    const message = String(body?.message || '')
    if (status === 2000000 && body?.data?.members?.service_ticket) {
      return { state: 'success', serviceTicket: body.data.members.service_ticket, body }
    }
    if ([50004002, 50004003, 50004004].includes(status) || /expired|failed|error|timeout|invalid/i.test(message)) {
      return { state: 'failed', body }
    }
    return { state: 'pending', body }
  }

  /** ④ 用 service ticket 换取登录态 cookie */
  async completeLogin(serviceTicket) {
    const url = `${this.panBase}/account/info?${new URLSearchParams({ st: serviceTicket, lw: 'scan' })}`
    const res = await this._get(url)
    const cookies = parseSetCookies(res.headers).filter((c) => !/^(expires|path|domain|max-age|samesite|secure|httponly)$/i.test(c.name))
    if (res.status !== 200) {
      throw new QuarkAuthError(`获取登录态失败：HTTP ${res.status}`, { status: res.status })
    }
    if (!cookies.length) {
      throw new QuarkAuthError('登录成功但未拿到 cookie（夸克可能变更了登录接口）')
    }
    let userInfo = null
    try {
      userInfo = await res.json()
    } catch {
      /* 部分实现返回非 JSON，忽略 */
    }
    return { cookie: cookieHeaderFrom(cookies), cookies, userInfo }
  }

  /**
   * 完整流程：拿二维码 → 轮询（onQr 回调展示）→ 换 cookie。
   * @param {{ token, requestId, qrUrl }} session 由 createQrSession 提供
   * @param {(state:string)=>void} [onPoll]
   * @param {{ timeoutMs?: number, intervalMs?: number, sleep?: Function }} [opts]
   */
  async waitForScan(session, { timeoutMs = 300000, intervalMs = 2000, onPoll, sleep } = {}) {
    const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)))
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const status = await this.pollQrSession(session)
      if (onPoll) onPoll(status.state)
      if (status.state === 'success') return this.completeLogin(status.serviceTicket)
      if (status.state === 'failed') throw new QuarkAuthError('二维码已失效或被拒绝，请重新获取')
      if (Date.now() >= deadline) throw new QuarkAuthError('扫码登录超时，请重新获取二维码')
      await wait(intervalMs)
    }
  }
}

/** cookie 落盘（0600），避免走 .env / 版本库 */
export function saveCookie(cookie, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, String(cookie).trim(), { mode: 0o600 })
  return file
}

export function loadCookie(file) {
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, 'utf-8').trim()
  } catch {
    /* ignore */
  }
  return ''
}
