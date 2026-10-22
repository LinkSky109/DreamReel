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
 *   --sync-pg                  重建后直接同步 PostgreSQL（绕过 outbox 等待）
 *   --advance                  完成后把 stage 推进到 episodes
 *   --force                    跳过「服务运行中」检查（危险：内存旧数据可能覆盖重建结果）
 *
 * 重要：重建前必须停止 Web 服务。运行中的服务会把内存里的旧数据写回 db.json，
 * 导致 JSON 与 PostgreSQL 不一致（表现为前端列表能打开、但按集 ID 操作报 episode not found）。
 *
 * 步骤：备份 db.json → 归档旧产物 → 清理角色状态 → 重置 stage → 重新分季分集 → 校验。
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import net from 'node:net'
import config from '../src/config/index.js'
import { storageService } from '../src/services/storageService.js'
import {
  getNovelProject,
  updateNovelProject,
  novelDir,
  readCleanedText,
} from '../src/services/novelProjectService.js'
import { planSeries } from '../src/services/seriesPlannerService.js'
import { getNovelProjectAsync, listChunksAsync } from '../src/services/novelAsyncReadService.js'
import { novelChildMirror } from '../src/services/novelChildWriteSync.js'
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
  console.error('用法: node scripts/rebuild-series.js --novel <novelId> [--provider name] [--no-llm] [--dry-run] [--sync-pg] [--advance]')
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

function backupDb() {
  const dbPath = path.join(storageRoot, 'data', 'db.json')
  if (!fs.existsSync(dbPath)) return
  const dest = path.join(storageRoot, 'data', `db.backup-${Date.now()}.json`)
  fs.copyFileSync(dbPath, dest)
  console.log(`备份 db.json → ${path.relative(process.cwd(), dest)}`)
}

async function syncPostgres() {
  const { getPool } = await import('../src/db/client.js')
  const { applyChildDeleteByNovel, applyChildUpsert } = await import('../src/services/novelChildWriteSync.js')
  const { applyNovelUpsert } = await import('../src/services/novelWriteSync.js')
  const pool = await getPool()
  const orgId = config.novels.orgId
  console.log('同步 PostgreSQL：清空旧 seasons/episodes 后写入新数据…')
  await applyNovelUpsert(pool, getNovelProject(novelId), orgId)
  // seasons 的唯一键 (novel_id, season_no) 不区分 deleted_at；重建必须硬删旧季/集
  await pool.query('DELETE FROM episodes WHERE novel_id = $1 AND org_id = $2', [novelId, orgId])
  await pool.query('DELETE FROM seasons WHERE novel_id = $1 AND org_id = $2', [novelId, orgId])
  for (const c of storageService.listNovelChunks(novelId)) await applyChildUpsert(pool, 'chunks', c, orgId)
  for (const s of storageService.listSeasons(novelId)) await applyChildUpsert(pool, 'seasons', s, orgId)
  for (const e of storageService.listEpisodes(novelId)) await applyChildUpsert(pool, 'episodes', e, orgId)
  console.log('PostgreSQL 同步完成')
}

function isPortInUse(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' })
    const done = (value) => {
      socket.destroy()
      resolve(value)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(800, () => done(false))
  })
}

async function main() {
  if (!flag('force') && (await isPortInUse(config.port))) {
    throw new Error(
      `检测到服务正在运行（端口 ${config.port}）。请先停止服务再重建；` +
        '否则服务内存中的旧数据会在稍后覆盖 db.json，导致 JSON 与 PostgreSQL 不一致。'
    )
  }
  const project = await getNovelProjectAsync(novelId)
  const cleaned = readCleanedText(novelId)
  const chapters = (await listChunksAsync(novelId)).length
  const oldEpisodes = (await listEpisodes(novelId)).length
  const oldSeasons = (await listSeasons(novelId)).length
  console.log(`作品：${project.title || ''}（${novelId}）`)
  console.log(`现状：章节 ${chapters}｜季 ${oldSeasons}｜集 ${oldEpisodes}｜cleaned ${cleaned.length} 字｜stage ${project.stage}`)

  if (dryRun) {
    console.log('dry-run：将执行')
    console.log('  1) 备份 db.json')
    console.log(`  2) 归档/删除：episodes/、assets/、handoff/、plan/${flag('archive-media') ? '，以及 images/videos/audio 旧媒体' : ''}`)
    console.log('  3) 清理 novelCharacterStates')
    console.log('  4) stage 重置为 series，重新分季分集')
    console.log('  5) 输出验收报告')
    return
  }

  backupDb()

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

  storageService._flush()
  await novelChildMirror.flush()
  if (flag('sync-pg')) {
    if (config.novels.writeMode === 'postgres') {
      console.log('PG 写模式：planSeries 直接写 PostgreSQL，跳过 syncPostgres')
    } else {
      await syncPostgres()
    }
  }

  console.log('重建完成：')
  console.log(JSON.stringify(result, null, 2))

  const { spawnSync } = await import('node:child_process')
  const verify = spawnSync(process.execPath, ['scripts/verify-series.js', novelId], { stdio: 'inherit' })
  if (verify.status !== 0) console.warn('验收脚本返回非 0，请检查报告')
  if (config.outbox.enabled && !flag('sync-pg')) {
    console.log('提示：OUTBOX_ENABLED=true，PostgreSQL 由 outbox worker 异步同步；如需立即一致请加 --sync-pg')
  }
}

main().catch((error) => {
  console.error(`重建失败：${error.message}`)
  process.exit(1)
})
