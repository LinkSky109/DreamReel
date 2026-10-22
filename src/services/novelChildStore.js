import config from '../config/index.js'
import { storageService } from './storageService.js'
import {
  applyChildUpsert,
  applyChildDelete,
  applyChildDeleteStates,
  applyChildDeleteByNovel,
} from './novelChildWriteSync.js'
import { CHILD_KINDS } from '../repositories/novelChildRepository.js'
import { applyNovelUpsert } from './novelWriteSync.js'

/**
 * 小说子集合写入门面（Phase 3b）。
 *
 * postgres：先写 PG，成功后更新本地 JSON 读缓存；PG 是事实源。
 * legacy/dual：保持原 JSON 行为（dual 由 storageService 的镜像负责）。
 *
 * 说明：Phase 3b 先覆盖 chunks / characters / entities / assets / states / sets；
 * novels 主表与项目字段仍在 Phase 3c 切换。JSON 缓存让大量同步读路径无需一次性改异步。
 */

export function isPgWriteMode() {
  return config.novels.writeMode === 'postgres'
}

async function defaultPool() {
  const { getPool } = await import('../db/client.js')
  return getPool()
}

const ensuredNovels = new Set()

/** 子记录写入前确保 novels 主行存在，避免 outbox/项目创建延迟导致外键失败。 */
async function ensureNovelPg(pool, novelId) {
  if (ensuredNovels.has(novelId)) return
  const { getNovelProject } = await import('./novelProjectService.js')
  const project = getNovelProject(novelId)
  await applyNovelUpsert(pool, project, config.novels.orgId)
  ensuredNovels.add(novelId)
}

export function forgetNovelPg(novelId) {
  ensuredNovels.delete(novelId)
}

const JSON_WRITERS = {
  chunks: (doc) => storageService.createNovelChunk(doc),
  characters: (doc) => storageService.createNovelCharacter(doc),
  entities: (doc) => storageService.createWorldEntity(doc),
  assets: (doc) => storageService.createNovelAssetImage(doc),
  states: (doc) => storageService.createNovelCharacterState(doc),
  characterSets: (doc) => storageService.createCharacterSet(doc),
  worldSets: (doc) => storageService.createWorldSet(doc),
}

const JSON_DELETERS = {
  chunks: (id) => storageService.deleteNovelChunk?.(id) ?? false,
  characters: (id) => storageService.deleteNovelCharacter?.(id) ?? false,
  entities: (id) => storageService.deleteWorldEntity?.(id) ?? false,
  assets: (id) => storageService.deleteNovelAssetImage(id),
  states: (id) => storageService.deleteNovelCharacterState?.(id) ?? false,
  characterSets: (id) => storageService.deleteCharacterSet?.(id) ?? false,
  worldSets: (id) => storageService.deleteWorldSet?.(id) ?? false,
}

function requireKind(kind) {
  if (!JSON_WRITERS[kind]) throw new Error(`未知子集合：${kind}`)
}

/** PG 写入成功后再更新 JSON 缓存；PG 失败时本地不落脏数据。 */
export async function writeChild(kind, doc, { pool = null } = {}) {
  requireKind(kind)
  if (isPgWriteMode()) {
    const pg = pool || (await defaultPool())
    await ensureNovelPg(pg, doc.novelId)
    await applyChildUpsert(pg, kind, doc, config.novels.orgId)
  }
  return JSON_WRITERS[kind](doc)
}

export async function writeChildren(kind, docs, { pool = null } = {}) {
  requireKind(kind)
  if (!docs?.length) return []
  if (!isPgWriteMode()) return docs.map((doc) => JSON_WRITERS[kind](doc))
  const pg = pool || (await defaultPool())
  if (docs[0]?.novelId) await ensureNovelPg(pg, docs[0].novelId)
  const out = []
  for (const doc of docs) {
    await applyChildUpsert(pg, kind, doc, config.novels.orgId)
    out.push(JSON_WRITERS[kind](doc))
  }
  return out
}

export async function deleteChild(kind, id, { pool = null } = {}) {
  requireKind(kind)
  if (isPgWriteMode()) {
    await applyChildDelete(pool || (await defaultPool()), kind, id, config.novels.orgId)
  }
  return JSON_DELETERS[kind](id)
}

export async function deleteChildStates(novelId, characterId = null, episodeNo = null, { pool = null } = {}) {
  if (isPgWriteMode()) {
    await applyChildDeleteStates(
      pool || (await defaultPool()),
      novelId,
      config.novels.orgId,
      characterId,
      episodeNo
    )
  }
  return storageService.deleteNovelCharacterStates(novelId, characterId, episodeNo)
}

export async function deleteChildrenByNovel(novelId, { pool = null } = {}) {
  if (!isPgWriteMode()) return
  const pg = pool || (await defaultPool())
  for (const kind of CHILD_KINDS) {
    await applyChildDeleteByNovel(pg, kind, novelId, config.novels.orgId)
  }
}

export { CHILD_KINDS }
