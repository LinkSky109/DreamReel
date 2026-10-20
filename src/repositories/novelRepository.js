import config from '../config/index.js'

/**
 * NovelRepository 契约（Phase 3 试点）
 *
 * list({ orgId, limit, offset, includeDeleted }) -> Novel[]
 * findById(id, { orgId }) -> Novel | null
 * create(novel, { orgId }) -> Novel
 * update(id, patch, { orgId, expectedVersion }) -> Novel
 * softDelete(id, { orgId }) -> boolean
 *
 * 约定：
 * - 所有方法异步；
 * - 返回对象统一为驼峰、ISO 时间字符串；
 * - 租户默认 'default'；
 * - 乐观锁冲突抛错 code=CONFLICT。
 */

export const DEFAULT_ORG = 'default'

function conflict(message) {
  const error = new Error(message)
  error.code = 'CONFLICT'
  return error
}

function notFound(message) {
  const error = new Error(message)
  error.code = 'NOT_FOUND'
  return error
}

function toIso(value) {
  if (!value) return null
  if (value instanceof Date) return value.toISOString()
  return typeof value === 'string' ? value : new Date(value).toISOString()
}

function normalize(doc, orgId = DEFAULT_ORG) {
  return {
    ...doc,
    orgId: doc.orgId || orgId,
    version: doc.version || 1,
    createdAt: toIso(doc.createdAt) || new Date().toISOString(),
    updatedAt: toIso(doc.updatedAt) || toIso(doc.createdAt) || new Date().toISOString(),
    deletedAt: toIso(doc.deletedAt),
  }
}

function sortByUpdatedDesc(a, b) {
  return String(b.updatedAt).localeCompare(String(a.updatedAt))
}

export function createJsonNovelRepository(store) {
  const collection = () => {
    if (!store.data.novelProjects) store.data.novelProjects = {}
    return store.data.novelProjects
  }
  const persist = () => store.save?.()

  return {
    async list({ orgId = DEFAULT_ORG, limit = 50, offset = 0, includeDeleted = false } = {}) {
      return Object.values(collection())
        .map((doc) => normalize(doc, orgId))
        .filter((doc) => doc.orgId === orgId)
        .filter((doc) => includeDeleted || !doc.deletedAt)
        .sort(sortByUpdatedDesc)
        .slice(offset, offset + limit)
    },

    async findById(id, { orgId = DEFAULT_ORG } = {}) {
      const doc = collection()[id]
      if (!doc) return null
      const normalized = normalize(doc, orgId)
      if (normalized.orgId !== orgId || normalized.deletedAt) return null
      return normalized
    },

    async create(novel, { orgId = DEFAULT_ORG } = {}) {
      if (collection()[novel.id]) throw conflict(`小说已存在：${novel.id}`)
      const now = new Date().toISOString()
      const doc = normalize({ ...novel, orgId, createdAt: novel.createdAt || now, updatedAt: now }, orgId)
      collection()[doc.id] = doc
      persist()
      return doc
    },

    async update(id, patch, { orgId = DEFAULT_ORG, expectedVersion } = {}) {
      const existing = collection()[id]
      if (!existing) throw notFound(`小说不存在：${id}`)
      const current = normalize(existing, orgId)
      if (current.orgId !== orgId) throw notFound(`小说不存在：${id}`)
      if (current.deletedAt) throw notFound(`小说已删除：${id}`)
      if (expectedVersion !== undefined && current.version !== expectedVersion) {
        throw conflict(`版本冲突：期望 ${expectedVersion}，实际 ${current.version}`)
      }
      const doc = normalize(
        { ...current, ...patch, id, orgId, version: current.version + 1, updatedAt: new Date().toISOString() },
        orgId
      )
      collection()[id] = doc
      persist()
      return doc
    },

    async softDelete(id, { orgId = DEFAULT_ORG } = {}) {
      const existing = collection()[id]
      if (!existing) return false
      const current = normalize(existing, orgId)
      if (current.orgId !== orgId || current.deletedAt) return false
      collection()[id] = normalize(
        { ...current, deletedAt: new Date().toISOString(), version: current.version + 1, updatedAt: new Date().toISOString() },
        orgId
      )
      persist()
      return true
    },
  }
}

