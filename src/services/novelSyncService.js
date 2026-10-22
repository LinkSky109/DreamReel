import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { fnv1a64Hex } from '../utils/hash.js'
import { runPool } from '../utils/pool.js'
import { WebdavClient, WebdavError, guessContentType } from './webdavClient.js'
import { QuarkClient, QuarkError } from './quarkClient.js'
import { loadCookie } from './quarkAuth.js'
import { novelDir } from './novelProjectService.js'

/**
 * 剧集包清单 + 通用存储同步内核（Sprint 23 / S23-2，Sprint 30 增强）
 *
 * 设计：
 * - 清单（buildManifest）：novels/<id>/** + exports/** + 媒体产物（图/视频/音）
 * - 同步内核（syncNovel）：一次同步 = 计划(增量) → 上传(并发+重试) → ledger(状态)
 *   · 增量去重：按 size + mtimeMs（小文件再加内容 hash）指纹，未变化则跳过
 *   · 冲突策略：overwrite（默认）/ skip
 *   · 失败不阻塞其它文件，报告 failed[]，下次重试继续
 * - 后端：
 *   · local  真实复制到本地目录
 *   · webdav 真实上传到 WebDAV / NAS（群晖 / Nextcloud / 坚果云）
 *   · quark  夸克网盘：dry-run 可用；真实上传需 QUARK_COOKIE（私有接口，留口）
 * - ledger：novels/<id>/sync/ledger.json，含历史 entries 与增量 state
 */

const HASH_MAX_BYTES = 1024 * 1024 // 1MB 以内的小文件做内容 hash，媒体大文件只看 size+mtime

const JUNK_NAMES = new Set(['.DS_Store', 'Thumbs.db', 'desktop.ini'])
const JUNK_SUFFIXES = ['.tmp', '.swp', '~']

/** 系统/编辑器垃圾文件不应进同步包 */
function isJunkFile(rel) {
  const base = rel.split(path.sep).pop() || ''
  if (!base) return false
  if (JUNK_NAMES.has(base)) return true
  if (base.startsWith('._')) return true
  return JUNK_SUFFIXES.some((suffix) => base.endsWith(suffix))
}

function walk(dir, base = dir) {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name)
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) out.push(...walk(abs, base))
    else {
      const rel = path.relative(base, abs)
      if (isJunkFile(rel)) continue
      out.push({ rel, abs, size: stat.size, mtimeMs: Math.round(stat.mtimeMs) })
    }
  }
  return out
}

/**
 * 同步范围预设（按清单里的顶层目录过滤）。
 * - deliverables（默认）：产物目录 + 文档目录
 *     产物：exports / images / videos / audio
 *     文档：characters / worldbuilding / art / assets / handoff
 *   排除内部工作数据：source（原文）/ chunks（切片索引）/ episodes（逐集原文切片）
 * - media：只要媒体产物
 * - all：全部（仍排除 sync/ 与系统垃圾文件）
 */
export const SYNC_SCOPES = {
  deliverables: {
    label: '产物 + 文档',
    dirs: ['exports', 'images', 'videos', 'audio', 'characters', 'worldbuilding', 'art', 'assets', 'handoff'],
  },
  media: {
    label: '仅产物',
    dirs: ['exports', 'images', 'videos', 'audio'],
  },
  all: { label: '全部', dirs: null },
}

export const DEFAULT_SYNC_SCOPE = 'deliverables'

export function resolveScope(scope) {
  const key = scope || config.sync?.scope || DEFAULT_SYNC_SCOPE
  const preset = SYNC_SCOPES[key]
  if (!preset) throw new Error(`unknown sync scope: ${key}（可选：${Object.keys(SYNC_SCOPES).join(' / ')}）`)
  return { key, ...preset }
}

function withScope(report, scope) {
  return { ...report, scope: resolveScope(scope).key }
}

function topSegment(rel) {
  return String(rel).split(path.sep)[0]
}

