import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import { getNovelProject, novelDir } from './novelProjectService.js'

/**
 * 剧集包清单 + 存储同步（Sprint 23 / S23-2）
 * - 清单：novels/<id>/** + exports/novels/<id>/**
 * - 本地同步：复制到目标目录（真实）
 * - 夸克网盘：dry-run（返回计划）；真实上传需 QUARK_COOKIE，未实现（留口，参考 ai-manga-factory）
 * - ledger：记录已同步，避免重复
 */

function walk(dir, base = dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) out.push(...walk(abs, base))
    else out.push({ rel: path.relative(base, abs), abs, size: stat.size })
  }
  return out
}

export function buildManifest(novelId) {
  getNovelProject(novelId)
  const files = walk(novelDir(novelId)).filter((f) => !f.rel.startsWith(`sync${path.sep}`))
  const exportDir = path.join(config.storage.path, 'exports', 'novels', novelId)
  for (const f of walk(exportDir)) {
    files.push({ rel: path.join('exports', f.rel), abs: f.abs, size: f.size })
  }
  // 媒体产物（图/视频/音）
  const mediaRoots = [
    ['images', path.join(config.storage.path, 'images', 'novels', novelId)],
    ['videos', path.join(config.storage.path, 'videos', 'novels', novelId)],
    ['audio', path.join(config.storage.path, 'audio', 'voices', 'novels', novelId)],
  ]
  for (const [base, dir] of mediaRoots) {
    for (const f of walk(dir)) {
      files.push({ rel: path.join(base, f.rel), abs: f.abs, size: f.size })
    }
  }
  return files
}

function writeLedger(novelId, entry) {
  const dir = path.join(novelDir(novelId), 'sync')
  fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, 'ledger.json')
  const cur = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf-8')) : { entries: [] }
  cur.entries.push(entry)
  fs.writeFileSync(p, JSON.stringify(cur, null, 2))
  return p
}

/** 本地同步（真实复制） */
export function syncToLocal(novelId, targetDir, { dryRun = false } = {}) {
  const manifest = buildManifest(novelId)
  const plan = manifest.map((f) => ({ rel: f.rel, size: f.size }))
  if (dryRun) return { backend: 'local', dryRun: true, targetDir, files: plan }
  const dest = path.join(targetDir, novelId)
  for (const f of manifest) {
    const out = path.join(dest, f.rel)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.copyFileSync(f.abs, out)
  }
  writeLedger(novelId, {
    backend: 'local',
    targetDir: dest,
    at: new Date().toISOString(),
    fileCount: manifest.length,
  })
  return { backend: 'local', targetDir: dest, copied: manifest.length }
}

/** 夸克网盘同步：dry-run 可用；真实上传留口 */
export function syncToQuark(novelId, { dryRun = true, cookie } = {}) {
  const manifest = buildManifest(novelId)
  const plan = manifest.map((f) => ({ rel: f.rel, size: f.size }))
  if (dryRun) {
    return { backend: 'quark', dryRun: true, files: plan, fileCount: plan.length }
  }
  const ck = cookie || process.env.QUARK_COOKIE
  if (!ck) {
    throw new Error('夸克网盘真实上传需 QUARK_COOKIE（cookie 登录）；未提供，未执行上传')
  }
  // 真实上传尚未实现（参考 ai-manga-factory：cookie + dry-run + ledger + 冲突重试；其 Quark 真实上传曾遇 TLS EOF）
  throw new Error('夸克网盘真实上传尚未实现（dry-run 可用）；参考 ai-manga-factory 方案接入')
}

export function getLedger(novelId) {
  const p = path.join(novelDir(novelId), 'sync', 'ledger.json')
  if (!fs.existsSync(p)) return { entries: [] }
  return JSON.parse(fs.readFileSync(p, 'utf-8'))
}
