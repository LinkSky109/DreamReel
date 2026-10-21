import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'
import 'dotenv/config'
import pg from 'pg'
import { migrate } from '../src/db/migrate.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const devDbPath = path.join(repoRoot, 'storage', 'data', 'db.json')
const testRoot = path.join(repoRoot, 'storage', 'test-run')
const setupPath = path.join(repoRoot, 'tests', 'setup-isolated-storage.js')

const SAFE_DB_NAME = /^[A-Za-z0-9_]+$/

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

function redact(url) {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '(invalid database url)'
  }
}

/**
 * 派生测试库：
 * - 显式 TEST_DATABASE_URL 必须以 _test 结尾，避免误删共享库；
 * - 否则从 DATABASE_URL 的库名追加 _test。
 */
function resolveTestTarget() {
  const explicit = process.env.TEST_DATABASE_URL
  const source = explicit || process.env.DATABASE_URL
  if (!source) return null

  const url = new URL(source)
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!dbName) throw new Error('DATABASE_URL 缺少数据库名')

  const testDb = explicit ? dbName : dbName.endsWith('_test') ? dbName : `${dbName}_test`
  if (!testDb.endsWith('_test')) {
    throw new Error(`测试库名必须以 _test 结尾（当前：${testDb}），拒绝重建可能的共享库`)
  }
  if (!SAFE_DB_NAME.test(testDb)) {
    throw new Error(`测试库名包含不安全字符：${testDb}`)
  }

  const adminUrl = new URL(source)
  adminUrl.pathname = '/postgres'
  const testUrl = new URL(source)
  testUrl.pathname = `/${testDb}`

  return { adminUrl: adminUrl.toString(), testUrl: testUrl.toString(), testDb }
}

async function recreateTestDatabase({ adminUrl, testDb }) {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [testDb]
    )
    await client.query(`DROP DATABASE IF EXISTS "${testDb}"`)
    await client.query(`CREATE DATABASE "${testDb}"`)
  } finally {
    await client.end()
  }
}

async function dropTestDatabase({ adminUrl, testDb }) {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [testDb]
    )
    await client.query(`DROP DATABASE IF EXISTS "${testDb}"`)
  } finally {
    await client.end()
  }
}

let testTarget = null
let databaseUrlForTests = ''

if (process.env.SKIP_TEST_DB === '1') {
  console.log('[test-db] SKIP_TEST_DB=1，PostgreSQL 契约测试将跳过')
} else {
  try {
    testTarget = resolveTestTarget()
    if (testTarget) {
      await recreateTestDatabase(testTarget)
      await migrate({ url: testTarget.testUrl })
      databaseUrlForTests = testTarget.testUrl
      console.log(`[test-db] 已重建独立测试库 ${testTarget.testDb}：${redact(testTarget.testUrl)}`)
    } else {
      console.log('[test-db] 未配置 DATABASE_URL，PostgreSQL 契约测试将跳过')
    }
  } catch (error) {
    console.error(`[test-db] 测试库准备失败：${error.message}`)
    console.error('[test-db] 如只需运行 JSON 测试，请显式设置 SKIP_TEST_DB=1')
    if (testTarget) await dropTestDatabase(testTarget).catch(() => {})
    process.exit(1)
  }
}

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
      // 测试固定走 JSON 存储；PostgreSQL 契约测试使用独立测试库，绝不连开发库
      DB_DRIVER: 'json',
      NOVEL_REPO_MODE: 'legacy',
      NOVEL_WRITE_MODE: 'legacy',
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
if (testTarget) {
  try {
    await dropTestDatabase(testTarget)
    console.log(`[test-db] 已删除测试库 ${testTarget.testDb}`)
  } catch (error) {
    cleanupError = error
    console.warn(`[test-db] 测试库清理失败：${error.message}`)
  }
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