export function buildManifest(novelId, { scope } = {}) {
  const files = walk(novelDir(novelId)).filter((f) => !f.rel.startsWith(`sync${path.sep}`))
  const exportDir = path.join(config.storage.path, 'exports', 'novels', novelId)
  for (const f of walk(exportDir)) {
    files.push({ rel: path.join('exports', f.rel), abs: f.abs, size: f.size, mtimeMs: f.mtimeMs })
  }
  // 媒体产物（图/视频/音）
  const mediaRoots = [
    ['images', path.join(config.storage.path, 'images', 'novels', novelId)],
    ['videos', path.join(config.storage.path, 'videos', 'novels', novelId)],
    ['audio', path.join(config.storage.path, 'audio', 'voices', 'novels', novelId)],
  ]
  for (const [base, dir] of mediaRoots) {
    for (const f of walk(dir)) {
      files.push({ rel: path.join(base, f.rel), abs: f.abs, size: f.size, mtimeMs: f.mtimeMs })
    }
  }

  const { dirs } = resolveScope(scope)
  if (!dirs) return files
  const allowed = new Set(dirs)
  return files.filter((f) => allowed.has(topSegment(f.rel)))
}

// ---------- ledger ----------

function ledgerPath(novelId) {
  return path.join(novelDir(novelId), 'sync', 'ledger.json')
}

function readLedger(novelId) {
  const p = ledgerPath(novelId)
  if (!fs.existsSync(p)) return { entries: [], state: {} }
  try {
    const parsed = JSON.parse(fs.readFileSync(p, 'utf-8'))
    return { entries: parsed.entries || [], state: parsed.state || {} }
  } catch (error) {
    logger.warn(`同步 ledger 解析失败，已重建：${error.message}`)
    return { entries: [], state: {} }
  }
}

function writeLedger(novelId, ledger) {
  const dir = path.join(novelDir(novelId), 'sync')
  fs.mkdirSync(dir, { recursive: true })
  const p = ledgerPath(novelId)
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2))
  fs.renameSync(tmp, p)
  return p
}

export function getLedger(novelId) {
  const ledger = readLedger(novelId)
  return { entries: ledger.entries }
}

/** 读取某后端的增量状态（供 UI 展示「上次同步」） */
export function getSyncState(novelId) {
  const { entries, state } = readLedger(novelId)
  const last = entries[entries.length - 1] || null
  return { last, state }
}

function destKey(backend, target) {
  return `${backend}:${target}`
}

function fingerprint(file, { hash = true } = {}) {
  const fp = { size: file.size, mtimeMs: file.mtimeMs }
  if (hash && file.size <= HASH_MAX_BYTES) {
    try {
      fp.hash = fnv1a64Hex(fs.readFileSync(file.abs))
    } catch {
      /* 读失败则退回 size+mtime 判断 */
    }
  }
  return fp
}

function sameFingerprint(a, b) {
  if (!a || !b) return false
  if (a.size !== b.size || a.mtimeMs !== b.mtimeMs) return false
  if (a.hash && b.hash) return a.hash === b.hash
  return true
}

async function withRetry(fn, { retries = 2, baseDelayMs = 300 } = {}) {
  let lastError
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt)
    } catch (error) {
      lastError = error
      const retryable = error.retryable !== false
      if (attempt >= retries || !retryable) break
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * 2 ** attempt))
    }
  }
  throw lastError
}

// ---------- 同步内核 ----------

/**
 * 通用同步内核。
 * @param {string} novelId
 * @param {object} opts
 * @param {'local'|'webdav'} opts.backend
 * @param {boolean} [opts.dryRun]
 * @param {boolean} [opts.onlyChanged=true] 增量：只传变化的文件
 * @param {'overwrite'|'skip'} [opts.onConflict='overwrite']
 * @param {number} [opts.concurrency]
 * @param {number} [opts.retries]
 * @param {string} [opts.targetDir] local 目标目录
 * @param {object} [opts.webdav] webdav 连接参数（url/username/password/token/root/remoteDir/timeoutMs）
 */
/** 清单为空时不允许“假成功”：直接给出可操作的错误 */
function assertManifestNotEmpty(files, scope) {
  if (files.length > 0) return
  const preset = resolveScope(scope)
  throw new Error(
    `同步清单为空（范围：${preset.label}）：该项目没有可同步的产物。` +
      `请先生成剧本/资产/成片，或切换同步范围为「全部」。`
  )
}

