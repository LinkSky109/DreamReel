#!/usr/bin/env node
/**
 * 独立前端构建的静态资源补全：
 * 把仓库 `public/` 下"源码型"静态资源复制到构建产物，避免在 web/public 里维护第二份。
 * 由 `npm run build:web` 在 vite build 之后调用。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const PUBLIC_DIR = path.join(ROOT, 'public')
const OUT_DIR = path.join(ROOT, process.env.WEB_OUT_DIR || 'web/dist')

const ITEMS = ['css', 'icons', 'media', 'manifest.webmanifest', 'sw.js', 'docs.html']

if (!fs.existsSync(OUT_DIR)) {
  console.error(`[copy-web-assets] 构建目录不存在：${OUT_DIR}`)
  process.exit(1)
}

let copied = 0
for (const item of ITEMS) {
  const src = path.join(PUBLIC_DIR, item)
  if (!fs.existsSync(src)) {
    console.warn(`[copy-web-assets] 跳过不存在的资源：public/${item}`)
    continue
  }
  fs.cpSync(src, path.join(OUT_DIR, item), { recursive: true })
  copied += 1
}
console.log(`[copy-web-assets] 已复制 ${copied} 项到 ${path.relative(ROOT, OUT_DIR)}`)
