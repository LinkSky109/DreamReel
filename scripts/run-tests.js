import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import 'dotenv/config'
import {
  dropTestDatabase,
  prepareTestDatabase,
  redactUrl,
} from './lib/test-postgres.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devDbPath = path.join(repoRoot, 'storage', 'data', 'db.json')
const testRoot = path.join(repoRoot, 'storage', 'test-run')
const setupPath = path.join(repoRoot, 'tests', 'setup-isolated-storage.js')

/**
 * 开发库（非小说域仍为 JSON）隔离基线。
 * 小说域已全部走 PostgreSQL；这里只检查 db.json 中的非小说集合没有被测试写脏。
 */
function readCounts() {
  try {
    const data = JSON.parse(fs.readFileSync(devDbPath, 'utf-8'))
    return {
      projects: Object.keys(data.projects || {}).length,
      studios: Object.keys(data.studios || {}).length,
      imageAssets: Object.keys(data.imageAssets || {}).length,
    }
  } catch {
    return { projects: 0, studios: 0, imageAssets: 0 }
  }
}

// 测试库是硬前置：小说域测试必须读写 PostgreSQL，不再有 JSON/legacy 兜底。
let testTarget
try {
  testTarget = await prepareTestDatabase()
} catch (error) {
  console.error(`[test-db] 测试库准备失败：${error.message}`)
  console.error(
    '[test-db] 需要 DATABASE_URL（可另设 TEST_DATABASE_URL，库名必须以 _test 结尾）。' +
      '本套件已不使用 NOVEL_WRITE_MODE=legacy / SKIP_TEST_DB。'
  )
  process.exit(1)
}

const databaseUrlForTests = testTarget.testUrl
console.log(`[test-db] 已重建独立测试库 ${testTarget.testDb}：${redactUrl(databaseUrlForTests)}`)

const before = readCounts()
fs.rmSync(testRoot, { recursive: true, force: true })
fs.mkdirSync(testRoot, { recursive: true })

const testFiles = fs
  .readdirSync(path.join(repoRoot, 'tests'))
  .filter((file) => file.endsWith('.test.js'))
  .sort()
  .map((file) => path.join('tests', file))

const result = spawnSync(
  process.execPath,
  // 限制并发：默认按 CPU 数并行会同时跑多个 ffmpeg（mock 占位视频/成片），
  // 高负载下偶发 ffmpeg 失败导致 flaky（见 TICKET-27-04）。降到 4 提升稳定性。
  ['--test', '--test-concurrency=4', '--import', pathToFileURL(setupPath).href, ...testFiles],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      JWT_SECRET: 'test-jwt-secret-for-dreamreel-testing-only-32chars',
      // 测试必须确定性：强制 mock provider，避免 .env 里的真实 key 触发外网调用
      LLM_PROVIDER: 'mock',
      VIDEO_PROVIDER: 'mock',
      IMAGE_PROVIDER: 'mock',
      TTS_PROVIDER: 'mock',
      // 清空真实 key，保证 isProviderConfigured 断言稳定（不依赖本地 .env）
      OPENAI_API_KEY: '',
      OPENAI_IMAGE_API_KEY: '',
      SEEDANCE_API_KEY: '',
      RUNWAY_API_KEY: '',
      PIKA_API_KEY: '',
      MINIMAX_API_KEY: '',
      WAN_API_KEY: '',
      ELEVENLABS_API_KEY: '',
      // 非小说域仍用隔离的 JSON 存储；小说域只走 PostgreSQL 测试库。
      DB_DRIVER: 'json',
      NOVEL_WRITE_MODE: 'postgres',
      OUTBOX_ENABLED: 'false',
      REQUIRE_AUTH: 'false',
      DATABASE_URL: databaseUrlForTests,
      TEST_DATABASE_URL: databaseUrlForTests,
    },
  }
)

const after = readCounts()
fs.rmSync(testRoot, { recursive: true, force: true })

let cleanupError = null
try {
  await dropTestDatabase(testTarget)
  console.log(`[test-db] 已删除测试库 ${testTarget.testDb}`)
} catch (error) {
  cleanupError = error
  console.warn(`[test-db] 测试库清理失败：${error.message}`)
}

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}

if (
  before.projects !== after.projects ||
  before.studios !== after.studios ||
  before.imageAssets !== after.imageAssets
) {
  console.error(
    `[test-isolation] 开发库被污染：projects ${before.projects}->${after.projects}, ` +
      `studios ${before.studios}->${after.studios}, imageAssets ${before.imageAssets}->${after.imageAssets}`
  )
  process.exit(1)
}

if (cleanupError) process.exit(1)

console.log(
  `[test-isolation] OK：开发库未被修改（projects=${after.projects}, studios=${after.studios}, imageAssets=${after.imageAssets}）`
)
