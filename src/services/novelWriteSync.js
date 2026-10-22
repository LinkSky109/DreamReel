import config from '../config/index.js'
import logger from '../utils/logger.js'
import { toNovelPayload } from '../repositories/novelRepository.js'
import { enqueue, outboxEnabled } from './outboxStore.js'

/**
 * novels 写镜像。
 *
 * - legacy：不写 PostgreSQL
 * - dual + OUTBOX_ENABLED=false：进程内 fire-and-forget
 * - dual + OUTBOX_ENABLED=true：先落 outbox_events，由 worker 幂等应用
 *
 * JSON 始终是事实源；镜像失败不回滚 JSON。
 */

export async function applyNovelUpsert(pool, doc, orgId) {
  const now = new Date()
  const createdAt = doc.createdAt ? new Date(doc.createdAt) : now
  const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : now
  await pool.query(
    `INSERT INTO novels (id, org_id, owner_id, title, status, payload, created_at, updated_at, deleted_at, version)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1)
     ON CONFLICT (id) DO UPDATE SET
       owner_id = EXCLUDED.owner_id,
       title = EXCLUDED.title,
       status = EXCLUDED.status,
       payload = EXCLUDED.payload,
       updated_at = EXCLUDED.updated_at,
       deleted_at = EXCLUDED.deleted_at,
       version = novels.version + 1`,
    [
      doc.id,
      orgId,
      doc.ownerId || null,
      doc.title || '',
      doc.status || 'draft',
      JSON.stringify(toNovelPayload(doc)),
      createdAt,
      updatedAt,
      doc.deletedAt ? new Date(doc.deletedAt) : null,
    ]
  )
}

export async function applyNovelDelete(pool, id, orgId) {
  await pool.query(
    `UPDATE novels SET deleted_at = now(), updated_at = now(), version = version + 1
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [id, orgId]
  )
}

export function createNovelWriteSync({ mode = 'legacy', getPool, log = logger, orgId = 'default' } = {}) {
  const enabled = mode === 'dual' || mode === 'postgres'

  async function upsert(doc) {
    if (!enabled) return { skipped: true }
    await applyNovelUpsert(await getPool(), doc, orgId)
    return { ok: true }
  }

  function scheduleUpsert(doc) {
    if (!enabled || !doc?.id) return
    if (outboxEnabled()) {
      enqueue({ kind: 'novel', op: 'upsert', payload: doc, orgId })
      return
    }
    upsert(doc).catch((error) => {
      log.warn('[novel-write] 镜像写入失败', { id: doc.id, message: error.message })
    })
  }

  async function softDelete(id) {
    if (!enabled) return { skipped: true }
    await applyNovelDelete(await getPool(), id, orgId)
    return { ok: true }
  }

  function scheduleDelete(id) {
    if (!enabled || !id) return
    if (outboxEnabled()) {
      enqueue({ kind: 'novel', op: 'delete', payload: { id }, orgId })
      return
    }
    softDelete(id).catch((error) => {
      log.warn('[novel-write] 镜像删除失败', { id, message: error.message })
    })
  }

  return { enabled, upsert, softDelete, scheduleUpsert, scheduleDelete }
}

async function defaultGetPool() {
  const { getPool } = await import('../db/client.js')
  return getPool()
}

export const novelMirror = createNovelWriteSync({
  mode: config.novels.writeMode,
  getPool: defaultGetPool,
  orgId: config.novels.orgId,
})
