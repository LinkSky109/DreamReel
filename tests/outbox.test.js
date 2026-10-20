import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { getPool, closeDb } from '../src/db/client.js'
import { claimBatch, markDone, markFailed, stats } from '../src/services/outboxStore.js'
import { applyEvent, runOutboxOnce } from '../src/workers/outboxWorker.js'

const DATABASE_URL = process.env.DATABASE_URL

describe('outbox · PostgreSQL', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_outbox_${Date.now()}`
  const novelId = `${orgId}-n1`

  before(async () => {
    await getPool().query(
      'INSERT INTO organizations (id,name,slug,plan) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [orgId, 'outbox 测试', orgId, 'free']
    )
  })

  after(async () => {
    await getPool().query('DELETE FROM outbox_events WHERE org_id = $1', [orgId])
    await getPool().query('DELETE FROM organizations WHERE id = $1', [orgId])
    await closeDb()
  })

  async function insert(event) {
    const eventId = event.eventId || crypto.randomUUID()
    await getPool().query(
      `INSERT INTO outbox_events (event_id, org_id, kind, op, payload)
       VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (event_id) DO NOTHING`,
      [eventId, orgId, event.kind, event.op, JSON.stringify(event.payload)]
    )
    return eventId
  }

  it('novel upsert 事件经 claim → apply → done', async () => {
    await insert({
      kind: 'novel',
      op: 'upsert',
      payload: { id: novelId, title: 'outbox 小说', status: 'draft', createdAt: '2026-01-01T00:00:00.000Z' },
    })
    const batch = await claimBatch(10, 'test-worker')
    assert.equal(batch.length, 1)
    const pool = await getPool()
    await applyEvent(pool, batch[0])
    await markDone(batch[0].id)
    const row = await pool.query('SELECT title FROM novels WHERE id=$1', [novelId])
    assert.equal(row.rows[0].title, 'outbox 小说')
    const status = await pool.query('SELECT status FROM outbox_events WHERE id=$1', [batch[0].id])
    assert.equal(status.rows[0].status, 'done')
  })

  it('子集合事件经 runOutboxOnce 应用', async () => {
    await insert({
      kind: 'characters',
      op: 'upsert',
      payload: { id: `${novelId}-c1`, novelId, name: '甲', description: '主角' },
    })
    const result = await runOutboxOnce({ workerId: 'test-runner' })
    assert.equal(result.ok, 1)
    const row = await getPool().query('SELECT name FROM novel_characters WHERE id=$1', [`${novelId}-c1`])
    assert.equal(row.rows[0].name, '甲')
  })

  it('未知事件失败后进入 failed 并记录 attempts', async () => {
    const eventId = await insert({ kind: 'unknown-kind', op: 'upsert', payload: {} })
    const batch = await claimBatch(10, 'test-fail')
    const event = batch.find((e) => e.event_id === eventId)
    assert.ok(event)
    await assert.rejects(() => applyEvent(getPool(), event), /未知子集合/)
    await markFailed(event.id, 'boom')
    const row = await getPool().query('SELECT status, attempts FROM outbox_events WHERE event_id=$1', [eventId])
    assert.equal(row.rows[0].status, 'failed')
    assert.equal(row.rows[0].attempts, 1)
  })

  it('统计返回各状态数量', async () => {
    const s = await stats()
    assert.ok(s.done >= 2)
    assert.ok(s.failed >= 1)
  })
})
