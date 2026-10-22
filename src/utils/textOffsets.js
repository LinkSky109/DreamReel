import crypto from 'crypto'

/**
 * 文本偏移工具。
 *
 * 约定：偏移量以 `source/cleaned.txt` 的 UTF-16 code unit 计（与 JS String.slice 一致）。
 * 章节正文与集正文不再各自落盘，统一按偏移从 cleaned.txt 切片。
 */

/** 稳定短 hash（16 位十六进制），用于校验 cleaned.txt 未变化 */
export function hashText(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16)
}

/** 按 [start, end) 切片；越界自动收敛 */
export function sliceByOffsets(text, start, end) {
  const s = String(text || '')
  const a = Math.max(0, Math.min(Number(start) || 0, s.length))
  const b = Math.max(a, Math.min(Number(end) || 0, s.length))
  return s.slice(a, b)
}

/**
 * 把 splitChapters 的结果映射为 cleaned.txt 中的偏移。
 * 章节 body 是 cleaned 文本的连续子串（逐章顺序查找，避免重复正文/标题误配）。
 * @param {string} cleanedText
 * @param {Array<{chapterTitle:string,text:string}>} chapters
 * @returns {Array<{chapterTitle:string,text:string,startOffset:number,endOffset:number}>}
 */
export function locateChapters(cleanedText, chapters = []) {
  const text = String(cleanedText || '')
  let cursor = 0
  return chapters.map((ch) => {
    const body = String(ch.text || '')
    let idx = body ? text.indexOf(body, cursor) : -1
    if (idx < 0 && body) idx = text.indexOf(body)
    if (idx < 0) idx = Math.min(cursor, text.length)
    const startOffset = idx
    const endOffset = Math.min(text.length, idx + body.length)
    cursor = endOffset
    return { ...ch, startOffset, endOffset }
  })
}

const TOKEN_SPLIT_RE = /(?<=[。！？…；!?;\n])|(?<=[，、：,:])/

/**
 * 按「句末 → 换行 → 分句标点」切 token，并给出绝对偏移。
 * token 保留其尾部分隔符，拼接后与原文完全一致。
 * @param {string} text
 * @param {number} baseOffset
 * @returns {Array<{text:string,start:number,end:number}>}
 */
export function tokenizeWithOffsets(text, baseOffset = 0) {
  const src = String(text || '')
  const parts = src.split(TOKEN_SPLIT_RE).filter((t) => t.length > 0)
  let cursor = Number(baseOffset) || 0
  return parts.map((t) => {
    const start = cursor
    cursor += t.length
    return { text: t, start, end: cursor }
  })
}
