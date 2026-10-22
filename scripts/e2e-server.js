#!/usr/bin/env node
/**
 * E2E 专用 API 进程：
 * - 独立 STORAGE_PATH（test-results/e2e-storage），每次启动重建，绝不写开发库
 * - 强制 mock provider / JSON 存储 / legacy 小说域，避免外网与 PG 依赖
 * - 未设置 JWT_SECRET 时生成一次性随机密钥
 *
 * 由 playwright.config.ts 的 webServer 启动，也可手动运行。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const storagePath = path.join(repoRoot, 'test-results', 'e2e-storage')
const dataDir = path.join(storagePath, 'data')

// 只清理 E2E 自己的目录，避免误删外部路径。
if (!storagePath.includes(`${path.sep}test-results${path.sep}e2e-storage`)) {
  console.error(`[e2e-server] 拒绝使用非 E2E 存储路径：${storagePath}`)
  process.exit(1)
}
fs.rmSync(storagePath, { recursive: true, force: true })
fs.mkdirSync(dataDir, { recursive: true })
fs.writeFileSync(path.join(dataDir, 'db.json'), JSON.stringify({ projects: {}, users: {} }))

const child = spawn(process.execPath, ['src/server.js'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: process.env.E2E_API_PORT || '3301',
    STORAGE_PATH: storagePath,
    DB_DRIVER: 'json',
    NOVEL_WRITE_MODE: 'legacy',
    OUTBOX_ENABLED: 'false',
    REQUIRE_AUTH: 'false',
    LLM_PROVIDER: 'mock',
    VIDEO_PROVIDER: 'mock',
    IMAGE_PROVIDER: 'mock',
    TTS_PROVIDER: 'mock',
    JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
  },
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    child.kill(signal)
  })
}

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 0)
})
