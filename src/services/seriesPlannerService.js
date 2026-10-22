import fs from 'fs'
import path from 'path'
import { writeChild } from './novelChildStore.js'
import {
  updateNovelProject,
  readCleanedText,
  novelDir,
  assertEditable,
  stageIndex,
} from './novelProjectService.js'
import { getNovelProjectAsync, listChunksAsync, listCharactersAsync } from './novelAsyncReadService.js'
import { hashText, locateChapters } from '../utils/textOffsets.js'
import { planEpisodesInRange } from './episodePlanService.js'
import { planSeasonStructure } from './seasonPlanService.js'
import { getEpisodeText as getEpisodeTextAsync } from './novelEpisodeStore.js'
import { withNovelTransaction, getNovelWriteRepositories } from '../repositories/unitOfWork.js'
import { generateId } from '../utils/idGenerator.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

/**
 * 分季分集规划（Sprint 21 / S21-1、S21-2）
 *
 * - 分季：LLM 按大事件/剧情弧划分，相邻弧合并至每季 ≥ N 集（默认 200）；无 LLM 回退启发式。
 * - 分集：按故事边界切分，内容支撑 90s ± 5s（85–95s）。
 * - 季/集写 PostgreSQL（事务 + advisory lock）。
 */

const DEFAULT_EPISODE_SECONDS = 90
const DEFAULT_EPISODES_PER_SEASON = 200
const DEFAULT_CHARS_PER_SECOND = 4.5
const DEFAULT_TOLERANCE_SECONDS = 5

export function estimateSeconds(text, charsPerSecond = DEFAULT_CHARS_PER_SECOND) {
  return Math.max(DEFAULT_EPISODE_SECONDS, Math.round((text ? text.length : 0) / charsPerSecond))
}

async function ensureChunkOffsets(novelId, chunks, cleanedText) {
  if (!cleanedText) return chunks
  const hasAll = chunks.every(
    (c) =>
      c.startOffset !== null &&
      c.startOffset !== undefined &&
      c.endOffset !== null &&
      c.endOffset !== undefined
  )
  if (hasAll) return chunks
  const cleanedHash = hashText(cleanedText)
  const located = locateChapters(
    cleanedText,
    chunks.map((c) => ({ ...c, text: c.text || '', startOffset: null, endOffset: null }))
  )
  const out = []
  for (const c of located) {
    const next = {
      ...c,
      wordCount: c.wordCount || (c.text || '').length,
      cleanedHash: c.cleanedHash || cleanedHash,
    }
    const persisted = { ...next }
    delete persisted.text
    await writeChild('chunks', persisted)
    out.push(next)
  }
  return out
}

function durationBuckets(episodes, lo = DEFAULT_EPISODE_SECONDS - DEFAULT_TOLERANCE_SECONDS, hi = DEFAULT_EPISODE_SECONDS + DEFAULT_TOLERANCE_SECONDS) {
  const out = { below: 0, inRange: 0, above: 0, total: episodes.length }
  for (const ep of episodes) {
    const sec = Number(ep.estimatedSeconds)
    if (!Number.isFinite(sec)) continue
    if (sec < lo) out.below += 1
    else if (sec > hi) out.above += 1
    else out.inRange += 1
  }
  return out
}

