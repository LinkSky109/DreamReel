import config from '../config/index.js'
import {
  applyChildUpsert,
  applyChildDelete,
  applyChildDeleteStates,
  applyChildDeleteByNovel,
} from './novelChildWriteSync.js'
import { CHILD_KINDS } from '../repositories/novelChildRepository.js'
import { applyNovelUpsert } from './novelWriteSync.js'

/**
 * 小说子集合写入门面。
 *
 * PostgreSQL 是唯一写目标；不再有 JSON 缓存写入或 legacy/dual 分支。
 */

async function defaultPool() {
  const { getPool } = await import('../db/client.js')
  return getPool()
}

const ensuredNovels = new Set()

/** 子记录写入前确保 novels 主行存在，避免外键失败。 */
async function ensureNovelPg(pool, novelId) {
  if (ensuredNovels.has(novelId)) return
  const { novelReadService } = await import('./novelReadService.js')
  const project = await novelReadService.get(novelId)
  await applyNovelUpsert(pool, project, config.novels.orgId)
  ensuredNovels.add(novelId)
}

export function forgetNovelPg(novelId) {
  ensuredNovels.delete(novelId)
}

function requireKind(kind) {
  if (!CHILD_KINDS.includes(kind)) throw new Error(`未知子集合：${kind}`)
}

/** 写单条子记录（主行不存在时先 upsert 主行）。 */
export async function writeChild(kind, doc, { pool = null } = {}) {
  requireKind(kind)
  const pg = pool || (await defaultPool())
  await ensureNovelPg(pg, doc.novelId)
  await applyChildUpsert(pg, kind, doc, config.novels.orgId)
  return doc
}

/** 批量写子记录（同一 novelId，逐条 upsert）。 */
export async function writeChildren(kind, docs, { pool = null } = {}) {
  requireKind(kind)
  if (!docs?.length) return []
  const pg = pool || (await defaultPool())
  if (docs[0]?.novelId) await ensureNovelPg(pg, docs[0].novelId)
  for (const doc of docs) {
    await applyChildUpsert(pg, kind, doc, config.novels.orgId)
  }
  return docs
}

/** 软删除单条子记录，返回受影响行数。 */
export async function deleteChild(kind, id, { pool = null } = {}) {
  requireKind(kind)
  return applyChildDelete(pool || (await defaultPool()), kind, id, config.novels.orgId)
}

/** 软删除某角色（或整部）在某集（或不限集）的状态记录，返回受影响行数。 */
export async function deleteChildStates(novelId, characterId = null, episodeNo = null, { pool = null } = {}) {
  return applyChildDeleteStates(
    pool || (await defaultPool()),
    novelId,
    config.novels.orgId,
    characterId,
    episodeNo
  )
}

/** 软删除某部小说的全部子集合，返回各集合受影响行数。 */
export async function deleteChildrenByNovel(novelId, { pool = null } = {}) {
  const pg = pool || (await defaultPool())
  const removed = {}
  for (const kind of CHILD_KINDS) {
    const count = await applyChildDeleteByNovel(pg, kind, novelId, config.novels.orgId)
    if (count) removed[kind] = count
  }
  return removed
}

export { CHILD_KINDS }
