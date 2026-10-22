#!/usr/bin/env node
/**
 * 重建某部小说的分季分集（破坏性）。
 *
 * 用法：
 *   node scripts/rebuild-series.js --novel <novelId> [options]
 *
 * options:
 *   --provider <name>          显式 LLM provider（默认按项目/全局配置）
 *   --no-llm                   只用启发式分季
 *   --episodes-per-season <n>  每季最少集数（默认 200）
 *   --episode-seconds <n>      每集目标秒数（默认 90）
 *   --chars-per-second <n>     旁白语速（默认 4.5）
 *   --dry-run                  只打印计划，不写盘
 *   --purge                    归档改为直接删除
 *   --archive-media            同时归档旧图片/视频/音频
 *   --advance                  完成后把 stage 推进到 episodes
 *
 * 季/集直接写入 PostgreSQL（事务 + advisory lock），不再经过 db.json/outbox。
 * 步骤：归档旧产物 → 清理角色状态 → 重置 stage → 重新分季分集 → 校验。
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import config from '../src/config/index.js'
import {
  getNovelProject,
  updateNovelProject,
  novelDir,
  readCleanedText,
} from '../src/services/novelProjectService.js'
import { planSeries } from '../src/services/seriesPlannerService.js'
import { listChunksAsync } from '../src/services/novelAsyncReadService.js'
import { deleteChildStates } from '../src/services/novelChildStore.js'
import { listEpisodes, listSeasons } from '../src/services/novelEpisodeStore.js'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const value = (n, fallback) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const positional = args.find((a) => !a.startsWith('--'))
const novelId = value('novel', positional)

if (!novelId) {
  console.error('用法: node scripts/rebuild-series.js --novel <novelId> [--provider name] [--no-llm] [--dry-run] [--advance]')
  process.exit(1)
}

const dryRun = flag('dry-run')
const purge = flag('purge')
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const root = novelDir(novelId)
const archiveRoot = path.join(root, '_archive', stamp)
const storageRoot = path.resolve(config.storage.path)

function moveOrPurge(src, destRel) {
  if (!fs.existsSync(src)) return false
  if (purge) {
    fs.rmSync(src, { recursive: true, force: true })
    console.log(`  [purge] ${path.relative(root, src)}`)
    return true
  }
  const dest = path.join(archiveRoot, destRel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.renameSync(src, dest)
  console.log(`  [archive] ${path.relative(root, src)} → ${path.relative(root, dest)}`)
  return true
}

async function main() {
  const project = await getNovelProject(novelId)
  const cleaned = readCleanedText(novelId)
  const chapters = (await listChunksAsync(novelId)).length
  const oldEpisodes = (await listEpisodes(novelId)).length
  const oldSeasons = (await listSeasons(novelId)).length
  console.log(`作品：${project.title || ''}（${novelId}）`)
  console.log(`现状：章节 ${chapters}｜季 ${oldSeasons}｜集 ${oldEpisodes}｜cleaned ${cleaned.length} 字｜stage ${project.stage}`)

  if (dryRun) {
    console.log('dry-run：将执行')
    console.log(`  1) 归档/删除：episodes/、assets/、handoff/、plan/${flag('archive-media') ? '，以及 images/videos/audio 旧媒体' : ''}`)
    console.log('  2) 清理 novelCharacterStates（PG 软删）')
    console.log('  3) stage 重置为 series，重新分季分集（PG 事务）')
    console.log('  4) 输出验收报告')
    return
  }

  console.log('归档旧产物：')
  moveOrPurge(path.join(root, 'episodes'), 'episodes')
  moveOrPurge(path.join(root, 'assets'), 'assets')
  moveOrPurge(path.join(root, 'handoff'), 'handoff')
  // 旧同步台账引用旧 episodes/*.txt；归档以强制下次全量同步
  moveOrPurge(path.join(root, 'sync'), 'sync')
  if (flag('archive-media')) {
    moveOrPurge(path.join(storageRoot, 'images', 'novels', novelId), 'media/images')
    moveOrPurge(path.join(storageRoot, 'videos', 'novels', novelId), 'media/videos')
    moveOrPurge(path.join(storageRoot, 'audio', 'voices', 'novels', novelId), 'media/audio')
  }

  const removedStates = await deleteChildStates(novelId)
  console.log(`清理角色状态：${removedStates} 条`)
  await updateNovelProject(novelId, { stage: 'series' })

  const result = await planSeries(novelId, {
    force: true,
    cleanupFiles: false,
    useLLM: flag('no-llm') ? false : true,
    forceSeasons: flag('force-seasons'),
    provider: value('provider', undefined),
    episodesPerSeason: Number(value('episodes-per-season', 200)) || 200,
    episodeSeconds: Number(value('episode-seconds', 90)) || 90,
    charsPerSecond: Number(value('chars-per-second', 4.5)) || 4.5,
    advanceTo: flag('advance') ? 'episodes' : undefined,
  })

  console.log('重建完成：')
  console.log(JSON.stringify(result, null, 2))

  const { spawnSync } = await import('node:child_process')
  const verify = spawnSync(process.execPath, ['scripts/verify-series.js', novelId], { stdio: 'inherit' })
  if (verify.status !== 0) console.warn('验收脚本返回非 0，请检查报告')
}

main().catch((error) => {
  console.error(`重建失败：${error.message}`)
  process.exit(1)
})
