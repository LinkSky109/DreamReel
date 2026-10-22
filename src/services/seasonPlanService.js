import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { novelDir } from './novelProjectService.js'
import { getLLMProviderByPref } from '../providers/llmProviderFactory.js'
import { isProviderConfigured } from '../providers/providerResolver.js'
import { runPool } from '../utils/pool.js'

/**
 * 分季规划（大事件/剧情弧）。
 *
 * 流程：
 *  1. 章摘要（分批 LLM，缓存到 plan/chapter-summaries.json）
 *  2. 弧线识别（分窗 LLM，缓存到 plan/arcs.json）
 *  3. 季装配：相邻弧合并，直到估算集数 ≥ episodesPerSeason
 *
 * 无 LLM（mock/未配置/--no-llm）时回退为「每章一个弧」+ 相邻合并，保证流程可用。
 */

const DEFAULT_SUMMARY_BATCH = 8
const DEFAULT_WINDOW = 60
const WINDOW_OVERLAP = 10

const SUMMARY_SYSTEM = '你是资深剧集策划。只输出 JSON，不要解释，不要 Markdown 代码块。'
const ARC_SYSTEM = '你是资深影视编剧与剧集策划。只输出 JSON，不要解释，不要 Markdown 代码块。'

function planPath(novelId, name) {
  return path.join(novelDir(novelId), 'plan', name)
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2))
}

function resolveProvider(project, opts = {}) {
  if (opts.useLLM === false || opts.provider === 'heuristic') return null
  const pref = opts.provider
    ? { provider: opts.provider, model: opts.model || null }
    : project?.providerPreferences?.llm || null
  const name = pref?.provider || config.llm.provider
  if (!name || name === 'mock') return null
  if (!isProviderConfigured('llm', name)) return null
  try {
    const provider = getLLMProviderByPref(pref)
    if (!provider || provider.name === 'mock') return null
    return provider
  } catch (error) {
    logger.warn(`分季 LLM 初始化失败，回退启发式：${error.message}`)
    return null
  }
}

function providerTag(project, opts = {}) {
  const pref = opts.provider ? { provider: opts.provider, model: opts.model || null } : project?.providerPreferences?.llm || null
  return `${pref?.provider || config.llm.provider}:${pref?.model || config.llm.model || ''}`
}

function chapterChars(ch) {
  if (ch.startOffset !== null && ch.startOffset !== undefined && ch.endOffset !== null && ch.endOffset !== undefined) {
    return Math.max(0, ch.endOffset - ch.startOffset)
  }
  return (ch.text || '').length
}

function episodesForChars(chars, targetChars) {
  // 向上取整：宁多不少，保证实际集数更可能 ≥ episodesPerSeason
  return Math.max(1, Math.ceil(chars / targetChars))
}

function heuristicArcs(chapters) {
  return chapters.map((ch) => ({
    name: ch.chapterTitle || `第${ch.index + 1}章`,
    chapterStart: ch.index,
    chapterEnd: ch.index,
    goal: '',
    acts: null,
    endingHook: '',
    summary: '',
  }))
}

function normalizeArcs(raw, chapters) {
  if (!Array.isArray(raw) || !raw.length) return null
  const byIndex = new Map(chapters.map((c) => [c.index, c]))
  const min = chapters.length ? chapters[0].index : 0
  const max = chapters.length ? chapters[chapters.length - 1].index : 0
  const arcs = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const start = Number(item.chapterStart)
    const end = Number(item.chapterEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue
    const s = Math.max(min, Math.min(start, max))
    const e = Math.max(s, Math.min(end, max))
    if (!byIndex.has(s) && !byIndex.has(e)) continue
    arcs.push({
      name: String(item.name || '').slice(0, 60),
      chapterStart: s,
      chapterEnd: e,
      goal: String(item.goal || '').slice(0, 200),
      acts: item.acts && typeof item.acts === 'object' ? item.acts : null,
      endingHook: String(item.endingHook || '').slice(0, 200),
      summary: String(item.summary || '').slice(0, 300),
    })
  }
  if (!arcs.length) return null
  arcs.sort((a, b) => a.chapterStart - b.chapterStart)

  // 连续覆盖校验：补空洞、去重叠
  const fixed = []
  let cursor = min
  for (const arc of arcs) {
    if (arc.chapterEnd < cursor) continue
    const start = Math.max(arc.chapterStart, cursor)
    if (start > cursor) {
      // 空洞：并入前一个弧（或自成弧）
      if (fixed.length) fixed[fixed.length - 1].chapterEnd = start - 1
      else fixed.push({ ...arc, chapterStart: cursor, chapterEnd: start - 1, name: arc.name })
    }
    if (arc.chapterEnd >= start) {
      fixed.push({ ...arc, chapterStart: start })
      cursor = arc.chapterEnd + 1
    }
    if (cursor > max) break
  }
  if (cursor <= max) {
    if (fixed.length) fixed[fixed.length - 1].chapterEnd = max
    else fixed.push({ ...heuristicArcs(chapters)[0], chapterStart: min, chapterEnd: max })
  }
  return fixed
}

