/**
 * 小说来源适配器（Sprint 19 / S19-2）
 *
 * - qishuxia-txt：qishuxia.com 站点 TXT 下载（两跳 Cookie + GBK 解码）—— 首选
 * - text：用户粘贴/上传文本 —— 最稳、随时可用
 * - qishuxia-chapters：逐章抓取 —— 兜底（本轮未实现，明确报错）
 *
 * 边界：只做常规 HTTP 请求与 Cookie 往返；不绕过登录/验证码/加密接口。
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
const BASE = 'https://www.qishuxia.com'

export function parseBookId(input) {
  const s = String(input || '')
  const m = s.match(/book\/(\d+)/)
  if (m) return m[1]
  if (/^\d+$/.test(s.trim())) return s.trim()
  return null
}

/** GBK/GB18030 解码（Node 需 full-icu，Node 18+ 默认满足） */
export function decodeGbk(buf) {
  return new TextDecoder('gb18030', { fatal: false }).decode(buf)
}

function pickMeta(html, prop) {
  const re = new RegExp(`<meta[^>]*property="${prop}"[^>]*content="([^"]*)"`)
  const m = html.match(re)
  return m ? m[1] : ''
}

async function getChallengeCookie(bookId) {
  const res = await fetch(`${BASE}/book/${bookId}/`, { headers: { 'User-Agent': UA } })
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  return setCookies.map((c) => c.split(';')[0]).join('; ')
}

/**
 * 下载整本 TXT 并解码
 * @param {string} input 书籍 URL 或 ID（如 /book/34639/ 或 34639）
 * @returns {Promise<{bookId,title,author,category,status,text}>}
 */
export async function fetchQishuxiaTxt(input) {
  const bookId = parseBookId(input)
  if (!bookId) throw new Error('无法解析书籍 ID（需形如 /book/34639/ 或 34639）')

  const cookie = await getChallengeCookie(bookId)

  // 书籍页元信息
  const bookRes = await fetch(`${BASE}/book/${bookId}/`, {
    headers: { 'User-Agent': UA, ...(cookie ? { Cookie: cookie } : {}) },
  })
  if (!bookRes.ok) throw new Error(`书籍页请求失败: HTTP ${bookRes.status}`)
  const bookHtml = decodeGbk(Buffer.from(await bookRes.arrayBuffer()))
  const meta = {
    bookId,
    title: pickMeta(bookHtml, 'og:novel:book_name'),
    author: pickMeta(bookHtml, 'og:novel:author'),
    category: pickMeta(bookHtml, 'og:novel:category'),
    status: pickMeta(bookHtml, 'og:novel:status'),
  }

  // TXT 下载
  const txtRes = await fetch(`${BASE}/modules/article/txtarticle.php?id=${bookId}`, {
    headers: { 'User-Agent': UA, Referer: `${BASE}/book/${bookId}/`, ...(cookie ? { Cookie: cookie } : {}) },
  })
  if (!txtRes.ok) throw new Error(`TXT 下载失败: HTTP ${txtRes.status}`)
  const buf = Buffer.from(await txtRes.arrayBuffer())
  if (buf.length < 100) throw new Error('TXT 下载内容过小，可能被拦截')

  return { ...meta, text: decodeGbk(buf) }
}

/**
 * 逐章抓取（兜底）——本轮未实现
 */
export async function fetchQishuxiaChapters() {
  throw new Error('逐章抓取（qishuxia-chapters）本轮未实现；请使用 qishuxia-txt 或 text 来源')
}