export async function syncNovel(novelId, opts = {}) {
  const {
    backend,
    dryRun = false,
    onlyChanged = true,
    force = false,
    onConflict = 'overwrite',
    concurrency,
    retries,
    targetDir,
    webdav: webdavOpts = {},
  } = opts

  if (backend === 'webdav' && !resolveWebdavConfig(webdavOpts).url) {
    throw new Error('WebDAV 未配置：请设置 WEBDAV_URL（或请求体 url）')
  }

  const manifest = buildManifest(novelId, { scope: opts.scope })
  const files = manifest.map((f) => ({ ...f, relKey: f.rel.split(path.sep).join('/') }))
  assertManifestNotEmpty(files, opts.scope)

  if (backend === 'local') {
    return withScope(syncLocalCore(novelId, files, { dryRun, onlyChanged, force, onConflict, targetDir }), opts.scope)
  }
  if (backend === 'webdav') {
    return withScope(
      await syncWebdavCore(novelId, files, { dryRun, onlyChanged, force, onConflict, concurrency, retries, ...webdavOpts }),
      opts.scope
    )
  }
  if (backend === 'quark') {
    return withScope(
      await syncQuarkCore(novelId, files, { dryRun, onlyChanged, force, onConflict, concurrency, retries, ...opts.quark }),
      opts.scope
    )
  }
  throw new Error(`unknown backend: ${backend}`)
}

// ----- local -----

function syncLocalCore(novelId, files, { dryRun, onlyChanged, force = false, targetDir }) {
  if (!targetDir) throw new Error('targetDir required for local')
  const dest = path.join(targetDir, novelId)
  const key = destKey('local', dest)
  const ledger = readLedger(novelId)
  const prev = ledger.state[key] || {}
  const incremental = onlyChanged && !force

  const plan = files.map((f) => {
    const fp = fingerprint(f)
    const unchanged = incremental && sameFingerprint(prev[f.relKey], fp)
    return { rel: f.relKey, size: f.size, unchanged }
  })
  const pending = files.filter((f, i) => !plan[i].unchanged)

  if (dryRun) {
    return { backend: 'local', dryRun: true, targetDir: dest, files: plan, fileCount: plan.length, changed: pending.length }
  }

  const nextState = { ...prev }
  let copied = 0
  const failed = []
  for (let i = 0; i < pending.length; i++) {
    const f = pending[i]
    try {
      const out = path.join(dest, f.rel)
      fs.mkdirSync(path.dirname(out), { recursive: true })
      fs.copyFileSync(f.abs, out)
      nextState[f.relKey] = fingerprint(f)
      copied++
    } catch (error) {
      failed.push({ rel: f.relKey, error: error.message })
    }
  }

  ledger.state[key] = nextState
  ledger.entries.push({
    backend: 'local',
    targetDir: dest,
    at: new Date().toISOString(),
    fileCount: files.length,
    copied,
    skipped: files.length - pending.length,
    failed: failed.length,
  })
  writeLedger(novelId, ledger)
  return {
    backend: 'local',
    targetDir: dest,
    copied,
    skipped: files.length - pending.length,
    total: files.length,
    failed,
  }
}

// ----- webdav -----

function resolveWebdavConfig(overrides = {}) {
  const cfg = config.webdav || {}
  const has = (v) => v !== undefined && v !== null
  return {
    // 请求体显式传 url（含空串）优先；未传则回退环境配置
    url: has(overrides.url) ? overrides.url : cfg.url || '',
    username: has(overrides.username) && overrides.username !== '' ? overrides.username : cfg.username || '',
    password: has(overrides.password) && overrides.password !== '' ? overrides.password : cfg.password || '',
    token: overrides.token || cfg.token || '',
    root: overrides.root || cfg.root || 'DreamReel',
    timeoutMs: overrides.timeoutMs || cfg.timeoutMs || 60000,
  }
}

