import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import { storageService } from './storageService.js'
import { NovelProject } from '../models/NovelProject.js'

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
  return storageService.createNovelProject(project)
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
  return storageService.updateNovelProject(project)
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
