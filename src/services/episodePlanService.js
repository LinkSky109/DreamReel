import { tokenizeWithOffsets } from '../utils/textOffsets.js'

/**
 * 分集规划（时长优先 + 故事边界）。
 *
 * 目标：每集内容可支撑 90s ± 5s（默认 85–95s，按 charsPerSecond 换算）。
 * 规则：
 *  - 只在自然边界切：章末 > 段落/换行 > 句子（。！？…；）> 分句（，、：）；
 *  - 优先在章末落刀，减少跨章；
 *  - 整段内容不足 85s 时退回「1 章 ≥ 1 集」，避免把极短文本硬凑成 90s。
 *
 * 偏移量口径：cleaned.txt 的 UTF-16 code unit。
 */

export const DEFAULT_CHARS_PER_SECOND = 4.5
export const DEFAULT_EPISODE_SECONDS = 90
export const DEFAULT_TOLERANCE_SECONDS = 5

// 章节标题行（第X章/节/回）；避免某一集刚好停在标题上
const HEADING_RE = /^第[0-9零一二三四五六七八九十百千万两]+[章节回][^\n]{0,50}$/

export function episodeSecondsForText(text, charsPerSecond = DEFAULT_CHARS_PER_SECOND) {
  return (text ? String(text).length : 0) / charsPerSecond
}

function findChapter(bounds, offset, fallbackIndex = -1) {
  if (!bounds.length) return null
  const at = Math.max(0, Number(offset) || 0)
  let candidate = null
  for (const b of bounds) {
    if (at >= b.startOffset && at < b.endOffset) return b
    if (b.startOffset <= at) candidate = b
  }
  return candidate || bounds[fallbackIndex] || bounds[0] || null
}

function chapterTitleOf(ep) {
  const a = ep.startChapter?.chapterTitle || ''
  const b = ep.endChapter?.chapterTitle || ''
  if (!a) return b
  if (!b || a === b) return a
  return `${a}…${b}`
}

/** 同一章被拆成多集时补（k/n），否则用章标题（跨章用 A…B） */
function assignTitles(episodes) {
  const groups = new Map()
  for (const ep of episodes) {
    if (ep.startChapter && ep.endChapter && ep.startChapter.index === ep.endChapter.index) {
      const key = ep.startChapter.index
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(ep)
    }
  }
  for (const [key, list] of groups) {
    if (list.length <= 1) continue
    list.forEach((ep, i) => {
      const base = ep.startChapter.chapterTitle || ''
      ep.title = base ? `${base}（${i + 1}/${list.length}）` : `第${key + 1}章（${i + 1}/${list.length}）`
    })
  }
  return episodes
}

function buildEpisode({ startOffset, endOffset, estimatedSeconds, chapterBounds, shortSource }) {
  const startChapter = findChapter(chapterBounds, startOffset)
  const endChapter = findChapter(chapterBounds, Math.max(startOffset, endOffset - 1))
  const ep = {
    startOffset,
    endOffset,
    estimatedSeconds: Number(estimatedSeconds.toFixed(2)),
    shortSource: !!shortSource,
    startChapter,
    endChapter,
    chapterStart: startChapter ? startChapter.index : null,
    chapterEnd: endChapter ? endChapter.index : null,
  }
  ep.title = chapterTitleOf(ep)
  return ep
}

/**
 * 在季/整本书的章节范围内切集。
 *
 * @param {object} opts
 * @param {string} opts.cleanedText 全文（cleaned.txt）
 * @param {Array<{index:number,chapterTitle:string,startOffset:number,endOffset:number}>} opts.chapterBounds
 * @param {number} opts.rangeStart
 * @param {number} opts.rangeEnd
 * @param {number} [opts.charsPerSecond]
 * @param {number} [opts.episodeSeconds]
 * @param {number} [opts.tolerance]
 * @param {boolean} [opts.shortSource] 强制按章切（极短源）
 * @returns {{episodes:Array, exceptions:Array, shortSource:boolean}}
 */
