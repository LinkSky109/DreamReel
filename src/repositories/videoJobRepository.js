import { getPool } from '../db/client.js'
import { generateId } from '../utils/idGenerator.js'

/**
 * video_jobs 仓储（R3-T3.5）。
 * 只做 SQL 映射，不依赖 req/res；任务状态以 PostgreSQL 为准。
 */

const TERMINAL = new Set(['succeeded', 'failed', 'canceled'])

function mapRow(row) {
  if (!row) return null
  return {
    id: row.id,
    userId: row.user_id,
    projectId: row.project_id,
    type: row.type,
    status: row.status,
    shotIds: Array.isArray(row.shot_ids) ? row.shot_ids : [],
    styleId: row.style_id || null,
    idempotencyKey: row.idempotency_key || null,
    total: row.total,
    completed: row.completed,
    message: row.message || '',
    errorCode: row.error_code || null,
    errorMessage: row.error_message || null,
    attempt: row.attempt,
    maxAttempts: row.max_attempts,
    cancelRequested: row.cancel_requested,
    workerId: row.worker_id || null,
    leaseExpiresAt: row.lease_expires_at ? new Date(row.lease_expires_at).toISOString() : null,
    payload: row.payload || {},
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : null,
    finishedAt: row.finished_at ? new Date(row.finished_at).toISOString() : null,
  }
}

export function isTerminalStatus(status) {
  return TERMINAL.has(status)
}

export function createVideoJobRepository(pool = getPool()) {
  async function create({
    userId,
    projectId,
    type = 'video_batch',
    shotIds = [],
    styleId = null,
    idempotencyKey = null,
    total = shotIds.length,
    maxAttempts = 3,
    payload = {},
  }) {
    const id = generateId()
    const { rows } = await pool.query(
      `INSERT INTO video_jobs
         (id, user_id, project_id, type, shot_ids, style_id, idempotency_key, total, max_attempts, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10::jsonb)
       RETURNING *`,
      [id, userId, projectId, type, JSON.stringify(shotIds), styleId, idempotencyKey, total, maxAttempts, JSON.stringify(payload)]
    )
    return mapRow(rows[0])
  }

  async function findByIdempotencyKey(userId, type, key) {
    if (!key) return null
    const { rows } = await pool.query(
      `SELECT * FROM video_jobs WHERE user_id = $1 AND type = $2 AND idempotency_key = $3`,
      [userId, type, key]
    )
    return mapRow(rows[0])
  }

  async function findById(id) {
    const { rows } = await pool.query('SELECT * FROM video_jobs WHERE id = $1', [id])
    return mapRow(rows[0])
  }

  async function listByProject(projectId, { limit = 20 } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM video_jobs WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [projectId, Math.max(1, Math.min(100, limit))]
    )
    return rows.map(mapRow)
  }

  /** 原子领取一个 queued 任务，写入租约。 */
  async function claimNext(workerId, leaseMs) {
    const { rows } = await pool.query(
      `WITH next AS (
         SELECT id FROM video_jobs
         WHERE status = 'queued' AND cancel_requested = false
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE video_jobs j
       SET status = 'running',
           worker_id = $1,
           lease_expires_at = now() + ($2::text || ' milliseconds')::interval,
           attempt = j.attempt + 1,
           started_at = COALESCE(j.started_at, now()),
           updated_at = now()
       FROM next
       WHERE j.id = next.id
       RETURNING j.*`,
      [workerId, leaseMs]
    )
    if (!rows[0]) return null
    return mapRow(rows[0])
  }

  /** 续租；租约丢失（任务被回收）返回 false。 */
  async function heartbeat(id, workerId, leaseMs) {
    const { rowCount } = await pool.query(
      `UPDATE video_jobs
       SET lease_expires_at = now() + ($3::text || ' milliseconds')::interval, updated_at = now()
       WHERE id = $1 AND worker_id = $2 AND status = 'running'`,
      [id, workerId, leaseMs]
    )
    return rowCount > 0
  }

  async function updateProgress(id, { completed, total, message }) {
    await pool.query(
      `UPDATE video_jobs
       SET completed = $2, total = COALESCE($3, total), message = COALESCE($4, message), updated_at = now()
       WHERE id = $1 AND status = 'running'`,
      [id, completed, total ?? null, message ?? null]
    )
  }

  async function isCancelRequested(id) {
    const { rows } = await pool.query('SELECT cancel_requested FROM video_jobs WHERE id = $1', [id])
    return rows[0]?.cancel_requested === true
  }

  async function finish(id, status, { workerId = null, errorCode = null, errorMessage = null, message = null } = {}) {
    if (!TERMINAL.has(status)) throw new Error(`非法终态: ${status}`)
    const { rows } = await pool.query(
      `UPDATE video_jobs
       SET status = $2,
           error_code = $3,
           error_message = $4,
           message = COALESCE($5, message),
           worker_id = NULL,
           lease_expires_at = NULL,
           finished_at = now(),
           updated_at = now()
       WHERE id = $1 AND status = 'running' AND ($6::text IS NULL OR worker_id = $6)
       RETURNING *`,
      [id, status, errorCode, errorMessage, message, workerId]
    )
    return mapRow(rows[0])
  }

  /** 请求取消：queued 直接取消；running 打标记，由 worker 在镜头边界收口。 */
  async function requestCancel(id) {
    const { rows } = await pool.query(
      `UPDATE video_jobs
       SET cancel_requested = true,
           status = CASE WHEN status = 'queued' THEN 'canceled' ELSE status END,
           finished_at = CASE WHEN status = 'queued' THEN now() ELSE finished_at END,
           updated_at = now()
       WHERE id = $1 AND status IN ('queued', 'running')
       RETURNING *`,
      [id]
    )
    return mapRow(rows[0])
  }

  /** 回收租约过期的 running 任务。 */
  async function recoverExpired() {
    const { rows: failed } = await pool.query(
      `UPDATE video_jobs
       SET status = 'failed',
           error_code = 'LEASE_EXPIRED',
           error_message = 'worker lease expired after max attempts',
           worker_id = NULL,
           lease_expires_at = NULL,
           finished_at = now(),
           updated_at = now()
       WHERE status = 'running' AND lease_expires_at < now() AND attempt >= max_attempts
       RETURNING id`
    )
    const { rows: requeued } = await pool.query(
      `UPDATE video_jobs
       SET status = 'queued',
           worker_id = NULL,
           lease_expires_at = NULL,
           message = 'requeued after lease expiry',
           updated_at = now()
       WHERE status = 'running' AND lease_expires_at < now() AND attempt < max_attempts
       RETURNING id`
    )
    return { failed: failed.map((r) => r.id), requeued: requeued.map((r) => r.id) }
  }

  async function deleteOlderThan(days = 30) {
    const { rowCount } = await pool.query(
      `DELETE FROM video_jobs WHERE status IN ('succeeded', 'failed', 'canceled') AND finished_at < now() - ($1::text || ' days')::interval`,
      [days]
    )
    return rowCount
  }

  return {
    create,
    findById,
    findByIdempotencyKey,
    listByProject,
    claimNext,
    heartbeat,
    updateProgress,
    isCancelRequested,
    finish,
    requestCancel,
    recoverExpired,
    deleteOlderThan,
  }
}

let singleton = null

/** 延迟创建，避免 import 时就建立数据库连接。 */
export function getVideoJobRepository() {
  if (!singleton) singleton = createVideoJobRepository()
  return singleton
}

export default getVideoJobRepository
