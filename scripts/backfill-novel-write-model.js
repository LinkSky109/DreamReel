#!/usr/bin/env node
/**
 * Phase 2：把现有 JSON 小说数据回填到 PostgreSQL 新写模型（不切换运行时写路径）。
 *
 * 用法：
 *   node scripts/backfill-novel-write-model.js --novel <novelId> [--dry-run]
 *
 * 回填：
 *   - novel_sources.cleaned_text（来自 source/cleaned.txt）
 *   - novel_chunks 的 chapter_title / start_offset / end_offset / cleaned_hash / word_count
 *   - seasons 的 arc_name / goal / acts / ending_hook / estimated_episodes / plan_provider / chapter_range
 *   - episodes 的 chapter_range / offsets / estimated_seconds / outline / screenplay / logical_key 等
 *   - novel_plan_runs / novel_plan_artifacts（来自 plan/*.json）
 *
 * 安全：
 *   - 整个回填在一个事务内；任一 ID 不一致立即回滚。
 *   - 不修改 JSON，不切换写路径。
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import config from '../src/config/index.js'
import { storageService } from '../src/services/storageService.js'
import { getChunkText, readCleanedText, novelDir } from '../src/services/novelProjectService.js'
import { resolveNovelJsonSource } from './lib/novelJsonArchive.js'
import { withNovelTransaction, getNovelWriteRepositories } from '../src/repositories/unitOfWork.js'
import { hashText, locateChapters } from '../src/utils/textOffsets.js'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const value = (n, fallback) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const positional = args.find((a) => !a.startsWith('--'))
const novelId = value('novel', positional)
if (!novelId) {
  console.error('用法: node scripts/backfill-novel-write-model.js --novel <novelId> [--dry-run]')
  process.exit(1)
}
const dryRun = flag('dry-run')
const orgId = config.novels.orgId

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

async function main() {
  const jsonSource = resolveNovelJsonSource(storageService, process.env.NOVEL_JSON_ARCHIVE, novelId)
  if (jsonSource.file) console.log(`JSON 来源：${jsonSource.file}`)
  const project = storageService.data.novelProjects?.[novelId]
  if (!project) throw new Error(`JSON/归档中不存在小说：${novelId}`)
  const cleaned = readCleanedText(novelId)
  if (!cleaned) throw new Error('缺少 source/cleaned.txt')
  const cleanedHash = hashText(cleaned)

  let chunks = Object.values(storageService.data.novelChunks || {})
    .filter((c) => c.novelId === novelId)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((c) => ({ ...c, text: c.text || getChunkText(novelId, c) }))
  if (chunks.some((c) => c.startOffset === null || c.startOffset === undefined)) {
    chunks = locateChapters(cleaned, chunks.map((c) => ({ ...c, text: c.text || '' })))
  }
  const seasons = Object.values(storageService.data.seriesSeasons || {})
    .filter((s) => s.novelId === novelId)
    .sort((a, b) => a.seasonNo - b.seasonNo)
  const episodes = Object.values(storageService.data.seriesEpisodes || {})
    .filter((e) => e.novelId === novelId)
    .sort((a, b) => a.episodeNo - b.episodeNo)
  const seasonNoById = new Map(seasons.map((s) => [s.id, s.seasonNo]))

  const planDir = path.join(novelDir(novelId), 'plan')
  const planFiles = {
    'chapter-summaries': 'chapter-summaries.json',
    arcs: 'arcs.json',
    seasons: 'seasons.json',
    exceptions: 'exceptions.json',
  }
  const artifacts = {}
  for (const [kind, file] of Object.entries(planFiles)) {
    const data = readJson(path.join(planDir, file))
    if (data) artifacts[kind] = data
  }

  console.log(`作品：${project.title || ''}（${novelId}）`)
  console.log(`JSON：chunks ${chunks.length}｜seasons ${seasons.length}｜episodes ${episodes.length}｜cleaned ${cleaned.length} 字｜hash ${cleanedHash}`)
  if (dryRun) {
    console.log('dry-run：将回填 novel_sources / chunks / seasons / episodes / plan artifacts')
    return
  }

  await withNovelTransaction(
    novelId,
    async (repos) => {
      await repos.sources.upsert(
        novelId,
        {
          sourceType: project.sourceType || 'text',
          sourceRef: project.sourceRef || '',
          cleanedText: cleaned,
          cleanedHash,
          encoding: 'utf-8',
          wordCount: cleaned.length,
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

      const seasonRows = seasons.map((s, i) => ({
        id: s.id,
        seasonNo: s.seasonNo,
        title: s.title,
        synopsis: s.synopsis,
        episodeCount: s.episodeCount,
        arcName: s.arcName,
        goal: s.goal,
        acts: s.acts,
        endingHook: s.endingHook,
        estimatedEpisodes: s.estimatedEpisodes,
        planProvider: s.planProvider,
        chapterStart: s.chapterStart,
        chapterEnd: s.chapterEnd,
        sortOrder: i,
      }))
      const seasonIdsByNo = await repos.seasons.upsertMany(novelId, seasonRows, { orgId })
      for (const row of seasonRows) {
        const pgId = seasonIdsByNo.get(row.seasonNo)
        if (pgId && pgId !== row.id) {
          throw new Error(`季 ID 不一致：seasonNo=${row.seasonNo} JSON=${row.id} PG=${pgId}`)
        }
      }

      const episodeRows = episodes.map((e, i) => {
        const seasonNo = seasonNoById.get(e.seasonId)
        return {
          id: e.id,
          seasonId: seasonIdsByNo.get(seasonNo) || e.seasonId || null,
          episodeNo: e.episodeNo,
          logicalKey: seasonNo != null ? `s${seasonNo}:e${e.episodeNo}` : `e${e.episodeNo}`,
          title: e.title,
          chapterTitle: e.chapterTitle,
          chapterStart: e.chapterStart,
          chapterEnd: e.chapterEnd,
          startOffset: e.startOffset,
          endOffset: e.endOffset,
          estimatedSeconds: e.estimatedSeconds,
          shortSource: e.shortSource,
          cleanedHash: e.cleanedHash || cleanedHash,
          outline: e.outline || null,
          screenplay: e.screenplay || null,
          targetSeconds: e.targetSeconds || 90,
          status: e.status || 'planned',
          sortOrder: i,
        }
      })
      const episodeIdsByKey = await repos.episodes.upsertMany(novelId, episodeRows, { orgId })
      for (const row of episodeRows) {
        const pgId = episodeIdsByKey.get(row.logicalKey)
        if (pgId && pgId !== row.id) {
          throw new Error(`集 ID 不一致：${row.logicalKey} JSON=${row.id} PG=${pgId}`)
        }
      }

      await repos.seasons.softDeleteMissing(novelId, seasonRows.map((s) => s.seasonNo), { orgId })
      await repos.episodes.softDeleteMissing(novelId, episodeRows.map((e) => e.logicalKey), { orgId })

      if (Object.keys(artifacts).length) {
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
        await repos.plans.finishRun(runId, {
          status: 'done',
          stats: { seasons: seasons.length, episodes: episodes.length },
        })
        console.log(`规划产物：run=${runId} kinds=${Object.keys(artifacts).join(',')}`)
      }
    },
    { orgId }
  )

  const repos = getNovelWriteRepositories()
  const [source, pgChunks, pgSeasons, pgEpisodes] = await Promise.all([
    repos.sources.get(novelId, { orgId }),
    repos.chunks.list(novelId, { orgId }),
    repos.seasons.list(novelId, { orgId }),
    repos.episodes.list(novelId, { orgId }),
  ])
  const latestPlan = await repos.plans.getLatest(novelId, { orgId })
  console.log('PG：')
  console.log(`  novel_sources：${source?.wordCount ?? 0} 字｜hash ${source?.cleanedHash || ''}`)
  console.log(`  chunks：${pgChunks.length}｜带偏移 ${pgChunks.filter((c) => c.startOffset != null).length}`)
  console.log(`  seasons：${pgSeasons.length}｜带弧线 ${pgSeasons.filter((s) => s.arcName).length}`)
  console.log(
    `  episodes：${pgEpisodes.length}｜带 logical_key ${pgEpisodes.filter((e) => e.logicalKey).length}｜带大纲 ${pgEpisodes.filter((e) => e.outline).length}｜带剧本 ${pgEpisodes.filter((e) => e.screenplay).length}`
  )
  if (latestPlan) console.log(`  plan run：${latestPlan.id}（${latestPlan.status}）`)
}

main().catch((error) => {
  console.error(`回填失败：${error.message}`)
  process.exit(1)
})
