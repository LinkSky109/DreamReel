import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import { storageService } from './storageService.js'
import { NovelChunk } from '../models/NovelChunk.js'
import {
  updateNovelProject,
  writeNovelFile,
  novelDir,
  assertEditable,
  getChunkText,
  invalidateCleanedCache,
} from './novelProjectService.js'
import { getNovelProjectAsync } from './novelAsyncReadService.js'
import { fetchQishuxiaTxt } from './novelSourceService.js'
import { hashText, locateChapters } from '../utils/textOffsets.js'
import { withNovelTransaction } from '../repositories/unitOfWork.js'

/** 章节标题（第X章 / 第X节 / 第X回） */
const HEADING_RE = /^第[0-9零一二三四五六七八九十百千万两]+[章节回][^\n]{0,50}$/

/** 重复标题变体（站点生成，如「第一节废墟中的男子()」） */
const DUP_HEADING_RE = /^第[0-9零一二三四五六七八九十百千万两]+[章节回][^\n]*\(\s*\)\s*$/

/** 纯标点/空白行 */
const PUNCT_ONLY_RE = /^[\s\u3000，。！？、：；…—\-·"“”'‘’()（）〔〕【】《》]*$/

/** 站点水印 / 广告 / 导航 */
const DROP_PATTERNS = [
  /一秒记住/,
  /天才一秒记住/,
  /请记住本书/,
  /奇书网|qishuxia/i,
  /最新网址|手机版阅读|加入书签/,
  /求收藏|求推荐|推荐票|月票|打赏|订阅/,
  /本章未完|未完待续/,
]

/** 清洗：统一换行 + 去水印/广告/重复标题/纯标点行 + 折叠空行（以此清理后文本为准） */
export function cleanText(raw) {
  const lines = String(raw || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((line) => {
      const t = line.trim()
      if (!t) return false
      if (DUP_HEADING_RE.test(t)) return false
      if (PUNCT_ONLY_RE.test(t)) return false
      if (DROP_PATTERNS.some((re) => re.test(t))) return false
      return true
    })
  return lines.join('\n')
}

/** 按章节标题切分（合并重复/空标题块，取第一个较干净的标题） */
export function splitChapters(raw) {
  const text = cleanText(raw)
  const rawChapters = []
  let cur = null
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (HEADING_RE.test(t)) {
      if (cur) rawChapters.push(cur)
      cur = { title: t, lines: [] }
    } else if (cur) {
      cur.lines.push(line)
    }
  }
  if (cur) rawChapters.push(cur)

  // 合并：空内容的块（如站点重复标题行）丢弃，其标题并入下一个有内容的块
  const chapters = []
  let pendingTitle = null
  for (const ch of rawChapters) {
    const body = ch.lines.join('\n').trim()
    if (!body) {
      if (!pendingTitle) pendingTitle = ch.title
      continue
    }
    chapters.push({ index: chapters.length, chapterTitle: pendingTitle || ch.title, text: body })
    pendingTitle = null
  }
  return chapters
}

/**
 * 摄取：来源 → 清洗 → 分章 → 切片入库 + 落盘
 * - 只下载一次：若 source/cleaned.txt 已存在且非 force，则复用，不重复下载
 * - 以清理后文本为准：切分与入库都基于 cleaned 文本
 * @param {string} novelId
 * @param {object} opts { sourceType, text?, url?, maxChapters?, force? }
 */
export async function ingestNovel(novelId, { sourceType = 'text', text, url, maxChapters, force = false } = {}) {
  const project = await getNovelProjectAsync(novelId)
  assertEditable(project, 'source')
  const cleanedAbs = path.join(novelDir(novelId), 'source', 'cleaned.txt')
  let cleaned
  let meta = {}
  let downloaded = false

  if (!force && fs.existsSync(cleanedAbs)) {
    cleaned = fs.readFileSync(cleanedAbs, 'utf-8')
  } else {
    let raw = text
    if (sourceType === 'qishuxia-txt') {
      const r = await fetchQishuxiaTxt(url || project.sourceRef)
      raw = r.text
      downloaded = true
      meta = {
        title: r.title || project.title,
        author: r.author || project.author,
        category: r.category || project.category,
      }
    }
    if (!raw) throw new Error('缺少正文：请提供 text 或可用的 url')
    writeNovelFile(novelId, 'source/raw.txt', raw)
    cleaned = cleanText(raw)
    writeNovelFile(novelId, 'source/cleaned.txt', cleaned) // 以清理后文本为准
  }

  invalidateCleanedCache(novelId)
  const cleanedHash = hashText(cleaned)
  let chapters = locateChapters(cleaned, splitChapters(cleaned))
  if (maxChapters && maxChapters > 0) chapters = chapters.slice(0, maxChapters)
  if (!chapters.length) throw new Error('未能识别到章节（TXT 格式可能不符）')

  // 新数据只落偏移；正文由 listChunks/getChunkText 从 cleaned.txt 水合
  const chunks = chapters.map((c) => new NovelChunk({
    novelId,
    index: c.index,
    chapterTitle: c.chapterTitle,
    startOffset: c.startOffset,
    endOffset: c.endOffset,
    wordCount: (c.text || '').length,
    cleanedHash,
  }))

  // PG 优先：先提交正文/切片事务，成功后再更新本地 JSON 读缓存。
  if (config.novels.writeMode === 'postgres') {
    await withNovelTransaction(
      novelId,
      async (repos) => {
        await repos.sources.upsert(
          novelId,
          {
            sourceType,
            sourceRef: url || project.sourceRef || '',
            cleanedText: cleaned,
            cleanedHash,
            encoding: 'utf-8',
            wordCount: cleaned.length,
          },
          { orgId: config.novels.orgId }
        )
        await repos.chunks.replaceAll(
          novelId,
          chunks.map((c, i) => ({
            id: c.id,
            index: c.index,
            chapterTitle: c.chapterTitle,
            startOffset: c.startOffset,
            endOffset: c.endOffset,
            wordCount: c.wordCount,
            cleanedHash: c.cleanedHash,
            sortOrder: i,
          })),
          { orgId: config.novels.orgId }
        )
      },
      { orgId: config.novels.orgId }
    )
  }

  // 清理旧缓存切片
  if (storageService.data.novelChunks) {
    for (const c of storageService.listNovelChunks(novelId)) {
      delete storageService.data.novelChunks[c.id]
    }
  }
  for (const c of chunks) storageService.createNovelChunk(c)

  writeNovelFile(
    novelId,
    'chunks/chunks.json',
    JSON.stringify(
      chunks.map((c) => ({
        index: c.index,
        chapterTitle: c.chapterTitle,
        wordCount: c.wordCount,
        startOffset: c.startOffset,
        endOffset: c.endOffset,
        cleanedHash: c.cleanedHash,
      })),
      null,
      2
    )
  )

  const updated = await updateNovelProject(novelId, {
    sourceType,
    sourceRef: url || project.sourceRef,
    ...meta,
    status: 'ingested',
    counts: { ...project.counts, chapters: chunks.length },
  })

  return { project: updated, chapterCount: chunks.length, downloaded }
}

/**
 * 章节列表。返回带 text 的对象（新数据从 cleaned.txt 按偏移水合），
 * 以保持抽取/世界观/统计等既有调用方无需改动。
 */
export function listChunks(novelId) {
  return storageService
    .listNovelChunks(novelId)
    .sort((a, b) => a.index - b.index)
    .map((chunk) => {
      if (typeof chunk.text === 'string' && chunk.text.length) return chunk
      const text = getChunkText(novelId, chunk)
      return text ? { ...chunk, text } : chunk
    })
}
