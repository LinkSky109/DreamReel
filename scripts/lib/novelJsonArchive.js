import fs from 'node:fs'
import path from 'node:path'
import config from '../../src/config/index.js'

/**
 * Phase 3c：小说集合不再写回 storage/data/db.json。
 * 旧数据在首次 PG 水合时归档到 storage/archive/novels-from-db-*.json。
 *
 * 迁移/恢复脚本通过这里读取最新的 JSON 快照，避免依赖已经被清空的 db.json。
 */

export const NOVEL_ARCHIVE_KEYS = [
  'novelProjects',
  'novelChunks',
  'novelCharacters',
  'novelCharacterStates',
  'seriesSeasons',
  'seriesEpisodes',
  'novelWorldEntities',
  'novelAssetImages',
  'characterSets',
  'worldSets',
]

export function archiveDir() {
  return path.resolve(config.storage.path, 'archive')
}

export function findLatestNovelArchive(dir = archiveDir()) {
  try {
    const files = fs
      .readdirSync(dir)
      .filter((name) => /^novels-from-db-.*\.json$/.test(name))
      .sort()
    if (!files.length) return null
    return path.join(dir, files[files.length - 1])
  } catch {
    return null
  }
}

export function loadNovelArchive(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
  const collections = raw.collections && typeof raw.collections === 'object' ? raw.collections : raw
  return { file, collections }
}

export function findNovelArchive(novelId, dir = archiveDir()) {
  try {
    const files = fs.readdirSync(dir)
      .filter((name) => /^novels-from-db-.*\.json$/.test(name))
      .map((name) => ({ name, mtime: fs.statSync(path.join(dir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    for (const { name } of files) {
      const file = path.join(dir, name)
      try {
        const loaded = loadNovelArchive(file)
        if (loaded.collections?.novelProjects?.[novelId]) return file
      } catch {
        // ignore corrupt archive and continue
      }
    }
  } catch {
    // ignore
  }
  return null
}

export function mergeNovelArchive(storage, file) {
  const loaded = loadNovelArchive(file)
  for (const key of NOVEL_ARCHIVE_KEYS) {
    if (loaded.collections[key]) storage.data[key] = loaded.collections[key]
  }
  return loaded
}

/**
 * 解析 JSON 来源：
 * - 显式 --from / NOVEL_JSON_ARCHIVE
 * - 否则 storage 里已有小说集合（db.json 旧格式）时直接用
 * - 否则自动使用最新归档
 */
export function resolveNovelJsonSource(storage, explicit = null, novelId = null) {
  if (explicit) {
    const file = path.resolve(explicit)
    if (!fs.existsSync(file)) throw new Error(`找不到 JSON 归档：${file}`)
    return mergeNovelArchive(storage, file)
  }
  if (novelId && storage?.data?.novelProjects?.[novelId]) {
    return { file: null, collections: null }
  }
  const target = novelId ? findNovelArchive(novelId) : findLatestNovelArchive()
  if (!target) {
    throw new Error(
      `db.json/归档中不存在小说：${novelId || '(unknown)'}；找不到 storage/archive/novels-from-db-*.json`
    )
  }
  return mergeNovelArchive(storage, target)
}
