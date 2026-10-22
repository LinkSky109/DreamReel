import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 两个构建目标各自清理，避免互相覆盖：
// - 默认（npm run build）：清理 public/assets，这是单进程服务托管的入库产物。
// - WEB_OUT_DIR=dist（npm run build:web）：清理 web/dist，这是前后端分离部署产物。
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const WEB_DIR = path.join(ROOT, 'web')

const outDir = process.env.WEB_OUT_DIR
  ? path.resolve(WEB_DIR, process.env.WEB_OUT_DIR)
  : path.join(ROOT, 'public', 'assets')

const relative = path.relative(ROOT, outDir)
const insideWeb = relative === 'web' || relative.startsWith(`web${path.sep}`)
if (!insideWeb && path.resolve(outDir) !== path.join(ROOT, 'public', 'assets')) {
  console.error(`[web] 拒绝清理非构建目录：${outDir}`)
  process.exit(1)
}

fs.rmSync(outDir, { recursive: true, force: true })
console.log(`[web] cleaned ${relative}`)
