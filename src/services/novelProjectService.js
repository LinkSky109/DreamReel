import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import { storageService } from './storageService.js'
import { NovelProject } from '../models/NovelProject.js'
import { STAGES } from '../models/NovelProject.js'
import { novelMirror } from './novelWriteSync.js'

const NOVELS_ROOT = path.resolve(config.storage.path, 'novels')

const SUB_DIRS = ['source', 'chunks', 'characters', 'assets']

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function novelDir(novelId) {
  return path.join(NOVELS_ROOT, novelId)
}

export function createNovelProject(data = {}) {
  if (!data.title) throw new Error('title is required')
  const project = new NovelProject(data)
  project.dir = novelDir(project.id)
  ensureDir(project.dir)
  for (const sub of SUB_DIRS) ensureDir(path.join(project.dir, sub))
  const saved = storageService.createNovelProject(project)
  novelMirror.scheduleUpsert(saved)
  return saved
}

export function listNovelProjects() {
  return storageService
    .listNovelProjects()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
}

export function getNovelProject(id) {
  const project = storageService.getNovelProject(id)
  if (!project) throw new Error(`Novel project not found: ${id}`)
  return project
}

export function updateNovelProject(id, patch = {}) {
  const project = getNovelProject(id)
  Object.assign(project, patch, { updatedAt: new Date().toISOString() })
  const saved = storageService.updateNovelProject(project)
  novelMirror.scheduleUpsert(saved)
  return saved
}

/**
 * 从实际数据重算 counts（章节/角色/实体/季/集）。
 * 增量更新一旦被覆盖（如数据清理）就会漂移，导致页面显示「章 0」等；用本函数纠正。
 * 角色/实体按“当前选中集合”计数，避免历史集合虚高。
 */
export function recomputeNovelCounts(id) {
  const project = getNovelProject(id)
  const liveC = new Set(storageService.listNovelCharacters(id).map((c) => c.id))
  const liveW = new Set(storageService.listWorldEntities(id).map((e) => e.id))
  const setC = project.selectedCharacterSet ? storageService.getCharacterSet(project.selectedCharacterSet) : null
  const setW = project.selectedWorldSet ? storageService.getWorldSet(project.selectedWorldSet) : null
  const characters = setC ? (setC.characterIds || []).filter((x) => liveC.has(x)).length : liveC.size
  const worldEntities = setW ? (setW.entityIds || []).filter((x) => liveW.has(x)).length : liveW.size
  return updateNovelProject(id, {
    counts: {
      ...project.counts,
      chapters: storageService.listNovelChunks(id).length,
      characters,
      worldEntities,
      seasons: storageService.listSeasons(id).length,
      episodes: storageService.listEpisodes(id).length,
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
export function advanceStage(id, toStage) {
  const project = getNovelProject(id)
  const cur = stageIndex(project.stage)
  const to = toStage ? stageIndex(toStage) : cur + 1
  if (to < 0 || to >= STAGES.length) throw new Error('无效阶段')
  if (to <= cur) throw new Error(`不能回退阶段（当前 ${project.stage}）`)
  project.stage = STAGES[to]
  project.updatedAt = new Date().toISOString()
  return storageService.updateNovelProject(project)
}

/**
 * 删除小说项目：db 级联清理 + 全部落盘目录清理（不可恢复）。
 * 覆盖 novels/<id>、exports/novels/<id>、images|videos|audio/novels/<id>。
 */
export function deleteNovelProject(id) {
  getNovelProject(id)
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
  const db = storageService.deleteNovelProjectCascade(id)
  novelMirror.scheduleDelete(id)
  return { id, deleted: db.deleted, removedDirs, removedRecords: db.removed }
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
