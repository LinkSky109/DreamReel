import config from '../config/index.js'
import logger from '../utils/logger.js'
import { toChildPayload } from '../repositories/novelChildRepository.js'

/**
 * 小说子集合写镜像（chunks / characters / entities / seasons / episodes / assets）。
 *
 * NOVEL_WRITE_MODE=dual 时：JSON 写入成功后进入写后队列，异步 upsert 到 PostgreSQL。
 * - 同一 id 的多次写入会合并，只保留最后一次；
 * - 串行 flush，避免批量抽取时瞬间打满连接池；
 * - 失败只告警，不回滚 JSON；
 * - 删除为软删除；重新创建会清除 deleted_at。
 */

const SPECS = {
  chunks: {
    table: 'novel_chunks',
    columns: 'id, org_id, novel_id, idx, content, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1',
    update: 'idx = EXCLUDED.idx, content = EXCLUDED.content, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.index ?? 0, doc.text || ''],
    payload: (doc) => toChildPayload('chunks', doc),
  },
  characters: {
    table: 'novel_characters',
    columns: 'id, org_id, novel_id, name, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5::jsonb,$6,$7,$8,1',
    update: 'name = EXCLUDED.name, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.name || ''],
    payload: (doc) => toChildPayload('characters', doc),
  },
  entities: {
    table: 'novel_world_entities',
    columns: 'id, org_id, novel_id, name, kind, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1',
    update: 'name = EXCLUDED.name, kind = EXCLUDED.kind, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.name || '', doc.type || ''],
    payload: (doc) => toChildPayload('entities', doc),
  },
  seasons: {
    table: 'seasons',
    columns: 'id, org_id, novel_id, season_no, title, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,1',
    update: 'season_no = EXCLUDED.season_no, title = EXCLUDED.title, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.seasonNo ?? 1, doc.title || ''],
    payload: (doc) => toChildPayload('seasons', doc),
  },
  episodes: {
    table: 'episodes',
    columns: 'id, org_id, novel_id, season_id, episode_no, title, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,1',
    update:
      'season_id = EXCLUDED.season_id, episode_no = EXCLUDED.episode_no, title = EXCLUDED.title, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.seasonId || null, doc.episodeNo ?? 1, doc.title || ''],
    payload: (doc) => toChildPayload('episodes', doc),
  },
  assets: {
    table: 'novel_asset_images',
    columns: 'id, org_id, novel_id, category, name, status, payload, sort_order, created_at, updated_at, version',
    values: '$1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,1',
    update:
      'category = EXCLUDED.category, name = EXCLUDED.name, status = EXCLUDED.status, payload = EXCLUDED.payload',
    map: (doc) => [doc.id, doc.novelId, doc.category || '', doc.name || '', doc.status || 'draft'],
    payload: (doc) => toChildPayload('assets', doc),
  },
}

let sequence = 0
function nextSortOrder() {
  const now = Date.now()
  sequence = now > sequence ? now : sequence + 1
  return sequence
}

export function createNovelChildWriteSync({
  mode = 'legacy',
  getPool,
  log = logger,
  orgId = 'default',
  flushDelayMs = 120,
} = {}) {
  const enabled = mode === 'dual'
  const queue = new Map() // key -> { op:'upsert', kind, doc } | { op:'delete', kind, id }
  let timer = null
  let flushing = false

  async function upsertOne(pool, kind, doc) {
    const spec = SPECS[kind]
    if (!spec) throw new Error(`未知子集合：${kind}`)
    const now = new Date()
    const createdAt = doc.createdAt ? new Date(doc.createdAt) : now
    const updatedAt = doc.updatedAt ? new Date(doc.updatedAt) : now
    const mapped = spec.map(doc)
    const params = [doc.id, orgId, doc.novelId, ...mapped.slice(2), JSON.stringify(spec.payload(doc)), nextSortOrder(), createdAt, updatedAt]
    await pool.query(
      `INSERT INTO ${spec.table} (${spec.columns}) VALUES (${spec.values})
       ON CONFLICT (id) DO UPDATE SET ${spec.update},
         updated_at = EXCLUDED.updated_at,
         deleted_at = NULL,
         version = ${spec.table}.version + 1`,
      params
    )
  }

  async function deleteByNovel(pool, kind, novelId) {
    const spec = SPECS[kind]
    if (!spec) throw new Error(`未知子集合：${kind}`)
    const now = new Date()
    await pool.query(
      `UPDATE ${spec.table} SET deleted_at = $3, updated_at = $3, version = version + 1
       WHERE novel_id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [novelId, orgId, now]
    )
  }

  async function deleteOne(pool, kind, id) {
    const spec = SPECS[kind]
    if (!spec) throw new Error(`未知子集合：${kind}`)
    const now = new Date()
    await pool.query(
      `UPDATE ${spec.table} SET deleted_at = $3, updated_at = $3, version = version + 1
       WHERE id = $1 AND org_id = $2 AND deleted_at IS NULL`,
      [id, orgId, now]
    )
  }

  function scheduleFlush() {
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      flush().catch(() => {})
    }, flushDelayMs)
    timer.unref?.()
  }

  async function flush() {
    if (flushing || queue.size === 0) return
    flushing = true
    const batch = [...queue.values()]
    queue.clear()
    try {
      const pool = await getPool()
      for (const item of batch) {
        if (item.op === 'upsert') await upsertOne(pool, item.kind, item.doc)
        else if (item.op === 'deleteNovel') await deleteByNovel(pool, item.kind, item.novelId)
        else await deleteOne(pool, item.kind, item.id)
      }
    } catch (error) {
      log.warn('[novel-child-write] 镜像 flush 失败', { count: batch.length, message: error.message })
    } finally {
      flushing = false
      if (queue.size) scheduleFlush()
    }
  }

  function scheduleUpsert(kind, doc) {
    if (!enabled || !doc?.id || !doc?.novelId) return
    queue.set(`${kind}:${doc.id}`, { op: 'upsert', kind, doc })
    scheduleFlush()
  }

  function scheduleDelete(kind, id) {
    if (!enabled || !id) return
    queue.set(`${kind}:${id}`, { op: 'delete', kind, id })
    scheduleFlush()
  }

  function scheduleDeleteByNovel(novelId) {
    if (!enabled || !novelId) return
    for (const kind of Object.keys(SPECS)) {
      queue.set(`${kind}:novel:${novelId}`, { op: 'deleteNovel', kind, novelId })
    }
    scheduleFlush()
  }

  async function flushNow() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    while (queue.size) {
      if (flushing) {
        await new Promise((resolve) => setTimeout(resolve, 10))
        continue
      }
      await flush()
      // flush 是串行且会消费当前队列；若期间有新写入，继续下一轮
      if (queue.size) await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  return { enabled, scheduleUpsert, scheduleDelete, scheduleDeleteByNovel, flush: flushNow, pending: () => queue.size }
}

async function defaultGetPool() {
  const { getPool } = await import('../db/client.js')
  return getPool()
}

export const novelChildMirror = createNovelChildWriteSync({
  mode: config.novels.writeMode,
  getPool: defaultGetPool,
  orgId: config.novels.orgId,
})
