#!/usr/bin/env node
/**
 * 构建产物一致性检查（CI / gate build 使用）：
 * 校验入库的 public/index.html 确实指向本次构建出的 hashed 资源，
 * 且没有残留旧入口，避免“源码已改、public/ 未重建”的发布事故。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const ASSETS_DIR = path.join(PUBLIC_DIR, 'assets')
const INDEX_PATH = path.join(PUBLIC_DIR, 'index.html')

function fail(message) {
  console.error(`[check-web-build] FAIL: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(INDEX_PATH)) fail('缺少 public/index.html')
if (!fs.existsSync(ASSETS_DIR)) fail('缺少 public/assets（先执行 npm run build）')

const html = fs.readFileSync(INDEX_PATH, 'utf8')
if (html.includes('/src/main.tsx')) {
  fail('public/index.html 仍引用源码入口 /src/main.tsx，未经过 vite build')
}

const refs = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
if (refs.length === 0) fail('public/index.html 未引用任何 /assets/ 资源')

for (const ref of refs) {
  const file = path.join(PUBLIC_DIR, ref.replace(/^\//, ''))
  if (!fs.existsSync(file)) fail(`index.html 引用的资源不存在：${ref}`)
  if (fs.statSync(file).size === 0) fail(`index.html 引用的资源为空：${ref}`)
}

const entryJs = fs.readdirSync(ASSETS_DIR).filter((name) => /^index-.+\.js$/.test(name))
const entryCss = fs.readdirSync(ASSETS_DIR).filter((name) => /^index-.+\.css$/.test(name))
if (entryJs.length !== 1) fail(`public/assets 中入口 JS 应恰好 1 个，实际 ${entryJs.length} 个`)
if (entryCss.length > 1) fail(`public/assets 中入口 CSS 应至多 1 个，实际 ${entryCss.length} 个`)

for (const required of ['css/style.css', 'manifest.webmanifest', 'sw.js']) {
  if (!fs.existsSync(path.join(PUBLIC_DIR, required))) {
    fail(`缺少运行时静态资源 public/${required}`)
  }
}

console.log(`[check-web-build] OK: ${refs.length} 个 hashed 资源存在且入口唯一`)
