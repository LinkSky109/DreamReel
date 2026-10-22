import { toNovelPayload } from '../repositories/novelRepository.js'

/**
 * 小说主行 PostgreSQL 写入原语。
 *
 * 生产写路径由 novelProjectService 直接调用（PG 是唯一事实源）；
 * 这里同时作为离线迁移/恢复脚本的 upsert/delete 工具，不再包含 outbox/镜像调度。
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
  const result = await pool.query(
    `UPDATE novels SET deleted_at = now(), updated_at = now(), version = version + 1
     WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
    [id, orgId]
  )
  return result.rowCount
}