async function syncWebdavCore(novelId, files, opts) {
  const {
    dryRun = false,
    onlyChanged = true,
    force = false,
    onConflict = 'overwrite',
    concurrency = config.webdav?.concurrency || 3,
    retries = config.webdav?.retries ?? 2,
    remoteDir,
    verify = true,
  } = opts

  const conn = resolveWebdavConfig(opts)
  if (!conn.url) throw new Error('WebDAV 未配置：请设置 WEBDAV_URL（或请求体 url）')
  const client = new WebdavClient(conn)

  const targetRemoteDir = String(remoteDir || novelId).replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
  const fullRemoteDir = [conn.root, targetRemoteDir].filter(Boolean).join('/')
  const key = destKey('webdav', `${conn.url}/${fullRemoteDir}`)
  const ledger = readLedger(novelId)
  const prev = ledger.state[key] || {}
  const incremental = onlyChanged && !force

  const plan = []
  for (const f of files) {
    const fp = fingerprint(f)
    const unchanged = incremental && sameFingerprint(prev[f.relKey], fp)
    plan.push({ rel: f.relKey, size: f.size, unchanged })
  }
  const changed = files.filter((_, i) => !plan[i].unchanged)

  if (dryRun) {
    return {
      backend: 'webdav',
      dryRun: true,
      remoteDir: fullRemoteDir,
      url: conn.url,
      files: plan,
      fileCount: plan.length,
      changed: changed.length,
    }
  }

  const nextState = { ...prev }
  const failed = []
  const uploadedRels = []
  let uploaded = 0
  let skipped = 0

  let rootError = null
  try {
    await client.ensureCollection(targetRemoteDir)
  } catch (error) {
    rootError = error
  }

  if (rootError) {
    const detail = rootError instanceof WebdavError ? rootError.message : rootError.message
    for (const f of changed) failed.push({ rel: f.relKey, error: detail })
  } else {
    await runPool(changed, async (f) => {
      const remotePath = `${targetRemoteDir}/${f.relKey}`
      const remoteParent = remotePath.split('/').slice(0, -1).join('/')
      try {
        await client.ensureCollection(remoteParent)
        if (onConflict === 'skip') {
          const exists = await withRetry(() => client.exists(remotePath), { retries })
          if (exists) {
            nextState[f.relKey] = fingerprint(f)
            skipped++
            return { ok: true, skipped: true }
          }
        }
        await withRetry(() => client.putFile(remotePath, f.abs, { contentType: guessContentType(f.abs) }), { retries })
        nextState[f.relKey] = fingerprint(f)
        uploaded++
        uploadedRels.push(f.relKey)
        return { ok: true }
      } catch (error) {
        const detail = error instanceof WebdavError ? `${error.message}${error.retryable ? '（可重试）' : ''}` : error.message
        failed.push({ rel: f.relKey, error: detail })
        return { ok: false }
      }
    }, concurrency)
  }

  // 远端抽检：上传成功后 HEAD 抽查（默认最多 10 个），避免“本地报成功、远端没文件”
  let remoteCheck = null
  if (verify && !rootError && uploadedRels.length) {
    const sample = uploadedRels.slice(0, 10)
    const missing = []
    for (const rel of sample) {
      try {
        const ok = await client.exists(`${targetRemoteDir}/${rel}`)
        if (!ok) missing.push(rel)
      } catch (error) {
        missing.push(`${rel}（${error.message}）`)
      }
    }
    remoteCheck = { checked: sample.length, missing, ok: missing.length === 0 }
    if (missing.length) {
      logger.warn(`WebDAV 远端校验失败：${missing.length}/${sample.length} 个文件不存在`)
    }
  }

  ledger.state[key] = nextState
  ledger.entries.push({
    backend: 'webdav',
    url: conn.url,
    remoteDir: fullRemoteDir,
    at: new Date().toISOString(),
    fileCount: files.length,
    uploaded,
    skipped: files.length - changed.length + skipped,
    failed: failed.length,
  })
  writeLedger(novelId, ledger)

  logger.info(`WebDAV 同步完成 novel=${novelId} uploaded=${uploaded} skipped=${files.length - changed.length + skipped} failed=${failed.length}`)

  return {
    backend: 'webdav',
    url: conn.url,
    remoteDir: fullRemoteDir,
    uploaded,
    skipped: files.length - changed.length + skipped,
    total: files.length,
    bytes: changed.reduce((sum, f) => sum + f.size, 0),
    failed,
    remoteCheck,
  }
}

// ---------- 兼容旧接口（本地 / 夸克） ----------
/** 本地同步（真实复制，增量） */
export function syncToLocal(novelId, target, { dryRun = false, scope, force = false } = {}) {
  const files = buildManifest(novelId, { scope }).map((f) => ({ ...f, relKey: f.rel.split(path.sep).join('/') }))
  assertManifestNotEmpty(files, scope)
  return withScope(syncLocalCore(novelId, files, { dryRun, onlyChanged: true, force, targetDir: target }), scope)
}

