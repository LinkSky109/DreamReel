import crypto from 'node:crypto'
import config from '../config/index.js'
import logger from '../utils/logger.js'

/**
 * outbox 事件存储（PostgreSQL）。
 *
 * 写入路径只负责 enqueue（异步、失败告警），worker 负责 claim/apply/mark。
 * 事件应用必须幂等：upsert 与软删除都可重复执行。
 */

let poolProvider = null

function defaultPoolProvider() {
  return import('../db/client.js').then(({ getPool }) => getPool())
}

export function setOutboxPoolProvider(provider) {
  poolProvider = provider
}

function getPool() {
  return (poolProvider || defaultPoolProvider)()
}

export async function getOutboxPool() {
  return getPool()
}

export function outboxEnabled() {
  return config.outbox.enabled
}

/**
 * 记录事件。失败只告警；JSON 仍是事实源，可用 backfill 对账。
 */
export function enqueue(event) {
  if (!outboxEnabled()) return
  const payload = {
    event_id: crypto.randomUUID(),
    orgId: event.orgId || config.novels.orgId,
    kind: event.kind,
    op: event.op,
    payload: event.payload || {},
  }
  getPool()
    .then((pool) =>
      pool.query(
        `INSERT INTO outbox_events (event_id, org_id, kind, op, payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (event_id) DO NOTHING`,
        [payload.event_id, payload.orgId, payload.kind, payload.op, JSON.stringify(payload.payload)]
      )
    )
    .catch((error) => {
      logger.warn('[outbox] enqueue 失败', { kind: payload.kind, op: payload.op, message: error.message })
    })
}

export async function claimBatch(limit = 20, workerId = 'worker') {
  const pool = await getPool()
  const { rows } = await pool.query(
    `WITH picked AS (
       SELECT id FROM outbox_events
       WHERE status IN ('pending','failed') AND available_at <= now()
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE outbox_events e
       SET status = 'processing', locked_at = now(), locked_by = $2, updated_at = now()
     FROM picked
     WHERE e.id = picked.id
     RETURNING e.*`,
    [limit, workerId]
  )
  return rows
}

export async function markDone(id) {
  const pool = await getPool()
  await pool.query(
    `UPDATE outbox_events
       SET status = 'done', updated_at = now(), locked_at = NULL, last_error = NULL
     WHERE id = $1`,
    [id]
  )
}

export async function markFailed(id, error, { maxAttempts = config.outbox.maxAttempts } = {}) {
  const pool = await getPool()
  const { rows } = await pool.query('SELECT attempts FROM outbox_events WHERE id = $1', [id])
  const attempts = (rows[0]?.attempts || 0) + 1
  const status = attempts >= maxAttempts ? 'dead' : 'failed'
  const backoffSeconds = Math.min(300, 2 ** Math.min(attempts, 8))
  await pool.query(
    `UPDATE outbox_events
       SET status = $2, attempts = $3, last_error = $4,
           available_at = now() + ($5 || ' seconds')::interval,
           updated_at = now(), locked_at = NULL
     WHERE id = $1`,
    [id, status, attempts, String(error).slice(0, 2000), backoffSeconds]
  )
  return { attempts, status }
}

/** 回收超时未完成的 processing 事件（worker 崩溃）。 */
export async function resetStale({ lockTimeoutSeconds = config.outbox.lockTimeoutSeconds } = {}) {
  const pool = await getPool()
  const { rowCount } = await pool.query(
    `UPDATE outbox_events
       SET status = 'pending', locked_at = NULL, locked_by = NULL, updated_at = now()
     WHERE status = 'processing' AND locked_at < now() - ($1 || ' seconds')::interval`,
    [lockTimeoutSeconds]
  )
  return rowCount
}

/**
 * 队列统计。
 * 默认返回扁平的状态计数（兼容既有调用）；group=true 时额外按 org 分组，
 * 便于把测试租户/环境噪声和真实积压区分开。
 */
export async function stats({ group = false } = {}) {
  const pool = await getPool()
  const { rows } = await pool.query(
    `SELECT status, count(*)::int AS count FROM outbox_events GROUP BY status ORDER BY status`
  )
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.count]))
  if (!group) return byStatus

  const { rows: orgRows } = await pool.query(
    `SELECT org_id, status, count(*)::int AS count
       FROM outbox_events
      GROUP BY org_id, status
      ORDER BY org_id, status`
  )
  const byOrg = {}
  for (const row of orgRows) {
    byOrg[row.org_id] ||= {}
    byOrg[row.org_id][row.status] = row.count
  }
  return { byStatus, byOrg }
}
