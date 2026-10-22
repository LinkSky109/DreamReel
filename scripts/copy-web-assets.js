#!/usr/bin/env node
/**
 * 仅用于前后端分离构建（npm run build:web → web/dist）：
 * 把仓库 `public/` 下的非 Vite 静态资源复制到独立产物，避免在 web/public 里维护第二份。
 * 单进程构建（npm run build → public/）不需要本脚本，静态资源本来就在 public/。
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