/** WebDAV / NAS 同步（真实上传，增量） */
export async function syncToWebdav(novelId, opts = {}) {
  // 配置缺失优先于清单为空报错：用户应先补齐连接信息
  if (!resolveWebdavConfig(opts).url) throw new Error('WebDAV 未配置：请设置 WEBDAV_URL（或请求体 url）')
  const files = buildManifest(novelId, { scope: opts.scope }).map((f) => ({ ...f, relKey: f.rel.split(path.sep).join('/') }))
  assertManifestNotEmpty(files, opts.scope)
  return syncWebdavCore(novelId, files, opts).then((r) => withScope(r, opts.scope))
}

// ----- quark（私有接口，cookie 登录） -----

function resolveQuarkConfig(overrides = {}) {
  const cfg = config.quark || {}
  const has = (v) => v !== undefined && v !== null
  // 优先级：请求体 > 环境变量 > 扫码登录落盘的 cookie 文件
  const cookie = has(overrides.cookie)
    ? overrides.cookie
    : cfg.cookie || (cfg.cookieFile ? loadCookie(cfg.cookieFile) : '')
  return {
    cookie,
    root: overrides.root || cfg.root || 'DreamReel',
    apiBase: overrides.apiBase || cfg.apiBase,
    ossHost: overrides.ossHost || cfg.ossHost,
    ossUrl: overrides.ossUrl,
    fetchImpl: overrides.fetchImpl,
    partSize: overrides.partSize || cfg.partSize,
    timeoutMs: overrides.timeoutMs || cfg.timeoutMs,
  }
}

/** 递归列出夸克远端目录下的文件相对路径（有上限，防异常目录拖死同步） */
async function walkQuarkRemote(client, fid, prefix, out, depth = 0) {
  if (depth > 8 || out.size >= 5000) return
  let page = 1
  for (;;) {
    const { list } = await client.listFiles(fid, { page, size: 200 })
    if (!list.length) return
    for (const item of list) {
      const name = item.file_name || item.name || ''
      const rel = prefix ? `${prefix}/${name}` : name
      const isFolder = String(item.file_type) === '0' || item.dir === true
      if (isFolder) await walkQuarkRemote(client, item.fid, rel, out, depth + 1)
      else out.add(rel)
      if (out.size >= 5000) return
    }
    if (list.length < 200) return
    page += 1
  }
}

