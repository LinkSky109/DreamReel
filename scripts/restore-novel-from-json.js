#!/usr/bin/env node
/**
 * 从 JSON 恢复某部小说的 PostgreSQL 数据（灾难恢复）。
 *
 * 用法：
 *   node scripts/restore-novel-from-json.js --novel <novelId> [--org default] [--from <archive>]
 *
 * 步骤：
 *   1. 确保 organizations 存在
 *   2. upsert novels 项目
 *   3. upsert 角色/世界观/资产/状态/备选集合
 *   4. 调 backfill 恢复 novel_sources/chunks/seasons/episodes/plan
 *
 * 重要：不要删除 default 组织（会级联清空所有小说数据）。
 */
import 'dotenv/config'
import { spawnSync } from 'node:child_process'
import { getPool } from '../src/db/client.js'
import { applyNovelUpsert } from '../src/services/novelWriteSync.js'
import { applyChildUpsert } from '../src/services/novelChildWriteSync.js'
import { storageService } from '../src/services/storageService.js'
import { resolveNovelJsonSource } from './lib/novelJsonArchive.js'
import config from '../src/config/index.js'

const args = process.argv.slice(2)
const value = (n, fallback) => {
  const i = args.indexOf(`--${n}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}
const positional = args.find((a) => !a.startsWith('--'))
const novelId = value('novel', positional)
const orgId = value('org', config.novels.orgId)
if (!novelId) {
  console.error('用法: node scripts/restore-novel-from-json.js --novel <novelId> [--org default] [--from <archive>]')
  process.exit(1)
}

async function main() {
  const source = resolveNovelJsonSource(storageService, value('from', process.env.NOVEL_JSON_ARCHIVE), novelId)
  if (source.file) console.log(`JSON 来源：${source.file}`)
  const pool = await getPool()
  await pool.query(
    `INSERT INTO organizations (id, name, slug, plan)
     VALUES ($1, 'Default', 'default', 'free') ON CONFLICT (id) DO NOTHING`,
    [orgId]
  )

  const project = storageService.data.novelProjects?.[novelId]
  if (!project) throw new Error(`JSON 中不存在小说：${novelId}`)
  await applyNovelUpsert(pool, project, orgId)
  console.log(`项目已恢复：${project.title || novelId}`)

  const values = (key) => Object.values(storageService.data[key] || {}).filter((d) => d.novelId === novelId)
  const children = [
    ['characters', values('novelCharacters')],
    ['entities', values('novelWorldEntities')],
    ['assets', values('novelAssetImages')],
    ['states', values('novelCharacterStates')],
    ['characterSets', values('characterSets')],
    ['worldSets', values('worldSets')],
  ]
  for (const [kind, docs] of children) {
    for (const doc of docs) await applyChildUpsert(pool, kind, doc, orgId)
    console.log(`  ${kind}: ${docs.length}`)
  }

  // 正文/章节/季/集/规划产物
  const result = spawnSync(
    process.execPath,
    ['scripts/backfill-novel-write-model.js', '--novel', novelId],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ...(source.file ? { NOVEL_JSON_ARCHIVE: source.file } : {}),
      },
    }
  )
  if (result.status !== 0) throw new Error('backfill 失败')

  const counts = {}
  for (const table of ['novels', 'novel_sources', 'novel_chunks', 'seasons', 'episodes']) {
    const column = table === 'novels' ? 'id' : 'novel_id'
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM ${table} WHERE ${column} = $1`,
      [novelId]
    )
    counts[table] = rows[0].n
  }
  console.log('恢复完成：', counts)
}

main().catch((error) => {
  console.error(`恢复失败：${error.message}`)
  process.exit(1)
})
