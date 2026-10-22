import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createNovelWriteSync } from '../src/services/novelWriteSync.js'
import { getPool, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL

function loggerStub() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

function fakePool(handler) {
  const calls = []
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params })
      if (handler) return handler(sql, params)
      return { rows: [] }
    },
  }
}

const doc = {
  id: 'n-sync-1',
  title: '双写测试',
  status: 'extracted',
  stage: 'episodes',
  counts: { chapters: 2, characters: 3 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
}

describe('novelWriteSync', () => {
  it('legacy：不连接数据库', async () => {
    const sync = createNovelWriteSync({
      mode: 'legacy',
      getPool: () => {
        throw new Error('should not be called')
      },
    })
    assert.equal(sync.enabled, false)
    assert.deepEqual(await sync.upsert(doc), { skipped: true })
    sync.scheduleUpsert(doc)
    sync.scheduleDelete(doc.id)
  })

  it('dual：upsert 写入正确参数', async () => {
    const pool = fakePool()
    const sync = createNovelWriteSync({ mode: 'dual', getPool: async () => pool, orgId: 'org_x' })
    assert.equal(sync.enabled, true)
    await sync.upsert(doc)
    assert.equal(pool.calls.length, 1)
    const { sql, params } = pool.calls[0]
    assert.match(sql, /ON CONFLICT \(id\) DO UPDATE/)
    assert.equal(params[0], doc.id)
    assert.equal(params[1], 'org_x')
    assert.equal(params[3], '双写测试')
    const payload = JSON.parse(params[5])
    assert.deepEqual(payload.counts, { chapters: 2, characters: 3 })
    assert.equal(payload.stage, 'episodes')
    assert.equal(payload.createdAt, undefined)
  })

  it('dual：镜像失败只告警，不影响调用方', async () => {
    const log = loggerStub()
    const sync = createNovelWriteSync({
      mode: 'dual',
      getPool: async () => ({
        query: async () => {
          throw new Error('pg down')
        },
      }),
      log,
    })
    sync.scheduleUpsert(doc)
    await new Promise((resolve) => setTimeout(resolve, 20))
    assert.equal(log.warnings.length, 1)
    assert.match(log.warnings[0][0], /镜像写入失败/)
    assert.equal(log.warnings[0][1].id, doc.id)
  })

  it('dual：删除写入软删除时间', async () => {
    const pool = fakePool()
    const sync = createNovelWriteSync({ mode: 'dual', getPool: async () => pool })
    await sync.softDelete(doc.id)
    assert.equal(pool.calls.length, 1)
    assert.match(pool.calls[0].sql, /SET deleted_at/)
    assert.equal(pool.calls[0].params[0], doc.id)
  })

  it('postgres：过渡期项目/其他域仍镜像 PG', async () => {
    const sync = createNovelWriteSync({ mode: 'postgres', getPool: () => { throw new Error('no') } })
    assert.equal(sync.enabled, true)
  })
})

describe('novelWriteSync · 真实 PostgreSQL', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_write_test_${Date.now()}`
  const id = 'novel-write-test-1'

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

  it('upsert → 查询 → 软删除', async () => {
    const sync = createNovelWriteSync({ mode: 'dual', getPool, orgId })
    await sync.upsert({ ...doc, id })
    const row = await getPool().query('SELECT title, status, payload, deleted_at FROM novels WHERE id=$1', [id])
    assert.equal(row.rows[0].title, '双写测试')
    assert.equal(row.rows[0].status, 'extracted')
    assert.deepEqual(row.rows[0].payload.counts, { chapters: 2, characters: 3 })
    assert.equal(row.rows[0].deleted_at, null)

    await sync.softDelete(id)
    const deleted = await getPool().query('SELECT deleted_at FROM novels WHERE id=$1', [id])
    assert.ok(deleted.rows[0].deleted_at)
  })
})
