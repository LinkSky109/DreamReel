#!/usr/bin/env node
/**
 * E2E 专用 API 进程：
 * - 独立 STORAGE_PATH（test-results/e2e-storage），每次启动重建，绝不写开发库
 * - 非小说域强制 JSON 存储；小说域使用独立 `_test` PostgreSQL 测试库
 * - 启动前重建测试库并执行迁移，结束后尽力删除测试库
 * - 强制 mock provider，避免外网依赖
 * - 未设置 JWT_SECRET 时生成一次性随机密钥
 *
 * 由 playwright.config.ts 的 webServer 启动，也可手动运行。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dropTestDatabase, prepareTestDatabase, redactUrl } from './lib/test-postgres.js'

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

let testTarget
try {
  testTarget = await prepareTestDatabase()
  console.log(`[e2e-server] 测试库已就绪：${testTarget.testDb} ${redactUrl(testTarget.testUrl)}`)
} catch (error) {
  console.error(`[e2e-server] 测试库准备失败：${error.message}`)
  console.error('[e2e-server] 需要 DATABASE_URL（可另设 TEST_DATABASE_URL，库名必须以 _test 结尾）')
  process.exit(1)
}

const child = spawn(process.execPath, ['src/server.js'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: process.env.E2E_API_PORT || '3301',
    STORAGE_PATH: storagePath,
    DB_DRIVER: 'json',
    REQUIRE_AUTH: 'false',
    LLM_PROVIDER: 'mock',
    VIDEO_PROVIDER: 'mock',
    IMAGE_PROVIDER: 'mock',
    TTS_PROVIDER: 'mock',
    JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
    DATABASE_URL: testTarget.testUrl,
    TEST_DATABASE_URL: testTarget.testUrl,
  },
})

let shuttingDown = false
let childExited = false

async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  if (!childExited) {
    child.kill(signal)
    // 等 API 进程释放连接后再删库；超时则继续，pg_terminate_backend 兜底。
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ])
  }
  try {
    await dropTestDatabase(testTarget)
    console.log(`[e2e-server] 已删除测试库 ${testTarget.testDb}`)
  } catch (error) {
    console.warn(`[e2e-server] 测试库清理失败：${error.message}`)
  }
  process.exit(0)
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    void shutdown(signal)
  })
}

child.on('exit', (code) => {
  childExited = true
  if (!shuttingDown) void shutdown('SIGTERM')
  else process.exitCode = code ?? 0
})
