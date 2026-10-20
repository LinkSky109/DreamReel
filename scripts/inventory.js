#!/usr/bin/env node
/**
 * 生成架构清单文档（只读）：
 * - docs/architecture/route-inventory.md：挂载前缀 + 方法 + 路径 + 鉴权中间件
 * - docs/architecture/storage-inventory.md：db.json 集合规模 + storageService 调用点
 *
 * 用法：node scripts/inventory.js
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const ROUTES_DIR = path.join(ROOT, 'src', 'routes')
const DB_PATH = path.join(ROOT, 'storage', 'data', 'db.json')
const OUT_DIR = path.join(ROOT, 'docs', 'architecture')

function readIfExists(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
}

function findAppFile() {
  for (const f of ['src/app.js', 'src/server.js']) {
    const p = path.join(ROOT, f)
    if (fs.existsSync(p)) return p
  }
  return null
}

function routeMounts() {
  const indexFile = path.join(ROOT, 'src', 'routes', 'index.js')
  if (fs.existsSync(indexFile)) {
    const src = fs.readFileSync(indexFile, 'utf8')
    const imports = new Map()
    for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/([\w.-]+\.js)'/g)) {
      imports.set(m[1], m[2])
    }
    const mounts = []
    const re = /\{\s*path:\s*'([^']+)'\s*(?:,\s*middleware:\s*\[([^\]]*)\])?\s*,\s*router:\s*(\w+)\s*\}/g
    for (const m of src.matchAll(re)) {
      const routerVar = m[3]
      if (!imports.has(routerVar)) continue
      mounts.push({
        prefix: `/api${m[1]}`,
        file: imports.get(routerVar),
        middleware: (m[2] || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean),
        alias: '/api/v1',
      })
    }
    return { appFile: 'src/routes/index.js', mounts }
  }
  const appFile = findAppFile()
  if (!appFile) return { appFile: null, mounts: [] }
  const src = readIfExists(appFile)
  const imports = new Map()
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/routes\/([\w.-]+\.js)'/g)) {
    imports.set(m[1], m[2])
  }
  const mounts = []
  for (const m of src.matchAll(/app\.use\(\s*'([^']+)'\s*,\s*([^)]*)\)/g)) {
    const prefix = m[1]
    if (!prefix.startsWith('/api')) continue
    const args = m[2].split(',').map((s) => s.trim()).filter(Boolean)
    const routerVar = args[args.length - 1]
    if (!imports.has(routerVar)) continue
    mounts.push({
      prefix,
      file: imports.get(routerVar),
      middleware: args.slice(0, -1),
    })
  }
  return { appFile: path.relative(ROOT, appFile), mounts }
}

function routeEntries(file) {
  const src = readIfExists(path.join(ROUTES_DIR, file))
  const out = []
  const re = /router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g
  for (const m of src.matchAll(re)) out.push({ method: m[1].toUpperCase(), path: m[2] })
  return out
}

function buildRouteDoc() {
  const { appFile, mounts } = routeMounts()
  const lines = []
  lines.push('# 路由清单（自动生成）')
  lines.push('')
  lines.push(`生成时间：${new Date().toISOString()}`)
  lines.push(`挂载文件：\`${appFile || '未找到'}\``)
  lines.push('')
  lines.push('> 由 `node scripts/inventory.js` 生成，请勿手工编辑。')
  lines.push('')
  lines.push('## 挂载概览')
  lines.push('')
  lines.push('| 前缀 | 路由文件 | 中间件 | 端点数 |')
  lines.push('|---|---|---|---:|')
  let total = 0
  const detail = []
  for (const mount of mounts) {
    const entries = routeEntries(mount.file)
    total += entries.length
    lines.push(
      `| \`${mount.prefix}\` | \`src/routes/${mount.file}\` | ${mount.middleware.map((x) => `\`${x}\``).join(' ') || '—'} | ${entries.length} |`
    )
    detail.push({ mount, entries })
  }
  lines.push('')
  lines.push(`合计：**${mounts.length} 个挂载前缀，${total} 个端点**。`)
  lines.push('')
  lines.push(`> \`/api/v1\` 使用同一挂载表（另有 /api/v1/meta），共 ${total} 个端点；\`/api\` 保持兼容并返回 Deprecation 头。`)
  lines.push('')
  lines.push('## 鉴权分布')
  lines.push('')
  const anonymous = mounts.filter((m) => !m.middleware.some((x) => /authRequired/.test(x)))
  const optional = mounts.filter((m) => m.middleware.some((x) => /authOptional/.test(x)))
  const required = mounts.filter((m) => m.middleware.some((x) => /authRequired/.test(x)))
  lines.push(`- 显式 \`authRequired\`：${required.length} 个前缀`)
  lines.push(`- \`authOptional\`（可匿名）：${optional.length} 个前缀`)
  lines.push(`- 未挂鉴权中间件：${anonymous.length} 个前缀`)
  lines.push('')
  if (anonymous.length) {
    lines.push('未挂鉴权的 API 前缀：')
    for (const m of anonymous) lines.push(`- \`${m.prefix}\`（\`src/routes/${m.file}\`）`)
    lines.push('')
  }
  lines.push('## 端点明细')
  for (const { mount, entries } of detail) {
    lines.push('')
    lines.push(`### \`${mount.prefix}\` — \`src/routes/${mount.file}\``)
    lines.push('')
    for (const e of entries) {
      lines.push(`- \`${e.method}\` \`${mount.prefix}${e.path}\``)
    }
  }
  lines.push('')
  return { doc: lines.join('\n'), total, mounts: mounts.length }
}

function buildStorageDoc() {
  const lines = []
  lines.push('# 存储清单（自动生成）')
  lines.push('')
  lines.push(`生成时间：${new Date().toISOString()}`)
  lines.push('')
  lines.push('> 由 `node scripts/inventory.js` 生成，请勿手工编辑。')
  lines.push('')
  let db = null
  if (fs.existsSync(DB_PATH)) {
    const stat = fs.statSync(DB_PATH)
    db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'))
    lines.push(`## \`storage/data/db.json\``)
    lines.push('')
    lines.push(`- 文件大小：**${(stat.size / 1024 / 1024).toFixed(2)} MB**`)
    lines.push(`- 顶层键：${Object.keys(db).length}`)
    lines.push('')
    lines.push('| 集合 | 行数/键数 | 类型 |')
    lines.push('|---|---:|---|')
    const rows = Object.entries(db).map(([k, v]) => ({
      k,
      n: Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0,
      t: Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v,
    }))
    rows.sort((a, b) => b.n - a.n)
    for (const r of rows.slice(0, 40)) lines.push(`| \`${r.k}\` | ${r.n} | ${r.t} |`)
    lines.push('')
    lines.push(`（仅显示前 40 个，共 ${rows.length} 个集合）`)
  } else {
    lines.push('未找到 `storage/data/db.json`。')
  }
  lines.push('')
  lines.push('## storageService 调用点')
  lines.push('')
  const calls = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(p)
      else if (/\.(js|mjs)$/.test(entry.name)) {
        const src = fs.readFileSync(p, 'utf8')
        const n = (src.match(/\bstorageService\./g) || []).length
        if (n) calls.push({ file: path.relative(ROOT, p), n })
      }
    }
  }
  walk(path.join(ROOT, 'src'))
  calls.sort((a, b) => b.n - a.n)
  lines.push('| 文件 | 调用次数 |')
  lines.push('|---|---:|')
  for (const c of calls) lines.push(`| \`${c.file}\` | ${c.n} |`)
  lines.push('')
  lines.push(`合计：**${calls.length} 个文件，${calls.reduce((s, c) => s + c.n, 0)} 处**。`)
  lines.push('')
  return lines.join('\n')
}

fs.mkdirSync(OUT_DIR, { recursive: true })
const route = buildRouteDoc()
fs.writeFileSync(path.join(OUT_DIR, 'route-inventory.md'), `${route.doc}\n`)
fs.writeFileSync(path.join(OUT_DIR, 'storage-inventory.md'), `${buildStorageDoc()}\n`)
console.log(`route-inventory.md: ${route.mounts} mounts, ${route.total} endpoints`)
console.log('storage-inventory.md: written')
