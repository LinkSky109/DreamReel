#!/usr/bin/env node
/**
 * 校验 API 文档页（web/src/pages/Docs.tsx）声明的端点是否真实存在于后端路由。
 *
 * - 只校验 Docs 中列出的端点，避免要求全部 300+ 路由都写进文档。
 * - 路径参数名归一化为 :param（Docs 用 :id，后端用 :projectId 等）。
 * - 任何文档端点在后端不存在 → 退出码 1。
 *
 * 用法：node scripts/check-docs-endpoints.js [--all]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const ROUTES_DIR = path.join(ROOT, 'src', 'routes')
const DOCS_FILE = path.join(ROOT, 'web', 'src', 'pages', 'Docs.tsx')
const showAll = process.argv.includes('--all')

function read(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
}

function findAppFile() {
  for (const file of ['src/app.js', 'src/server.js']) {
    const full = path.join(ROOT, file)
    if (fs.existsSync(full)) return full
  }
  return null
}

function normalize(endpoint) {
  const [method, rawPath] = endpoint.split(' ')
  let p = rawPath.split('?')[0].trim()
  if (p.length > 1) p = p.replace(/\/+$/, '')
  p = p.replace(/:[A-Za-z0-9_]+/g, ':param')
  return `${method} ${p}`
}

function mountsFromApp(src) {
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
    mounts.push({ prefix, file: imports.get(routerVar) })
  }
  return mounts
}

function mountsFromIndex() {
  const src = read(path.join(ROUTES_DIR, 'index.js'))
  if (!src) return []
  const imports = new Map()
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/([\w.-]+\.js)'/g)) {
    imports.set(m[1], m[2])
  }
  const mounts = []
  for (const m of src.matchAll(/\{\s*path:\s*'([^']+)'[^}]*router:\s*(\w+)/g)) {
    if (!imports.has(m[2])) continue
    mounts.push({ prefix: `/api${m[1]}`, file: imports.get(m[2]) })
  }
  return mounts
}

function backendRoutes() {
  const appFile = findAppFile()
  if (!appFile) throw new Error('未找到 src/app.js 或 src/server.js')
  const src = read(appFile)
  const mounts = src.includes('mountApi') ? mountsFromIndex() : mountsFromApp(src)
  if (!mounts.length) throw new Error('未解析到 API 挂载表')
  const routes = new Map()
  for (const mount of mounts) {
    const routeSrc = read(path.join(ROUTES_DIR, mount.file))
    for (const r of routeSrc.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const full = normalize(`${r[1].toUpperCase()} ${mount.prefix}${r[2]}`)
      routes.set(full, `src/routes/${mount.file}`)
    }
  }
  return routes
}

function documentedRoutes() {
  const src = read(DOCS_FILE)
  if (!src) throw new Error(`未找到文档页：${path.relative(ROOT, DOCS_FILE)}`)
  const out = []
  for (const m of src.matchAll(/\[\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*'([^']+)'/g)) {
    if (!m[2].startsWith('/api/')) continue
    out.push({ raw: `${m[1]} ${m[2]}`, normalized: normalize(`${m[1]} ${m[2]}`) })
  }
  return out
}

const backend = backendRoutes()
const docs = documentedRoutes()
const missing = docs.filter((item) => !backend.has(item.normalized))
const undocumented = [...backend.keys()].filter(
  (key) => !docs.some((item) => item.normalized === key)
)

console.log(`后端端点：${backend.size}`)
console.log(`文档端点：${docs.length}`)
console.log(`文档缺失：${missing.length}`)
console.log(`未写入文档：${undocumented.length}`)

if (missing.length) {
  console.error('\n文档中声明但后端不存在的端点：')
  for (const item of missing) console.error(`  - ${item.raw}  (${item.normalized})`)
}
if (showAll && undocumented.length) {
  console.log('\n未写入文档的后端端点：')
  for (const item of undocumented) console.log(`  - ${item}`)
}

process.exit(missing.length ? 1 : 0)