/** 把季结构 + 章节范围装配成最终集（相邻季合并，保证实际集数 ≥ 目标）。 */
function buildFinalEpisodePlan({
  plannedSeasons,
  chapterBounds,
  cleanedText,
  charsPerSecond,
  episodeSeconds,
  tolerance,
  episodesPerSeason,
}) {
  const groups = plannedSeasons
    .map((season) => {
      const bounds = chapterBounds.filter(
        (b) => b.index >= season.chapterStart && b.index <= season.chapterEnd
      )
      return bounds.length ? { ...season, bounds } : null
    })
    .filter(Boolean)

  const titleByIndex = new Map(chapterBounds.map((b) => [b.index, b.chapterTitle]))
  const titleOf = (index) => titleByIndex.get(index) || ''

  const planGroup = (group) => {
    const rangeStart = group.bounds[0].startOffset
    const rangeEnd = group.bounds[group.bounds.length - 1].endOffset
    return planEpisodesInRange({
      cleanedText,
      chapterBounds: group.bounds,
      rangeStart,
      rangeEnd,
      charsPerSecond,
      episodeSeconds,
      tolerance,
    })
  }

  const mergeGroups = (a, b) => ({
    ...a,
    chapterEnd: b.chapterEnd,
    bounds: chapterBounds.filter((x) => x.index >= a.chapterStart && x.index <= b.chapterEnd),
    synopsis: `${titleOf(a.chapterStart)} … ${titleOf(b.chapterEnd)}`.trim(),
    arcName: a.arcName === b.arcName ? a.arcName : `${a.arcName || ''}…${b.arcName || ''}`,
    goal: [a.goal, b.goal].filter(Boolean).join('；').slice(0, 800),
    acts: a.acts || b.acts,
    endingHook: b.endingHook || a.endingHook,
    estimatedEpisodes: (a.estimatedEpisodes || 0) + (b.estimatedEpisodes || 0),
    merged: true,
  })

  const finals = []
  let gi = 0
  while (gi < groups.length) {
    let group = groups[gi]
    let planned = planGroup(group)
    while (gi < groups.length - 1 && planned.episodes.length < episodesPerSeason) {
      gi += 1
      group = mergeGroups(group, groups[gi])
      planned = planGroup(group)
    }
    finals.push({ group, planned })
    gi += 1
  }
  if (finals.length > 1 && finals[finals.length - 1].planned.episodes.length < episodesPerSeason) {
    const last = finals.pop()
    const prev = finals[finals.length - 1]
    const group = mergeGroups(prev.group, last.group)
    finals[finals.length - 1] = { group, planned: planGroup(group) }
  }
  return finals
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

async function persistPlanArtifacts(novelId, cleanedHash, stats, orgId, repos = getNovelWriteRepositories()) {
  const dir = path.join(novelDir(novelId), 'plan')
  const artifacts = {}
  for (const [kind, file] of Object.entries({
    'chapter-summaries': 'chapter-summaries.json',
    arcs: 'arcs.json',
    seasons: 'seasons.json',
    exceptions: 'exceptions.json',
  })) {
    const data = readJson(path.join(dir, file))
    if (data) artifacts[kind] = data
  }
  if (!Object.keys(artifacts).length) return null
  const runId = `plan-${cleanedHash}`
  const existing = await repos.plans.findRun(runId, { orgId })
  if (!existing) {
    await repos.plans.createRun(
      {
        id: runId,
        novelId,
        cleanedHash,
        provider: artifacts.arcs?.provider || artifacts['chapter-summaries']?.provider || '',
        model: '',
      },
      { orgId }
    )
  }
  for (const [kind, payload] of Object.entries(artifacts)) {
    await repos.plans.addArtifact(runId, kind, payload)
  }
  await repos.plans.finishRun(runId, { status: 'done', stats })
  return runId
}

/** Phase 3a：季/集写 PostgreSQL（事务 + advisory lock）。 */
async function planSeriesPg({
  novelId,
  project,
  chunks,
  cleanedText,
  cleanedHash,
  episodeSeconds,
  episodesPerSeason,
  charsPerSecond,
  tolerance,
  opts,
}) {
  const orgId = config.novels.orgId
  const { seasons: plannedSeasons, provider } = await planSeasonStructure(novelId, chunks, {
    project,
    cleanedHash,
    episodeSeconds,
    charsPerSecond,
    episodesPerSeason,
    force: opts.forceSeasons === true,
    useLLM: opts.useLLM,
    provider: opts.provider,
    model: opts.model,
  })

  const chapterBounds = chunks.map((c) => ({
    index: c.index,
    chapterTitle: c.chapterTitle,
    startOffset: c.startOffset,
    endOffset: c.endOffset,
  }))
  const finals = buildFinalEpisodePlan({
    plannedSeasons,
    chapterBounds,
    cleanedText,
    charsPerSecond,
    episodeSeconds,
    tolerance,
    episodesPerSeason,
  })

  let seasonsCount = 0
  let episodesCount = 0
  const allExceptions = []

  await withNovelTransaction(
    novelId,
    async (repos) => {
      await repos.sources.upsert(
        novelId,
        {
          sourceType: project.sourceType || 'text',
          sourceRef: project.sourceRef || '',
          cleanedText,
          cleanedHash,
          encoding: 'utf-8',
          wordCount: cleanedText.length,
        },
        { orgId }
      )

      await repos.chunks.replaceAll(
        novelId,
        chunks.map((c, i) => ({
          id: c.id,
          index: c.index ?? i,
          chapterTitle: c.chapterTitle,
          startOffset: c.startOffset,
          endOffset: c.endOffset,
          wordCount: c.wordCount ?? (c.text || '').length,
          cleanedHash: c.cleanedHash || cleanedHash,
          sortOrder: i,
        })),
        { orgId }
      )

      const seasonRows = finals.map(({ group, planned }, i) => ({
        id: generateId(),
        seasonNo: group.seasonNo,
        title: group.merged ? `第${group.seasonNo}季` : group.title,
        synopsis: group.synopsis,
        episodeCount: planned.episodes.length,
        arcName: group.arcName,
        goal: group.goal,
        acts: group.acts,
        endingHook: group.endingHook,
        estimatedEpisodes: planned.episodes.length,
        planProvider: provider,
        chapterStart: group.chapterStart,
        chapterEnd: group.chapterEnd,
        sortOrder: i,
      }))
      const seasonIds = await repos.seasons.upsertMany(novelId, seasonRows, { orgId })
      await repos.seasons.softDeleteMissing(novelId, seasonRows.map((s) => s.seasonNo), { orgId })

      const episodeRows = []
      let episodeNo = 1
      for (const { group, planned } of finals) {
        const seasonId = seasonIds.get(group.seasonNo)
        for (const p of planned.episodes) {
          const startChapter = p.startChapter?.index ?? group.chapterStart
          const endChapter = p.endChapter?.index ?? group.chapterEnd
          episodeRows.push({
            id: generateId(),
            seasonId,
            episodeNo,
            logicalKey: `s${group.seasonNo}:e${episodeNo}`,
            title: p.title,
            chapterTitle: p.startChapter?.chapterTitle || '',
            chapterStart: startChapter,
            chapterEnd: endChapter,
            startOffset: p.startOffset,
            endOffset: p.endOffset,
            estimatedSeconds: p.estimatedSeconds,
            shortSource: p.shortSource,
            cleanedHash,
            outline: null,
            screenplay: null,
            targetSeconds: episodeSeconds,
            status: 'planned',
            sortOrder: episodeNo - 1,
          })
          episodeNo += 1
        }
      }
      await repos.episodes.upsertMany(novelId, episodeRows, { orgId })
      await repos.episodes.softDeleteMissing(novelId, episodeRows.map((e) => e.logicalKey), { orgId })

      allExceptions.push(
        ...finals.flatMap(({ group, planned }) =>
          planned.exceptions.map((e) => ({ ...e, seasonNo: group.seasonNo }))
        )
      )
      seasonsCount = seasonRows.length
      episodesCount = episodeRows.length

      await persistPlanArtifacts(novelId, cleanedHash, { seasons: seasonsCount, episodes: episodesCount }, orgId, repos)
    },
    { orgId }
  )

  await updateNovelProject(novelId, {
    counts: { ...project.counts, seasons: seasonsCount, episodes: episodesCount },
  })
  if (opts.advanceTo && stageIndex(String(opts.advanceTo)) > stageIndex('series')) {
    await updateNovelProject(novelId, { stage: String(opts.advanceTo) })
  }

  const buckets = durationBuckets(finals.flatMap((f) => f.planned.episodes))
  logger.info(
    `分季分集完成（PG）：${seasonsCount} 季 / ${episodesCount} 集，` +
      `85–95s 命中 ${buckets.inRange}（${((buckets.inRange / Math.max(1, buckets.total)) * 100).toFixed(2)}%），` +
      `provider=${provider}`
  )
  return {
    seasons: seasonsCount,
    episodes: episodesCount,
    episodesPerSeason,
    episodeSeconds,
    charsPerSecond,
    tolerance,
    provider,
    buckets,
    exceptions: allExceptions.length,
    exceptionSamples: allExceptions.slice(0, 10),
  }
}

/**
 * 规划整本：章节 → 季 → 集。
 */
export async function planSeries(novelId, opts = {}) {
  const episodeSeconds = Number(opts.episodeSeconds) || DEFAULT_EPISODE_SECONDS
  const episodesPerSeason = Number(opts.episodesPerSeason) || DEFAULT_EPISODES_PER_SEASON
  const charsPerSecond = Number(opts.charsPerSecond) || DEFAULT_CHARS_PER_SECOND
  const tolerance = Number.isFinite(Number(opts.tolerance)) ? Number(opts.tolerance) : DEFAULT_TOLERANCE_SECONDS
  const maxChapters = opts.maxChapters && opts.maxChapters > 0 ? Number(opts.maxChapters) : Infinity

  const project = await getNovelProjectAsync(novelId)
  const locked = stageIndex(project.stage) > stageIndex('series')
  if (locked && !opts.force) assertEditable(project, 'series')
  if (locked && opts.force) await updateNovelProject(novelId, { stage: 'series' })

  const cleanedText = readCleanedText(novelId)
  if (!cleanedText) throw new Error('缺少 source/cleaned.txt，请先 ingest')

  let chunks = await listChunksAsync(novelId)
  if (maxChapters !== Infinity) chunks = chunks.slice(0, maxChapters)
  if (!chunks.length) throw new Error('尚未摄取正文，请先 ingest')
  chunks = await ensureChunkOffsets(novelId, chunks, cleanedText)

  const cleanedHash = hashText(cleanedText)

  return planSeriesPg({
    novelId,
    project,
    chunks,
    cleanedText,
    cleanedHash,
    episodeSeconds,
    episodesPerSeason,
    charsPerSecond,
    tolerance,
    opts,
  })
}

/** 估算章节/季/集规模（PostgreSQL）。 */
export async function seriesEstimateAsync(novelId, opts = {}) {
  const chunks = await listChunksAsync(novelId)
  const repos = getNovelWriteRepositories()
  const orgId = config.novels.orgId
  const eps = await repos.episodes.list(novelId, { orgId })
  const seasons = await repos.seasons.list(novelId, { orgId })
  const totalChars = chunks.reduce((a, c) => a + (c.wordCount || (c.text || '').length), 0)
  const plannedSeconds = eps.reduce((a, e) => a + (e.targetSeconds || DEFAULT_EPISODE_SECONDS), 0)
  const charsPerSecond = opts.charsPerSecond || DEFAULT_CHARS_PER_SECOND
  const episodeSeconds = opts.episodeSeconds || DEFAULT_EPISODE_SECONDS
  const supportSeconds = {}
  for (const cps of [4, 4.5, 5]) supportSeconds[cps] = Math.round(totalChars / cps)
  return {
    chapters: chunks.length,
    totalChars,
    seasons: seasons.length,
    episodes: eps.length,
    episodeSeconds,
    charsPerSecond,
    plannedSeconds,
    supportSeconds,
    supportEpisodes: Math.round(totalChars / charsPerSecond / episodeSeconds),
  }
}

/** 兼容旧路由命名：实现只剩 PostgreSQL 异步路径。 */
export const seriesEstimateOrAsync = seriesEstimateAsync

export async function checkConsistencyAsync(novelId) {
  const names = (await listCharactersAsync(novelId)).map((c) => c.name).filter(Boolean)
  const repos = getNovelWriteRepositories()
  const orgId = config.novels.orgId
  // 只取一次正文，避免 8000+ 集逐集查 PG
  const source = await repos.sources.get(novelId, { orgId })
  const episodes = await repos.episodes.list(novelId, { orgId })
  let withKnown = 0
  const emptyEpisodes = []
  for (const ep of episodes) {
    const text =
      source?.cleanedText && ep.startOffset !== null && ep.startOffset !== undefined
        ? source.cleanedText.slice(ep.startOffset, ep.endOffset)
        : await getEpisodeTextAsync(novelId, ep)
    const hit = names.some((n) => text.includes(n))
    if (hit) withKnown++
    else emptyEpisodes.push(ep.id)
  }
  return {
    characters: names.length,
    episodes: episodes.length,
    episodesWithKnownCharacter: withKnown,
    episodesWithoutKnownCharacter: emptyEpisodes.length,
  }
}

/** 兼容旧路由命名：实现只剩 PostgreSQL 异步路径。 */
export const checkConsistencyOrAsync = checkConsistencyAsync

/** 兼容旧导入：季/集列表直连 PostgreSQL（异步）。 */
export { listSeasons, listEpisodes } from './novelEpisodeStore.js'
