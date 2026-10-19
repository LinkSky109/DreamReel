#!/usr/bin/env node
/**
 * 批量补齐「角色形象状态」（按集顺序，保证时间线连续）。
 *
 * 只处理已有剧本的集（--all 可含未生成剧本的集）。
 * 已存在该集状态的会跳过（可续跑）。
 *
 * 用法：
 *   node scripts/backfill-character-states.js <novelId>
 *   node scripts/backfill-character-states.js <novelId> --limit 20
 *   node scripts/backfill-character-states.js <novelId> --all
 *   node scripts/backfill-character-states.js <novelId> --dry
 */
import 'dotenv/config'
import { storageService } from '../src/services/storageService.js'
import { getNovelProject } from '../src/services/novelProjectService.js'
import { generateEpisodeStates, listStates } from '../src/services/characterGrowthService.js'

const args = process.argv.slice(2)
const novelId = args.find((a) => !a.startsWith('--'))
const flag = (n) => args.includes(`--${n}`)
const limitArg = args.indexOf('--limit')
const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : Infinity
const includeAll = flag('all')
const retryFallback = flag('retry-fallback')
const dryRun = flag('dry')

if (!novelId) {
  console.error('用法: node scripts/backfill-character-states.js <novelId> [--limit N] [--all] [--dry]')
  process.exit(1)
}

getNovelProject(novelId)

const all = storageService.listEpisodes(novelId).sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))

// --retry-fallback：只重跑含「回退状态」的集，把它们升级为 LLM 结果
const fallbackEps = new Set(
  storageService
    .listNovelCharacterStates(novelId)
    .filter((s) => s.source !== 'llm')
    .map((s) => Number(s.episodeNo))
)

let candidates = includeAll ? all : all.filter((e) => e.screenplay && (e.screenplay.shots || []).length)
if (retryFallback) candidates = candidates.filter((e) => fallbackEps.has(Number(e.episodeNo ?? (e.chapterIndex ?? 0) + 1)))
const target = candidates.slice(0, limit)
console.log(
  `作品 ${novelId}：候选 ${target.length} 集（共 ${all.length} 集）${retryFallback ? `｜重跑回退集 ${fallbackEps.size} 集` : ''}${dryRun ? '（dry-run）' : ''}`
)

const hasState = (episodeNo) =>
  storageService.listNovelCharacterStates(novelId).some((s) => Number(s.episodeNo) === Number(episodeNo))

let done = 0
let skipped = 0
let failed = 0
let created = 0
const t0 = Date.now()

for (const ep of target) {
  const episodeNo = Number(ep.episodeNo ?? (ep.chapterIndex ?? 0) + 1)
  if (!retryFallback && hasState(episodeNo)) {
    skipped += 1
    continue
  }
  if (dryRun) {
    console.log(`- 待生成 第${episodeNo}集 ${ep.title || ''}`)
    done += 1
    continue
  }
  try {
    const saved = await generateEpisodeStates(novelId, ep.id, {})
    created += saved.length
    done += 1
    if (done % 10 === 0 || done === target.length) {
      const mins = ((Date.now() - t0) / 60000).toFixed(1)
      console.log(`进度 ${done}/${target.length}（跳过 ${skipped}，失败 ${failed}，状态 ${created}）已用 ${mins} 分钟`)
    }
  } catch (error) {
    failed += 1
    console.warn(`第${episodeNo}集失败：${error.message}`)
  }
}

// 确保落盘
storageService._flush()
console.log(`完成：处理 ${done} 集，跳过 ${skipped}，失败 ${failed}，写入状态 ${created} 条`)
const tl = storageService.listNovelCharacterStates(novelId).length
console.log(`当前累计状态记录：${tl}`)
void listStates
