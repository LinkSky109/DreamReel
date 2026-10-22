#!/usr/bin/env node
/**
 * novels 数据迁移：storage/data/db.json → PostgreSQL novels 表
 *
 *   node scripts/migrate-novels-to-pg.js --dry-run
 *   node scripts/migrate-novels-to-pg.js
 *   node scripts/migrate-novels-to-pg.js --verify
 *
 * 幂等：按 id upsert；重复执行只更新内容并递增 version。
 */
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import pg from 'pg'
import config from '../src/config/index.js'
import { toNovelPayload } from '../src/repositories/novelRepository.js'
import { stableStringify } from '../src/utils/stableJson.js'
import { findLatestNovelArchive, loadNovelArchive } from './lib/novelJsonArchive.js'

const { Client } = pg
const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const verifyOnly = args.has('--verify')
const orgId = config.novels.orgId
const dbPath = path.resolve(config.storage.path, 'data', 'db.json')

/**
 * 解析小说来源（可注入，便于纯函数测试）：
 * - 优先 db.json 的 novelProjects（旧格式仍可能保留）；
 * - 为空则回退到 storage/archive/novels-from-db-*.json 最新归档（PG 单源后 db.json 已清空）；
 * - 两边都没有小说时报明确错误，避免 verify 误报 0。
 * @returns {{source: string, novels: object[]}}
 */
export function loadNovelSource({
  dbFile = dbPath,
  findLatest = findLatestNovelArchive,
  loadArchive = loadNovelArchive,
} = {}) {
  let data = {}
  if (fs.existsSync(dbFile)) {
    data = JSON.parse(fs.readFileSync(dbFile, 'utf8'))
  }
  const inline = Object.values(data.novelProjects || {})
  if (inline.length) return { source: dbFile, novels: inline }

  const archiveFile = findLatest()
  if (!archiveFile) {
    throw new Error(
      `db.json 无小说集合，且找不到归档：${dbFile}（storage/archive/novels-from-db-*.json）`
    )
  }
  const archive = loadArchive(archiveFile)
  const novels = Object.values(archive?.collections?.novelProjects || {})
  if (!novels.length) throw new Error(`归档中没有小说集合：${archiveFile}`)
  return { source: archiveFile, novels }
}

function toRow(doc) {
  const now = new Date()
  return {
    id: doc.id,
    orgId,
    ownerId: doc.ownerId || null,
    title: doc.title || '',
    status: doc.status || 'draft',
    payload: JSON.stringify(toNovelPayload(doc)),
    createdAt: doc.createdAt ? new Date(doc.createdAt) : now,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : now,
    deletedAt: doc.deletedAt ? new Date(doc.deletedAt) : null,
  }
}

async function main() {
  if (!config.db.url) throw new Error('DATABASE_URL 未配置')
  const { source, novels } = loadNovelSource()
  console.log(`source: ${source}`)
  console.log(`novels: ${novels.length}, org: ${orgId}`)
  if (dryRun) {
    for (const doc of novels) console.log(`  [dry] ${doc.id}  ${doc.title}  stage=${doc.stage || '-'}`)
    return
  }

  const client = new Client({ connectionString: config.db.url })
  await client.connect()
  try {
    // verify 模式只读：不写入 organizations / novels。
    if (!verifyOnly) {
      await client.query(
        `INSERT INTO organizations (id, name, slug, plan)
         VALUES ($1, $2, $3, 'free')
         ON CONFLICT (id) DO NOTHING`,
        [orgId, 'Default Organization', orgId]
      )

      let inserted = 0
      let updated = 0
      for (const doc of novels) {
        const row = toRow(doc)
        const result = await client.query(
          `INSERT INTO novels (id, org_id, owner_id, title, status, payload, created_at, updated_at, deleted_at, version)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1)
           ON CONFLICT (id) DO UPDATE SET
             owner_id = EXCLUDED.owner_id,
             title = EXCLUDED.title,
             status = EXCLUDED.status,
             payload = EXCLUDED.payload,
             updated_at = EXCLUDED.updated_at,
             deleted_at = EXCLUDED.deleted_at,
             version = novels.version + 1
           RETURNING (xmax = 0) AS is_insert`,
          [row.id, row.orgId, row.ownerId, row.title, row.status, row.payload, row.createdAt, row.updatedAt, row.deletedAt]
        )
        if (result.rows[0]?.is_insert) inserted += 1
        else updated += 1
      }
      console.log(`done: inserted=${inserted} updated=${updated}`)
    }

    const { rows } = await client.query(
      'SELECT id, title, status, payload FROM novels WHERE org_id = $1 ORDER BY id',
      [orgId]
    )
    const pgMap = new Map(rows.map((r) => [r.id, r]))
    const sourceIds = new Set(novels.map((doc) => doc.id))
    const mismatches = []
    for (const doc of novels) {
      const row = pgMap.get(doc.id)
      if (!row) {
        mismatches.push(`${doc.id}: missing in postgres`)
        continue
      }
      if ((row.title || '') !== (doc.title || '')) {
        mismatches.push(`${doc.id}: title '${doc.title}' != '${row.title}'`)
      }
      const payload = row.payload || {}
      if (stableStringify(payload) !== stableStringify(toNovelPayload(doc))) {
        mismatches.push(`${doc.id}: payload mismatch`)
      }
    }
    // 双向校验：PostgreSQL 多出的行同样算差异，避免测试残留被单向比对掩盖。
    for (const row of rows) {
      if (!sourceIds.has(row.id)) {
        mismatches.push(`${row.id}: exists in postgres but not in source`)
      }
    }
    console.log(`verify: postgres=${rows.length} source=${novels.length} mismatches=${mismatches.length}`)
    for (const item of mismatches.slice(0, 20)) console.log(`  ! ${item}`)
    if (mismatches.length) process.exitCode = 1
  } finally {
    await client.end()
  }
}

// 仅在作为 CLI 直接运行时执行，便于测试导入 loadNovelSource 纯函数。
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  main().catch((error) => {
    console.error('[migrate-novels]', error.message)
    process.exit(1)
  })
}
