#!/usr/bin/env node
/**
 * R3-T3.9：后端路由 ↔ 前端 api.ts 端点比对。
 * - 前端调用了后端不存在的端点 → 退出码 1（CI 死链报警）
 * - 后端存在但前端未调用 → 仅统计（开放 API、管理面等正常存在）
 *
 * 用法：node scripts/check-api-contract.js [--all]
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ROUTES_DIR = path.join(ROOT, 'src', 'routes')
const API_FILE = path.join(ROOT, 'web', 'src', 'lib', 'api.ts')
const showAll = process.argv.includes('--all')

const read = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '')

function resolveTemplate(rawPath) {
  let out = ''
  let i = 0
  while (i < rawPath.length) {
    if (rawPath[i] === '$' && rawPath[i + 1] === '{') {
      let depth = 0
      let j = i + 1
      for (; j < rawPath.length; j++) {
        if (rawPath[j] === '{') depth += 1
        else if (rawPath[j] === '}') {
          depth -= 1
          if (depth === 0) {
            j += 1
            break
          }
        }
      }
      if (out.endsWith('/')) out += ':param'
      i = j
      continue
    }
    out += rawPath[i]
    i += 1
  }
  return out
}

function normalize(endpoint) {
  const [method, rawPath] = endpoint.trim().split(/\s+/)
  let p = resolveTemplate(rawPath).split('?')[0].trim()
  p = p.replace(/:[A-Za-z0-9_]+/g, ':param')
  p = p.replace(/\/{2,}/g, '/').replace(/\/+$/, '')
  if (!p.startsWith('/')) p = `/${p}`
  return `${method.toUpperCase()} ${p}`
}

function mountsFromIndex() {
  const src = read(path.join(ROUTES_DIR, 'index.js'))
  const imports = new Map()
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+'\.\/([\w.-]+\.js)'/g)) imports.set(m[1], m[2])
  const mounts = []
  for (const m of src.matchAll(/\{\s*path:\s*'([^']+)'[^}]*router:\s*(\w+)/g)) {
    if (imports.has(m[2])) mounts.push({ prefix: `/api${m[1]}`, file: imports.get(m[2]) })
  }
  return mounts
}

function backendRoutes() {
  const routes = new Map()
  for (const mount of mountsFromIndex()) {
    const src = read(path.join(ROUTES_DIR, mount.file))
    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']*)'/g)) {
      const key = normalize(`${m[1].toUpperCase()} ${mount.prefix}${m[2]}`)
      routes.set(key, `src/routes/${mount.file}`)
    }
  }
  return routes
}

function frontendRoutes() {
  const src = read(API_FILE)
  if (!src) throw new Error('未找到 web/src/lib/api.ts')
  const out = []
  const callRe = /(?:request|requestData)\s*(?:<[\s\S]*?>)?\s*\(\s*([`'"])([\s\S]*?)\1/g
  let match
  while ((match = callRe.exec(src))) {
    const rawPath = match[2]
    if (!rawPath.startsWith('/')) continue
    const after = src.slice(match.index + match[0].length, match.index + match[0].length + 200)
    const method = after.match(/^\s*,\s*\{[^}]*?method:\s*'([A-Za-z]+)'/)?.[1] || 'GET'
    const fullPath = rawPath.startsWith('/api/') ? rawPath : `/api${rawPath}`
    out.push({ raw: `${method} ${rawPath}`, normalized: normalize(`${method} ${fullPath}`) })
  }
  return out
}

const backend = backendRoutes()
const frontend = frontendRoutes()
const missing = frontend.filter((item) => !backend.has(item.normalized))
const unused = [...backend.keys()].filter((key) => !frontend.some((item) => item.normalized === key))

console.log(`后端端点：${backend.size}`)
console.log(`前端调用：${frontend.length}`)
console.log(`前端死链：${missing.length}`)
console.log(`前端未覆盖：${unused.length}`)

if (missing.length) {
  console.error('\n前端调用但后端不存在的端点：')
  for (const item of missing) console.error(`  - ${item.raw}  (${item.normalized})`)
}
if (showAll && unused.length) {
  console.log('\n后端存在但前端未调用：')
  for (const item of unused) console.log(`  - ${item}`)
}

process.exit(missing.length ? 1 : 0)
