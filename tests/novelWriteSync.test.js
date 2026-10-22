import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { applyNovelUpsert, applyNovelDelete } from '../src/services/novelWriteSync.js'
import { getPool, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL

const doc = {
  id: 'n-sync-1',
  title: '写工具测试',
  status: 'extracted',
  stage: 'episodes',
  counts: { chapters: 2, characters: 3 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

/**
 * legacy/dual 镜像类已随写模式删除；
 * 保留的 PG 工具函数直接对 PostgreSQL 生效，测试也只覆盖 PG 契约。
 */
describe('novelWriteSync · PostgreSQL apply 工具', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_write_test_${Date.now()}`
  const id = `${orgId}-novel`

  before(async () => {
    await getPool().query(
      'INSERT INTO organizations (id, name, slug, plan) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [orgId, '写测试', orgId, 'free']
    )
  })

  after(async () => {
    await getPool().query('DELETE FROM organizations WHERE id = $1', [orgId])
    await closeDb()
  })

  it('upsert 写入列与 payload，删除写软删时间', async () => {
    const pool = await getPool()
    await applyNovelUpsert(pool, { ...doc, id }, orgId)
    const row = await pool.query('SELECT title, status, org_id, payload, deleted_at FROM novels WHERE id=$1', [id])
    assert.equal(row.rows[0].title, '写工具测试')
    assert.equal(row.rows[0].status, 'extracted')
    assert.equal(row.rows[0].org_id, orgId)
    assert.deepEqual(row.rows[0].payload.counts, { chapters: 2, characters: 3 })
    assert.equal(row.rows[0].payload.stage, 'episodes')
    assert.equal(row.rows[0].payload.createdAt, undefined)
    assert.equal(row.rows[0].deleted_at, null)

    await applyNovelDelete(pool, id, orgId)
    const deleted = await pool.query('SELECT deleted_at, version FROM novels WHERE id=$1', [id])
    assert.ok(deleted.rows[0].deleted_at)
    assert.ok(deleted.rows[0].version >= 2)
  })

  it('upsert 幂等：同 id 再写只递增版本，不新增行', async () => {
    const pool = await getPool()
    await applyNovelUpsert(pool, { ...doc, id, title: '写工具测试·改' }, orgId)
    const rows = await pool.query('SELECT title, version FROM novels WHERE id=$1', [id])
    assert.equal(rows.rows.length, 1)
    assert.equal(rows.rows[0].title, '写工具测试·改')
    assert.ok(rows.rows[0].version >= 3)
  })

  it('删除后再 upsert 会清除 deleted_at', async () => {
    const pool = await getPool()
    await applyNovelUpsert(pool, { ...doc, id }, orgId)
    const rows = await pool.query('SELECT deleted_at FROM novels WHERE id=$1', [id])
    assert.equal(rows.rows[0].deleted_at, null)
  })
})
