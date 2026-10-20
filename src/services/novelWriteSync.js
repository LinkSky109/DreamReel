import config from '../config/index.js'
import logger from '../utils/logger.js'
import { toNovelPayload } from '../repositories/novelRepository.js'

/**
 * novels 写路径镜像（JSON 为准）。
 *
 * - legacy：不写 PostgreSQL
 * - dual：JSON 写入成功后异步 upsert 到 PostgreSQL；失败只告警，不影响请求
 * - postgres：写模式尚未开放，等同 legacy（避免误以为已切换主写）
 *
 * 注意：镜像为 fire-and-forget，进程退出前可能未落库；迁移期以 JSON 为准，
 * 定期用 `npm run db:verify:novels` 对账。
 */
export function createNovelWriteSync({ mode = 'legacy', getPool, log = logger, orgId = 'default' } = {}) {
  const enabled = mode === 'dual'

  async function upsert(doc) {
    if (!enabled) return { skipped: true }
    const pool = await getPool()
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
    return { ok: true }
  }

  function scheduleUpsert(doc) {
    if (!enabled || !doc?.id) return
    upsert(doc).catch((error) => {
      log.warn('[novel-write] 镜像写入失败', { id: doc.id, message: error.message })
    })
  }

  async function softDelete(id) {
    if (!enabled) return { skipped: true }
    const pool = await getPool()
    const now = new Date()
    await pool.query(
      `UPDATE novels
         SET deleted_at = $3, updated_at = $3, version = version + 1
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [id, orgId, now]
    )
    return { ok: true }
  }

  function scheduleDelete(id) {
    if (!enabled || !id) return
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