async function syncQuarkCore(novelId, files, opts = {}) {
  const {
    dryRun = false,
    onlyChanged = true,
    force = false,
    onConflict = 'overwrite',
    concurrency = config.quark?.concurrency || 1,
    retries = config.quark?.retries ?? 2,
    remoteDir,
    verify = true,
    client: injectedClient,
  } = opts

  const conn = resolveQuarkConfig(opts)
  const targetRemoteDir = String(remoteDir || novelId)
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
  const remotePrefix = [conn.root, targetRemoteDir].filter(Boolean)
  const key = destKey('quark', remotePrefix.join('/'))
  const ledger = readLedger(novelId)
  const prev = ledger.state[key] || {}
  const incremental = onlyChanged && !force

  const plan = files.map((f) => {
    const fp = fingerprint(f)
    return { rel: f.relKey, size: f.size, unchanged: incremental && sameFingerprint(prev[f.relKey], fp) }
  })
  const changed = files.filter((_, i) => !plan[i].unchanged)

  if (dryRun) {
    return {
      backend: 'quark',
      dryRun: true,
      remoteDir: remotePrefix.join('/'),
      files: plan,
      fileCount: plan.length,
      changed: changed.length,
    }
  }

  if (!injectedClient && !conn.cookie) {
    throw new QuarkError('夸克网盘真实上传需 QUARK_COOKIE（cookie 登录）；未提供，未执行上传')
  }
  const client = injectedClient || new QuarkClient(conn)

  const nextState = { ...prev }
  const failed = []
  let uploaded = 0
  let skipped = 0

  // 即使本次没有变更，也确保远端根目录存在，便于后续核对。
  // 失败（如 cookie 失效）不直接抛出，转为逐文件失败上报，与增量/冲突语义一致。
  let rootError = null
  try {
    await client.ensureFolder(remotePrefix, '0')
  } catch (error) {
    rootError = error
  }

  if (rootError) {
    const detail = rootError instanceof QuarkError ? `${rootError.message}${rootError.retryable ? '（可重试）' : ''}` : rootError.message
    for (const f of changed) failed.push({ rel: [...remotePrefix, f.relKey].join('/'), error: detail })
  } else {
    await runPool(changed, async (f) => {
    const segments = f.relKey.split('/')
    const fileName = segments.pop()
    const dirParts = [...remotePrefix, ...segments]
    const remotePath = [...remotePrefix, f.relKey].join('/')
    try {
      const dirFid = await client.ensureFolder(dirParts, '0')
      const existing = await client.findChild(dirFid, fileName, { folder: false })
      if (existing) {
        if (onConflict === 'skip') {
          nextState[f.relKey] = fingerprint(f)
          skipped++
          return { ok: true, skipped: true }
        }
        // 覆盖：先删同名（夸克同名会新建副本，不会覆盖）
        await withRetry(() => client.deleteFiles([existing.fid]), { retries })
      }
      await withRetry(
        () => client.uploadFile(f.abs, dirFid, { mimeType: guessContentType(f.abs) }),
        { retries }
      )
      nextState[f.relKey] = fingerprint(f)
      uploaded++
      return { ok: true }
    } catch (error) {
      const detail = error instanceof QuarkError ? `${error.message}${error.retryable ? '（可重试）' : ''}` : error.message
      failed.push({ rel: remotePath, error: detail })
      return { ok: false }
    }
    }, concurrency)
  }

  // 远端核对：递归列出目标目录，比对清单，避免“本地报成功、远端没文件”。
  // 夸克列表有索引延迟（大文件刚传完可能暂时不入列表），缺失时等待后重试一次，避免误报。
  let remoteCheck = null
  if (verify && !rootError) {
    const expected = files.map((f) => f.relKey)
    const diffOnce = async () => {
      const found = new Set()
      const rootFid = await client.ensureFolder(remotePrefix, '0')
      await walkQuarkRemote(client, rootFid, '', found)
      const present = expected.filter((rel) => found.has(rel) || found.has(`${targetRemoteDir}/${rel}`))
      return { present, missing: expected.filter((rel) => !present.includes(rel)) }
    }
    try {
      let { present, missing } = await diffOnce()
      if (missing.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        ;({ present, missing } = await diffOnce())
      }
      remoteCheck = {
        expected: expected.length,
        found: present.length,
        missing: missing.slice(0, 30),
        ok: missing.length === 0,
      }
      if (missing.length) {
        logger.warn(`夸克远端校验：期望 ${expected.length}，实际命中 ${present.length}，缺失 ${missing.length}`)
      }
    } catch (error) {
      remoteCheck = { error: error.message }
      logger.warn(`夸克远端校验失败（不影响本次上传结果）：${error.message}`)
    }
  }

  ledger.state[key] = nextState
  ledger.entries.push({
    backend: 'quark',
    remoteDir: remotePrefix.join('/'),
    at: new Date().toISOString(),
    fileCount: files.length,
    uploaded,
    skipped: files.length - changed.length + skipped,
    failed: failed.length,
  })
  writeLedger(novelId, ledger)

  logger.info(`夸克网盘同步完成 novel=${novelId} uploaded=${uploaded} skipped=${files.length - changed.length + skipped} failed=${failed.length}`)

  return {
    backend: 'quark',
    remoteDir: remotePrefix.join('/'),
    uploaded,
    skipped: files.length - changed.length + skipped,
    total: files.length,
    bytes: changed.reduce((sum, f) => sum + f.size, 0),
    failed,
    remoteCheck,
  }
}

/** 夸克网盘同步：真实上传（需 cookie）或 dry-run */
export function syncToQuark(novelId, opts = {}) {
  const files = buildManifest(novelId, { scope: opts.scope }).map((f) => ({ ...f, relKey: f.rel.split(path.sep).join('/') }))
  assertManifestNotEmpty(files, opts.scope)
  return syncQuarkCore(novelId, files, opts).then((r) => withScope(r, opts.scope))
}