function mergeArcWindows(windows) {
  let arcs = []
  for (const list of windows) {
    if (!list || !list.length) continue
    if (!arcs.length) {
      arcs = list.slice()
      continue
    }
    const last = arcs[arcs.length - 1]
    const first = list[0]
    if (first.chapterStart <= last.chapterEnd) {
      // 重叠区：保留覆盖更大的一侧
      if (last.chapterEnd - last.chapterStart >= first.chapterEnd - first.chapterStart) list.shift()
      else arcs.pop()
    }
    arcs = arcs.concat(list)
  }
  return arcs
}

async function buildChapterSummaries(novelId, chapters, { provider, tag, cleanedHash, force, concurrency = 4 }) {
  const file = planPath(novelId, 'chapter-summaries.json')
  const cached = readJson(file)
  if (!force && cached && cached.cleanedHash === cleanedHash && cached.provider === tag) {
    const map = new Map((cached.summaries || []).map((s) => [s.index, s]))
    if (chapters.every((c) => map.has(c.index))) {
      return chapters.map((c) => map.get(c.index))
    }
  }

  const batches = []
  for (let i = 0; i < chapters.length; i += DEFAULT_SUMMARY_BATCH) {
    batches.push(chapters.slice(i, i + DEFAULT_SUMMARY_BATCH))
  }
  const parts = await runPool(
    batches,
    (batch) => summarizeBatch(batch, provider),
    Math.max(1, Math.min(Number(concurrency) || 4, 6))
  )
  const summaries = parts.flat()

  // 缺失章节用标题兜底
  const byIndex = new Map(summaries.map((s) => [s.index, s]))
  const complete = chapters.map((ch) => {
    return (
      byIndex.get(ch.index) || {
        index: ch.index,
        summary: ch.chapterTitle || '',
        events: [],
        characters: [],
      }
    )
  })
  writeJson(file, { cleanedHash, provider: tag, summaries: complete, updatedAt: new Date().toISOString() })
  return complete
}

async function summarizeBatch(batch, provider) {
  if (!provider) {
    return batch.map((ch) => ({ index: ch.index, summary: ch.chapterTitle || '', events: [], characters: [] }))
  }
  const lines = batch.map((ch) => {
    const body = String(ch.text || '').slice(0, 1200)
    return `【${ch.index}】${ch.chapterTitle || ''}\n${body}`
  })
  const userPrompt = [
    '为以下小说章节逐章生成一句话剧情摘要与关键事件。',
    '严格输出 JSON 数组，不要解释：',
    '[{"index":0,"summary":"","events":[""],"characters":[""]}]',
    '',
    '章节：',
    ...lines,
  ].join('\n')
  try {
    const res = await provider.generateJSON({
      systemPrompt: SUMMARY_SYSTEM,
      userPrompt,
      options: { temperature: 0.2, maxTokens: 8000 },
    })
    const data = Array.isArray(res.data) ? res.data : res.data?.summaries
    if (!Array.isArray(data)) throw new Error('返回不是数组')
    const byIndex = new Map()
    for (const item of data) {
      const idx = Number(item?.index)
      if (!Number.isFinite(idx)) continue
      byIndex.set(idx, {
        index: idx,
        summary: String(item.summary || '').slice(0, 300),
        events: Array.isArray(item.events) ? item.events.slice(0, 8).map((x) => String(x).slice(0, 120)) : [],
        characters: Array.isArray(item.characters) ? item.characters.slice(0, 12).map((x) => String(x)) : [],
      })
    }
    return batch.map((ch) => byIndex.get(ch.index) || { index: ch.index, summary: ch.chapterTitle || '', events: [], characters: [] })
  } catch (error) {
    logger.warn(`章摘要 LLM 失败（${batch[0]?.index}-${batch[batch.length - 1]?.index}），用标题兜底：${error.message}`)
    return batch.map((ch) => ({ index: ch.index, summary: ch.chapterTitle || '', events: [], characters: [] }))
  }
}