function rowToDoc(row) {
  return {
    ...(row.payload || {}),
    id: row.id,
    orgId: row.org_id,
    ownerId: row.owner_id || undefined,
    title: row.title,
    status: row.status,
    version: row.version,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    deletedAt: toIso(row.deleted_at),
  }
}

const COLUMN_FIELDS = ['id', 'orgId', 'ownerId', 'title', 'status', 'version', 'createdAt', 'updatedAt', 'deletedAt']

export function toNovelPayload(doc) {
  const payload = { ...doc }
  for (const field of COLUMN_FIELDS) delete payload[field]
  return payload
}

export function createPostgresNovelRepository(db) {
  const findById = async (id, { orgId = DEFAULT_ORG } = {}) => {
    const row = await db
      .selectFrom('novels')
      .selectAll()
      .where('id', '=', id)
      .where('org_id', '=', orgId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst()
    return row ? rowToDoc(row) : null
  }

  return {
    findById,

    async list({ orgId = DEFAULT_ORG, limit = 50, offset = 0, includeDeleted = false } = {}) {
      let query = db
        .selectFrom('novels')
        .selectAll()
        .where('org_id', '=', orgId)
        .orderBy('updated_at', 'desc')
        .limit(limit)
        .offset(offset)
      if (!includeDeleted) query = query.where('deleted_at', 'is', null)
      const rows = await query.execute()
      return rows.map(rowToDoc)
    },

    async create(novel, { orgId = DEFAULT_ORG } = {}) {
      const now = new Date()
      const doc = normalize({ ...novel, orgId, createdAt: novel.createdAt || now, updatedAt: now }, orgId)
      try {
        await db
          .insertInto('novels')
          .values({
            id: doc.id,
            org_id: orgId,
            owner_id: doc.ownerId || null,
            title: doc.title || '',
            status: doc.status || 'draft',
            payload: JSON.stringify(toNovelPayload(doc)),
            created_at: new Date(doc.createdAt),
            updated_at: new Date(doc.updatedAt),
            version: 1,
          })
          .execute()
      } catch (error) {
        if (error.code === '23505') throw conflict(`小说已存在：${novel.id}`)
        throw error
      }
      return doc
    },

    async update(id, patch, { orgId = DEFAULT_ORG, expectedVersion } = {}) {
      const current = await findById(id, { orgId })
      if (!current) throw notFound(`小说不存在：${id}`)
      if (expectedVersion !== undefined && current.version !== expectedVersion) {
        throw conflict(`版本冲突：期望 ${expectedVersion}，实际 ${current.version}`)
      }
      const merged = normalize(
        { ...current, ...patch, id, orgId, version: current.version + 1, updatedAt: new Date() },
        orgId
      )
      let query = db
        .updateTable('novels')
        .set({
          owner_id: merged.ownerId || null,
          title: merged.title || '',
          status: merged.status || 'draft',
          payload: JSON.stringify(toNovelPayload(merged)),
          updated_at: new Date(merged.updatedAt),
          version: merged.version,
        })
        .where('id', '=', id)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
      if (expectedVersion !== undefined) query = query.where('version', '=', expectedVersion)
      const result = await query.executeTakeFirst()
      if (!result || Number(result.numUpdatedRows) === 0) {
        throw conflict('更新冲突：数据已被修改')
      }
      return merged
    },

    async softDelete(id, { orgId = DEFAULT_ORG } = {}) {
      const now = new Date()
      const current = await findById(id, { orgId })
      if (!current) return false
      const result = await db
        .updateTable('novels')
        .set({ deleted_at: now, updated_at: now, version: current.version + 1 })
        .where('id', '=', id)
        .where('org_id', '=', orgId)
        .where('deleted_at', 'is', null)
        .executeTakeFirst()
      return Boolean(result && Number(result.numUpdatedRows) > 0)
    },
  }
}

export function getNovelRepository({ driver = config.db.driver, db, store } = {}) {
  if (driver === 'postgres') {
    if (!db) throw new Error('postgres 驱动需要传入 Kysely 实例')
    return createPostgresNovelRepository(db)
  }
  if (!store) throw new Error('json 驱动需要传入 storage 实例')
  return createJsonNovelRepository(store)
}