export function planEpisodesInRange(opts = {}) {
  const {
    cleanedText = '',
    chapterBounds = [],
    rangeStart = 0,
    rangeEnd = cleanedText.length,
    charsPerSecond = DEFAULT_CHARS_PER_SECOND,
    episodeSeconds = DEFAULT_EPISODE_SECONDS,
    tolerance = DEFAULT_TOLERANCE_SECONDS,
  } = opts

  const total = String(cleanedText || '').length
  const start = Math.max(0, Math.min(Number(rangeStart) || 0, total))
  const rawEnd = rangeEnd === null || rangeEnd === undefined ? total : Number(rangeEnd)
  const end = Math.max(start, Math.min(Number.isFinite(rawEnd) ? rawEnd : total, total))
  const segment = String(cleanedText || '').slice(start, end)
  const loSec = Math.max(1, episodeSeconds - tolerance)
  const hiSec = episodeSeconds + tolerance
  const loChars = loSec * charsPerSecond
  const hiChars = hiSec * charsPerSecond
  const targetChars = episodeSeconds * charsPerSecond

  const bounds = chapterBounds.filter((b) => b.endOffset > start && b.startOffset < end)
  const shortSource = opts.shortSource === true || segment.length / charsPerSecond < loSec

  const exceptions = []

  // 极短源：1 章 ≥ 1 集（保留旧测试/小样本行为）
  if (shortSource) {
    const episodes = []
    for (const b of bounds) {
      const a = Math.max(start, b.startOffset)
      const z = Math.min(end, b.endOffset)
      if (z <= a) continue
      const ep = buildEpisode({
        startOffset: a,
        endOffset: z,
        estimatedSeconds: (z - a) / charsPerSecond,
        chapterBounds,
        shortSource: true,
      })
      episodes.push(ep)
    }
    if (!episodes.length && segment.length) {
      episodes.push(
        buildEpisode({
          startOffset: start,
          endOffset: end,
          estimatedSeconds: segment.length / charsPerSecond,
          chapterBounds,
          shortSource: true,
        })
      )
    }
    assignTitles(episodes)
    return { episodes, exceptions, shortSource: true }
  }

  const tokens = tokenizeWithOffsets(segment, start)
  if (!tokens.length) return { episodes: [], exceptions, shortSource: false }

  // 章末偏移集合：优先在这些位置收尾
  const chapterEnds = new Set(bounds.map((b) => b.endOffset))
  chapterEnds.add(end)

  const groups = []
  let i = 0
  while (i < tokens.length) {
    const from = i
    let len = 0
    // 先累积到下限
    while (i < tokens.length && len < loChars) {
      len += tokens[i].text.length
      i += 1
    }
    // 再向目标靠拢；达到目标后只在章末继续吸收
    while (i < tokens.length) {
      const token = tokens[i]
      const nextLen = token.text.length
      const nextEnd = token.end
      const isChapterEnd = chapterEnds.has(nextEnd)
      if (len + nextLen > hiChars) break
      // 章节标题：只有能连带下一段正文时才纳入，避免一集停在标题行
      if (HEADING_RE.test(token.text.trim())) {
        // 源文本可能存在连续重复标题（站点产物）：整段标题一起吞掉，
        // 并至少连带下一段正文，避免任何一集以标题行收尾。
        let j = i
        let runLen = 0
        while (j < tokens.length && HEADING_RE.test(tokens[j].text.trim())) {
          runLen += tokens[j].text.length
          j += 1
        }
        const after = tokens[j]
        if (!after || len + runLen + after.text.length > hiChars) break
        len += runLen + after.text.length
        i = j + 1
        continue
      }
      if (len < targetChars || isChapterEnd) {
        len += nextLen
        i += 1
        continue
      }
      break
    }
    if (i === from) i += 1 // 防御：单 token 超过上限
    groups.push({ from, to: i, len })
  }

  // 尾集不足下限：在「保留 / 合并进前一集 / 对半分」中选最优。
  // 目标：先让越界集数最少，再让最大偏差最小；并列时优先合并（避免极短尾集）。
  if (groups.length >= 2) {
    const last = groups[groups.length - 1]
    const lastChars = tokens.slice(last.from, last.to).reduce((n, t) => n + t.text.length, 0)
    if (lastChars < loChars) {
      const prev = groups[groups.length - 2]
      const mergedFrom = prev.from
      const mergedTo = last.to
      const prevChars = tokens.slice(prev.from, prev.to).reduce((n, t) => n + t.text.length, 0)

      const score = (list) => {
        const secs = list.map((n) => n / charsPerSecond)
        const out = secs.filter((x) => x < loSec - 1e-9 || x > hiSec + 1e-9).length
        const maxDev = Math.max(...secs.map((x) => Math.abs(x - episodeSeconds)))
        return { out, maxDev }
      }

      const candidates = [{ type: 'keep', score: score([prevChars, lastChars]) }]
      candidates.push({ type: 'merge', score: score([prevChars + lastChars]) })

      let bestCut = null
      let acc = 0
      for (let cut = mergedFrom + 1; cut < mergedTo; cut += 1) {
        acc += tokens[cut - 1].text.length
        const aChars = acc
        const bChars = tokens.slice(cut, mergedTo).reduce((n, t) => n + t.text.length, 0)
        const sc = score([aChars, bChars])
        if (!bestCut || sc.maxDev < bestCut.score.maxDev) bestCut = { cut, aChars, bChars, score: sc }
      }
      if (bestCut) candidates.push({ type: 'split', ...bestCut })

      candidates.sort((a, b) => {
        if (a.score.out !== b.score.out) return a.score.out - b.score.out
        if (Math.abs(a.score.maxDev - b.score.maxDev) > 1e-9) return a.score.maxDev - b.score.maxDev
        return a.type === 'merge' ? -1 : b.type === 'merge' ? 1 : 0
      })

      const chosen = candidates[0]
      if (chosen.type === 'merge') {
        groups.splice(groups.length - 2, 2, { from: mergedFrom, to: mergedTo, len: prevChars + lastChars })
      } else if (chosen.type === 'split') {
        groups.splice(
          groups.length - 2,
          2,
          { from: mergedFrom, to: chosen.cut, len: chosen.aChars },
          { from: chosen.cut, to: mergedTo, len: chosen.bChars }
        )
      }
    }
  }

  const episodes = []
  for (const g of groups) {
    const first = tokens[g.from]
    const last = tokens[g.to - 1]
    const chars = tokens.slice(g.from, g.to).reduce((n, t) => n + t.text.length, 0)
    const est = chars / charsPerSecond
    const ep = buildEpisode({
      startOffset: first.start,
      endOffset: last.end,
      estimatedSeconds: est,
      chapterBounds,
      shortSource: false,
    })
    episodes.push(ep)
    if (est < loSec - 1e-9 || est > hiSec + 1e-9) {
      exceptions.push({
        startOffset: ep.startOffset,
        endOffset: ep.endOffset,
        estimatedSeconds: ep.estimatedSeconds,
        reason: est < loSec ? 'below-range' : 'above-range',
      })
    }
  }

  assignTitles(episodes)
  return { episodes, exceptions, shortSource: false }
}