async function detectArcsLLM(novelId, chapters, summaries, { provider, tag, cleanedHash, force, concurrency = 4 }) {
  const file = planPath(novelId, 'arcs.json')
  const cached = readJson(file)
  if (!force && cached && cached.cleanedHash === cleanedHash && cached.provider === tag) {
    const normalized = normalizeArcs(cached.arcs, chapters)
    if (normalized) return normalized
  }

  const list = summaries.map((s) => `${s.index}|${String(s.summary || '').slice(0, 60)}`)
  let windows = []
  if (!provider) {
    windows = [heuristicArcs(chapters)]
  } else {
    const slices = []
    for (let i = 0; i < list.length; i += DEFAULT_WINDOW - WINDOW_OVERLAP) {
      const lines = list.slice(i, i + DEFAULT_WINDOW)
      const subset = chapters.slice(i, i + DEFAULT_WINDOW)
      if (!lines.length || !subset.length) break
      slices.push({ lines, chapters: subset, min: subset[0].index, max: subset[subset.length - 1].index })
      if (i + DEFAULT_WINDOW >= list.length) break
    }
    const results = await runPool(
      slices,
      (slice) => detectArcWindow(slice.lines, slice.chapters, provider, slice.min, slice.max),
      Math.max(1, Math.min(Number(concurrency) || 4, 6))
    )
    windows = results.filter(Boolean)
  }

  let merged = provider ? mergeArcWindows(windows) : windows[0]
  merged = normalizeArcs(merged, chapters)
  if (!merged) {
    logger.warn('弧线识别结果不可用，回退为「每章一个弧」')
    merged = heuristicArcs(chapters)
  }
  writeJson(file, { cleanedHash, provider: tag, arcs: merged, updatedAt: new Date().toISOString() })
  return merged
}

async function detectArcWindow(summaryLines, windowChapters, provider, minIndex, maxIndex) {
  const userPrompt = [
    '以下是一部长篇小说的章摘要（index|summary）。请按「完整大事件/剧情弧」划分季。',
    '硬性要求：',
    `本窗口章节索引范围：${minIndex}-${maxIndex}；所有 chapterStart/chapterEnd 必须落在该范围内。`,
    '1. 每个弧是一个完整闭合的大事件，不得把同一事件拆到两个弧；',
    '2. 弧首尾相接，覆盖本窗口所有章节，不重叠；',
    '3. 严格输出 JSON 数组，不要解释；只输出必要字段：',
    '[{"name":"","chapterStart":0,"chapterEnd":25,"goal":"","endingHook":""}]',
    '',
    '章摘要：',
    ...summaryLines,
  ].join('\n')
  try {
    const res = await provider.generateJSON({
      systemPrompt: ARC_SYSTEM,
      userPrompt,
      options: { temperature: 0.2, maxTokens: 8000 },
    })
    const data = Array.isArray(res.data) ? res.data : res.data?.arcs
    return normalizeArcs(data, windowChapters)
  } catch (error) {
    logger.warn(`弧线识别 LLM 失败，跳过该窗口：${error.message}`)
    return null
  }
}

function mergeActs(arcs) {
  if (!arcs.length) return null
  if (arcs.length === 1) return arcs[0].acts || null
  const first = arcs[0].acts || {}
  const last = arcs[arcs.length - 1].acts || {}
  return {
    setup: first.setup || '',
    confrontation: arcs
      .slice(0, -1)
      .map((a) => a.acts?.confrontation || a.goal || '')
      .filter(Boolean)
      .join('；')
      .slice(0, 600),
    resolution: last.resolution || last.goal || '',
  }
}

