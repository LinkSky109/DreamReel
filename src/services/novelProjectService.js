import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import { NovelProject } from '../models/NovelProject.js'
import { STAGES } from '../models/NovelProject.js'
import { applyNovelDelete, applyNovelUpsert } from './novelWriteSync.js'
import { deleteChildrenByNovel, forgetNovelPg } from './novelChildStore.js'

const NOVELS_ROOT = path.resolve(config.storage.path, 'novels')

const SUB_DIRS = ['source', 'chunks', 'characters', 'assets']

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function novelDir(novelId) {
  return path.join(NOVELS_ROOT, novelId)
}

async function defaultPool() {
  const { getPool } = await import('../db/client.js')
  return getPool()
}

/** 创建小说项目：文件目录 + PostgreSQL 主行（唯一事实源）。 */
export async function createNovelProject(data = {}) {
  if (!data.title) throw new Error('title is required')
  const project = new NovelProject(data)
  project.dir = novelDir(project.id)
  ensureDir(project.dir)
  for (const sub of SUB_DIRS) ensureDir(path.join(project.dir, sub))
  await applyNovelUpsert(await defaultPool(), project, config.novels.orgId)
  return project
}

/** 读取小说项目（PostgreSQL）。 */
export async function getNovelProject(id) {
  const { novelReadService } = await import('./novelReadService.js')
  return novelReadService.get(id)
}

export async function updateNovelProject(id, patch = {}) {
  const project = structuredClone(await getNovelProject(id))
  Object.assign(project, patch, { updatedAt: new Date().toISOString() })
  await applyNovelUpsert(await defaultPool(), project, config.novels.orgId)
  return project
}

/**
 * 从实际数据重算 counts（章节/角色/实体）。
 * 增量更新一旦被覆盖（如数据清理）就会漂移，导致页面显示「章 0」等；用本函数纠正。
 * 角色/实体按“当前选中集合”计数，避免历史集合虚高；
 * 季/集计数由分季规划写入，这里保留既有值。
 */
export async function recomputeNovelCounts(id) {
  const project = await getNovelProject(id)
  const { novelChildReadService } = await import('./novelChildReadService.js')
  const [characters, worldEntities, chunks] = await Promise.all([
    novelChildReadService.list('characters', id),
    novelChildReadService.list('entities', id),
    novelChildReadService.list('chunks', id),
  ])
  return updateNovelProject(id, {
    counts: {
      ...project.counts,
      chapters: chunks.length,
      characters: characters.length,
      worldEntities: worldEntities.length,
    },
  })
}

export function stageIndex(stage) {
  return STAGES.indexOf(stage)
}

/** 某阶段是否已锁定（已进入更靠后的阶段） */
export function isLocked(project, stage) {
  return stageIndex(project.stage) > stageIndex(stage)
}

/** 阶段可编辑校验：已锁定则抛错 */
export function assertEditable(project, stage) {
  if (isLocked(project, stage)) {
    throw new Error(`阶段「${stage}」已锁定，不可修改（当前已进入「${project.stage}」）`)
  }
}

/** 推进到下一阶段（或指定阶段）；不可回退 */
export async function advanceStage(id, toStage) {
  const project = await getNovelProject(id)
  const cur = stageIndex(project.stage)
  const to = toStage ? stageIndex(toStage) : cur + 1
  if (to < 0 || to >= STAGES.length) throw new Error('无效阶段')
  if (to <= cur) throw new Error(`不能回退阶段（当前 ${project.stage}）`)
  return updateNovelProject(id, { stage: STAGES[to] })
}

/**
 * 删除小说项目：PG 软删主行 + 子集合，并落盘目录清理（不可恢复）。
 * 覆盖 novels/<id>、exports/novels/<id>、images|videos|audio/novels/<id>。
 */
export async function deleteNovelProject(id) {
  // 不存在时抛错，避免脚本静默成功
  await getNovelProject(id)
  const pool = await defaultPool()
  await applyNovelDelete(pool, id, config.novels.orgId)
  const removedRecords = await deleteChildrenByNovel(id, { pool })
  const root = path.resolve(config.storage.path)
  const dirs = [
    novelDir(id),
    path.join(root, 'exports', 'novels', id),
    path.join(root, 'images', 'novels', id),
    path.join(root, 'videos', 'novels', id),
    path.join(root, 'audio', 'voices', 'novels', id),
  ]
  const removedDirs = []
  for (const dir of dirs) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
      removedDirs.push(dir)
    }
  }
  forgetNovelPg(id)
  return { id, deleted: true, removedDirs, removedRecords }
}

export function writeNovelFile(novelId, relativePath, content) {
  const dir = novelDir(novelId)
  ensureDir(dir)
  const full = path.join(dir, relativePath)
  ensureDir(path.dirname(full))
  fs.writeFileSync(full, content)
  return full
}

export function readNovelFile(novelId, relativePath) {
  const full = path.join(novelDir(novelId), relativePath)
  if (!fs.existsSync(full)) return null
  return fs.readFileSync(full)
}

// cleaned.txt 缓存：避免按章/按集水合时反复读盘
const cleanedCache = new Map() // novelId -> { mtimeMs, text }

/** 读取 source/cleaned.txt（带 mtime 缓存）；不存在返回 '' */
export function readCleanedText(novelId) {
  const full = path.join(novelDir(novelId), 'source', 'cleaned.txt')
  try {
    const st = fs.statSync(full)
    const cached = cleanedCache.get(novelId)
    if (cached && cached.mtimeMs === st.mtimeMs) return cached.text
    const text = fs.readFileSync(full, 'utf-8')
    cleanedCache.set(novelId, { mtimeMs: st.mtimeMs, text })
    return text
  } catch {
    return ''
  }
}

/** 兼容读取：优先内存/旧字段 text，其次按偏移从 cleaned.txt 切片 */
export function getChunkText(novelId, chunk) {
  if (!chunk) return ''
  if (typeof chunk.text === 'string' && chunk.text.length) return chunk.text
  if (chunk.startOffset !== null && chunk.startOffset !== undefined && chunk.endOffset !== null && chunk.endOffset !== undefined) {
    const cleaned = readCleanedText(novelId)
    if (cleaned) return cleaned.slice(chunk.startOffset, chunk.endOffset)
  }
  return ''
}

/** 兼容读取：优先旧 sourceFile，其次按偏移从 cleaned.txt 切片 */
export function getEpisodeText(novelId, episode) {
  if (!episode) return ''
  if (episode.sourceFile) {
    const buf = readNovelFile(novelId, episode.sourceFile)
    if (buf) return buf.toString('utf-8')
  }
  if (episode.startOffset !== null && episode.startOffset !== undefined && episode.endOffset !== null && episode.endOffset !== undefined) {
    const cleaned = readCleanedText(novelId)
    if (cleaned) return cleaned.slice(episode.startOffset, episode.endOffset)
  }
  return ''
}

/** 清空 cleaned 缓存（重新摄取后调用） */
export function invalidateCleanedCache(novelId) {
  if (novelId) cleanedCache.delete(novelId)
  else cleanedCache.clear()
}
