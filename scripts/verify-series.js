#!/usr/bin/env node
/**
 * 分季分集验收：时长、覆盖、章节边界、季集数。
 *
 * 用法：
 *   node scripts/verify-series.js <novelId> [--chars-per-second 4.5] [--strict] [--json]
 *
 * --strict：不达标（命中率 < 99% 或存在大段未覆盖）时退出码 1。
 */
import 'dotenv/config'
import { storageService } from '../src/services/storageService.js'
import { getNovelProject, readCleanedText } from '../src/services/novelProjectService.js'
import { listEpisodes, listSeasons, getEpisodeText, isPgWriteMode } from '../src/services/novelEpisodeStore.js'
import { getNovelWriteRepositories } from '../src/repositories/unitOfWork.js'
import config from '../src/config/index.js'

const args = process.argv.slice(2)
const novelId = args.find((a) => !a.startsWith('--'))
const flag = (n) => args.includes(`--${n}`)
const value = (n, fallback) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

if (!novelId) {
  console.error('用法: node scripts/verify-series.js <novelId> [--chars-per-second 4.5] [--strict] [--json]')
  process.exit(1)
}

const cps = Number(value('chars-per-second', 4.5)) || 4.5
const project = getNovelProject(novelId)
const cleaned = readCleanedText(novelId)
const episodes = (await listEpisodes(novelId)).sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
const seasons = (await listSeasons(novelId)).sort((a, b) => (a.seasonNo ?? 0) - (b.seasonNo ?? 0))
const pgSource = isPgWriteMode()
  ? await getNovelWriteRepositories().sources.get(novelId, { orgId: config.novels.orgId })
  : null

const BOUNDARY = new Set(['。', '！', '？', '…', '；', '!', '?', ';', '\n', '，', ',', '、', '：', ':', '”', '」', '』', ')', '）'])
const HEADING_RE = /^第[0-9零一二三四五六七八九十百千万两]+[章节回][^\n]{0,50}$/

const buckets = { below: 0, inRange: 0, above: 0 }
const badBoundary = []
const endsWithHeading = []
const offsetMismatch = []
const gaps = []
let lastEnd = 0

const chapterEnds = new Set(storageService.listNovelChunks(novelId).map((c) => c.endOffset))
const intervals = []
for (const ep of episodes) {
  const text =
    pgSource?.cleanedText && ep.startOffset !== null && ep.startOffset !== undefined
      ? pgSource.cleanedText.slice(ep.startOffset, ep.endOffset)
      : await getEpisodeText(novelId, ep)
  const sec = text.length / cps
  if (sec < 85) buckets.below += 1
  else if (sec > 95) buckets.above += 1
  else buckets.inRange += 1

  const raw = text
  const trimmed = raw.replace(/\s+$/, '')
  const lastLine = trimmed.split('\n').at(-1).trim()
  if (lastLine && HEADING_RE.test(lastLine)) {
    endsWithHeading.push({ episodeNo: ep.episodeNo, lastLine: lastLine.slice(0, 40) })
  } else {
    const last = trimmed.slice(-1)
    const trailingWhitespace = /\s$/.test(raw)
    const atChapterEnd = ep.endOffset != null && chapterEnds.has(ep.endOffset)
    if (last && !BOUNDARY.has(last) && !trailingWhitespace && !atChapterEnd) {
      badBoundary.push({ episodeNo: ep.episodeNo, last })
    }
  }

  if (ep.startOffset != null && ep.endOffset != null) {
    const sliced = cleaned.slice(ep.startOffset, ep.endOffset)
    if (sliced !== text) offsetMismatch.push(ep.episodeNo)
    intervals.push([ep.startOffset, ep.endOffset])
  }
}

intervals.sort((a, b) => a[0] - b[0])
for (const [s, e] of intervals) {
  if (s > lastEnd) gaps.push({ from: lastEnd, to: s, chars: s - lastEnd })
  else if (s < lastEnd) gaps.push({ from: s, to: lastEnd, chars: lastEnd - s, overlap: true })
  lastEnd = Math.max(lastEnd, e)
}
// 覆盖率按区间并集计算
let union = 0
let cursor = 0
for (const [s, e] of intervals) {
  const a = Math.max(s, cursor)
  if (e > a) {
    union += e - a
    cursor = e
  }
}
const totalChars = cleaned.length
const coverage = totalChars ? union / totalChars : 0
const bigGaps = gaps.filter((g) => !g.overlap && g.chars > 200)
const shortSeasons = seasons.filter((s, i) => i < seasons.length - 1 && (s.episodeCount ?? 0) < 200)

const hitRate = buckets.inRange / Math.max(1, episodes.length)
const report = {
  novel: { id: novelId, title: project.title, chapters: storageService.listNovelChunks(novelId).length },
  seasons: seasons.length,
  episodes: episodes.length,
  duration: {
    charsPerSecond: cps,
    below85: buckets.below,
    inRange85to95: buckets.inRange,
    above95: buckets.above,
    hitRate: Number((hitRate * 100).toFixed(2)),
  },
  coverage: {
    cleanedChars: totalChars,
    coveredChars: union,
    ratio: Number((coverage * 100).toFixed(2)),
    gaps: bigGaps.slice(0, 20),
    gapCount: bigGaps.length,
  },
  boundaries: { midSentence: badBoundary.length, samples: badBoundary.slice(0, 10), endsWithHeading: endsWithHeading.length, headingSamples: endsWithHeading.slice(0, 10) },
  offsets: { mismatch: offsetMismatch.length, samples: offsetMismatch.slice(0, 10) },
  seasonsBelow200: shortSeasons.map((s) => ({ seasonNo: s.seasonNo, episodeCount: s.episodeCount })),
}

if (flag('json')) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log(`作品：${project.title || novelId}（${novelId}）`)
  console.log(`章节 ${report.novel.chapters}｜季 ${report.seasons}｜集 ${report.episodes}`)
  console.log(
    `时长 85–95s 命中：${buckets.inRange}/${episodes.length}（${report.duration.hitRate}%）｜<85s ${buckets.below}｜>95s ${buckets.above}`
  )
  console.log(
    `覆盖：${report.coverage.coveredChars}/${totalChars}（${report.coverage.ratio}%）｜大段空洞 ${report.coverage.gapCount}`
  )
  if (report.coverage.gaps.length) console.log('  空洞示例：', report.coverage.gaps)
  console.log(`句中结尾：${report.boundaries.midSentence}｜标题结尾：${report.boundaries.endsWithHeading}｜偏移不一致：${report.offsets.mismatch}`)
  if (report.boundaries.samples.length) console.log('  句中示例：', report.boundaries.samples)
  if (report.boundaries.headingSamples.length) console.log('  标题结尾示例：', report.boundaries.headingSamples)
  if (report.offsets.samples.length) console.log('  偏移示例：', report.offsets.samples)
  if (report.seasonsBelow200.length) console.log('非末季不足 200 集：', report.seasonsBelow200)
}

const ok =
  hitRate >= 0.99 &&
  bigGaps.length === 0 &&
  offsetMismatch.length === 0 &&
  shortSeasons.length === 0 &&
  badBoundary.length === 0 &&
  endsWithHeading.length === 0
if (flag('strict') && !ok) process.exit(1)