/**
 * 装配季：相邻弧合并，直到估算集数 ≥ episodesPerSeason。
 * 最后一季不足时并入前一季（保持相邻、剧情连贯）。
 */
export function assembleSeasons({ arcs, chapters, episodeSeconds = 90, charsPerSecond = 4.5, episodesPerSeason = 200 }) {
  const targetChars = episodeSeconds * charsPerSecond
  const charsByIndex = new Map(chapters.map((c) => [c.index, chapterChars(c)]))
  const episodesOfArc = (arc) => {
    let chars = 0
    for (let i = arc.chapterStart; i <= arc.chapterEnd; i += 1) chars += charsByIndex.get(i) || 0
    return episodesForChars(chars, targetChars)
  }

  const groups = []
  let current = null
  for (const arc of arcs) {
    const eps = episodesOfArc(arc)
    if (!current) current = { arcs: [arc], episodes: eps }
    else {
      current.arcs.push(arc)
      current.episodes += eps
    }
    if (current.episodes >= episodesPerSeason) {
      groups.push(current)
      current = null
    }
  }
  if (current) {
    if (groups.length && current.episodes < episodesPerSeason) {
      const prev = groups[groups.length - 1]
      prev.arcs.push(...current.arcs)
      prev.episodes += current.episodes
    } else {
      groups.push(current)
    }
  }

  const chaptersByIndex = new Map(chapters.map((c) => [c.index, c]))
  return groups.map((group, i) => {
    const arcsInGroup = group.arcs
    const first = arcsInGroup[0]
    const last = arcsInGroup[arcsInGroup.length - 1]
    const startTitle = chaptersByIndex.get(first.chapterStart)?.chapterTitle || first.name || ''
    const endTitle = chaptersByIndex.get(last.chapterEnd)?.chapterTitle || last.name || ''
    const arcName = arcsInGroup.length === 1 ? first.name : `${first.name}…${last.name}`
    const goals = [...new Set(arcsInGroup.map((a) => a.goal).filter(Boolean))]
    return {
      seasonNo: i + 1,
      title: arcsInGroup.length === 1 && first.name ? first.name : `第${i + 1}季`,
      synopsis: `${startTitle} … ${endTitle}`.trim(),
      chapterStart: first.chapterStart,
      chapterEnd: last.chapterEnd,
      estimatedEpisodes: group.episodes,
      arcName,
      goal: goals.join('；').slice(0, 800),
      acts: mergeActs(arcsInGroup),
      endingHook: last.endingHook || '',
    }
  })
}

/**
 * 规划季结构（LLM 优先，启发式回退）。
 */
export async function planSeasonStructure(novelId, chapters, opts = {}) {
  const {
    cleanedHash = '',
    episodeSeconds = 90,
    charsPerSecond = 4.5,
    episodesPerSeason = 200,
    force = false,
  } = opts
  if (!chapters.length) return { seasons: [], provider: 'heuristic' }

  const provider = resolveProvider(opts.project, opts)
  const tag = providerTag(opts.project, opts)
  const planProvider = provider ? 'llm' : 'heuristic'

  let summaries
  let arcs
  if (provider) {
    summaries = await buildChapterSummaries(novelId, chapters, { provider, tag, cleanedHash, force, concurrency: opts.concurrency })
    arcs = await detectArcsLLM(novelId, chapters, summaries, { provider, tag, cleanedHash, force, concurrency: opts.concurrency })
  } else {
    arcs = heuristicArcs(chapters)
    writeJson(planPath(novelId, 'arcs.json'), {
      cleanedHash,
      provider: tag,
      arcs,
      updatedAt: new Date().toISOString(),
    })
  }

  const seasons = assembleSeasons({ arcs, chapters, episodeSeconds, charsPerSecond, episodesPerSeason })
  for (const season of seasons) season.planProvider = planProvider
  writeJson(planPath(novelId, 'seasons.json'), {
    cleanedHash,
    provider: tag,
    seasons,
    updatedAt: new Date().toISOString(),
  })
  return { seasons, provider: planProvider }
}
