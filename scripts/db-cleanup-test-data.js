#!/usr/bin/env node
/**
 * 清理开发库中的测试残留（默认 dry-run）。
 *
 *   node scripts/db-cleanup-test-data.js
 *   node scripts/db-cleanup-test-data.js --apply
 *
 * 识别规则（只针对明确的测试痕迹）：
 * - novels.id = 'n-sync-1'（双写测试固定 id）
 * - novels.payload.dir 指向 storage/test-run/...
 * - 测试 org 前缀 / 固定测试 org
 *
 * 不删除 default org，也不删除无法确认来源的数据。
 */
import 'dotenv/config'
import pg from 'pg'
import config from '../src/config/index.js'

const apply = process.argv.includes('--apply')
const TEST_NOVEL_IDS = ['n-sync-1']
const TEST_ORGS = ['org_x']
const TEST_ORG_PATTERN = '^(org_child_write_|org_pg_test_|org_outbox_|org_test_)'

if (!config.db.url) {
  console.error('[cleanup] DATABASE_URL 未配置')
  process.exit(1)
}

const client = new pg.Client({ connectionString: config.db.url })
await client.connect()

const novelFilter = `(id = ANY($1::text[]) OR payload->>'dir' LIKE '%/test-run/%')`
const orgFilter = `(id = ANY($1::text[]) OR id ~ $2)`

try {
  await client.query('BEGIN')

  const novels = await client.query(
    `SELECT id, title, org_id, payload->>'dir' AS dir FROM novels
      WHERE ${novelFilter}
      ORDER BY id`,
    [TEST_NOVEL_IDS]
  )

  const orgs = await client.query(
    `SELECT id FROM organizations WHERE ${orgFilter} ORDER BY id`,
    [TEST_ORGS, TEST_ORG_PATTERN]
  )



  console.log(`[cleanup] mode=${apply ? 'APPLY' : 'DRY-RUN'}`)
  console.log(`[cleanup] novels=${novels.rowCount}`)
  for (const row of novels.rows) console.log(`  - ${row.id}  ${row.title}  org=${row.org_id}  dir=${row.dir || '-'}`)
  console.log(`[cleanup] organizations=${orgs.rowCount}`)
  for (const row of orgs.rows) console.log(`  - ${row.id}`)

  if (!apply) {
    await client.query('ROLLBACK')
    console.log('[cleanup] dry-run 结束，未修改数据；加 --apply 执行')
  } else {


  // novels 的子表都有 ON DELETE CASCADE
  const deletedNovels = await client.query(
    `DELETE FROM novels WHERE ${novelFilter}`,
    [TEST_NOVEL_IDS]
  )

  const deletedOrgs = await client.query(
    `DELETE FROM organizations WHERE ${orgFilter}`,
    [TEST_ORGS, TEST_ORG_PATTERN]
  )

  await client.query('COMMIT')
  console.log(
    `[cleanup] 完成：novels=${deletedNovels.rowCount} organizations=${deletedOrgs.rowCount}`
  )
  }
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  console.error('[cleanup] 失败：', error.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
