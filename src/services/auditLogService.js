import crypto from 'node:crypto'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { stableStringify } from '../utils/stableJson.js'

/**
 * 审计日志（PostgreSQL，只追加 + 哈希链）。
 * 未配置 DATABASE_URL 时静默跳过，不影响业务请求。
 */

function enabled() {
  return config.audit.enabled && Boolean(process.env.DATABASE_URL || config.db.url)
}

function hashOf(prevHash, payload) {
  return crypto.createHash('sha256').update(`${prevHash || ''}\n${payload}`).digest('hex')
}

export async function writeAudit(event) {
  if (!enabled()) return { skipped: true }
  const { getPool } = await import('../db/client.js')
  const pool = await getPool()
  const client = await pool.connect()
  const createdAt = new Date().toISOString()
  const record = {
    orgId: event.orgId || 'default',
    actorId: event.actorId || null,
    action: event.action || '',
    resourceType: event.resourceType || '',
    resourceId: event.resourceId || null,
    requestId: event.requestId || null,
    ip: event.ip || null,
    metadata: event.metadata || {},
    createdAt,
  }
  const payload = stableStringify(record)
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [record.orgId])
    const { rows } = await client.query(
      'SELECT hash FROM audit_logs WHERE org_id = $1 ORDER BY id DESC LIMIT 1',
      [record.orgId]
    )
    const prevHash = rows[0]?.hash || null
    const hash = hashOf(prevHash, payload)
    await client.query(
      `INSERT INTO audit_logs
         (org_id, actor_id, action, resource_type, resource_id, request_id, ip, metadata, prev_hash, hash, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [
        record.orgId,
        record.actorId,
        record.action,
        record.resourceType,
        record.resourceId,
        record.requestId,
        record.ip,
        JSON.stringify(record.metadata),
        prevHash,
        hash,
        createdAt,
      ]
    )
    await client.query('COMMIT')
    return { ok: true, hash }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    logger.warn('[audit] 写入失败', { message: error.message })
    return { ok: false, error: error.message }
  } finally {
    client.release()
  }
}

export async function verifyAuditChain(orgId = 'default') {
  if (!enabled()) return { ok: true, skipped: true, count: 0 }
  const { getPool } = await import('../db/client.js')
  const { rows } = await getPool().query(
    `SELECT id, org_id, actor_id, action, resource_type, resource_id, request_id, ip, metadata,
            prev_hash, hash, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS created_at_iso
       FROM audit_logs WHERE org_id = $1 ORDER BY id ASC`,
    [orgId]
  )
  let prev = null
  for (const row of rows) {
    const payload = stableStringify({
      orgId: row.org_id,
      actorId: row.actor_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      requestId: row.request_id,
      ip: row.ip,
      metadata: row.metadata,
      createdAt: row.created_at_iso,
    })
    const expected = hashOf(prev, payload)
    if (row.prev_hash !== prev || row.hash !== expected) {
      return { ok: false, count: rows.length, brokenAt: row.id }
    }
    prev = row.hash
  }
  return { ok: true, count: rows.length }
}
