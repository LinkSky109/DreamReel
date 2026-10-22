import pg from 'pg'
import { migrate } from '../../src/db/migrate.js'

/**
 * 测试用 PostgreSQL 生命周期（run-tests.js / e2e-server.js 共用）。
 *
 * 安全边界：
 * - 测试库名必须以 `_test` 结尾；
 * - 只 DROP/CREATE 解析出的测试库，绝不碰 DATABASE_URL 指向的业务库；
 * - 迁移只作用于测试库；
 * - 每次准备都会写入 default 组织，供小说域外键使用。
 */

const SAFE_DB_NAME = /^[A-Za-z0-9_]+$/
export const TEST_DB_SUFFIX = '_test'

export function redactUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = '***'
    return parsed.toString()
  } catch {
    return '(invalid database url)'
  }
}

/**
 * 派生测试库 URL：
 * - 显式 TEST_DATABASE_URL 必须以 _test 结尾；
 * - 否则从 DATABASE_URL 的库名追加 _test。
 */
export function resolveTestTarget(env = process.env) {
  const explicit = env.TEST_DATABASE_URL
  const source = explicit || env.DATABASE_URL
  if (!source) return null

  const url = new URL(source)
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''))
  if (!dbName) throw new Error('DATABASE_URL 缺少数据库名')

  const testDb = explicit ? dbName : dbName.endsWith(TEST_DB_SUFFIX) ? dbName : `${dbName}${TEST_DB_SUFFIX}`
  if (!testDb.endsWith(TEST_DB_SUFFIX)) {
    throw new Error(`测试库名必须以 ${TEST_DB_SUFFIX} 结尾（当前：${testDb}），拒绝重建可能的共享库`)
  }
  if (!SAFE_DB_NAME.test(testDb)) {
    throw new Error(`测试库名包含不安全字符：${testDb}`)
  }

  const adminUrl = new URL(source)
  adminUrl.pathname = '/postgres'
  const testUrl = new URL(source)
  testUrl.pathname = `/${testDb}`

  return { adminUrl: adminUrl.toString(), testUrl: testUrl.toString(), testDb, sourceDb: dbName }
}

async function withAdminClient(adminUrl, fn) {
  const client = new pg.Client({ connectionString: adminUrl })
  await client.connect()
  try {
    return await fn(client)
  } finally {
    await client.end()
  }
}

export async function recreateTestDatabase({ adminUrl, testDb }) {
  await withAdminClient(adminUrl, async (client) => {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [testDb]
    )
    await client.query(`DROP DATABASE IF EXISTS "${testDb}"`)
    await client.query(`CREATE DATABASE "${testDb}"`)
  })
}

export async function dropTestDatabase({ adminUrl, testDb }) {
  await withAdminClient(adminUrl, async (client) => {
    await client.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
      [testDb]
    )
    await client.query(`DROP DATABASE IF EXISTS "${testDb}"`)
  })
}

/** 迁移测试库并补齐 default 组织（小说域 FK 依赖）。 */
export async function migrateTestDatabase({ testUrl }) {
  await migrate({ url: testUrl })
  const client = new pg.Client({ connectionString: testUrl })
  await client.connect()
  try {
    await client.query(
      `INSERT INTO organizations (id, name, slug, plan)
       VALUES ('default', 'Default', 'default', 'free')
       ON CONFLICT (id) DO NOTHING`
    )
  } finally {
    await client.end()
  }
}

/**
 * 准备一个干净的测试库。
 * @returns {Promise<{adminUrl:string,testUrl:string,testDb:string,sourceDb:string}>}
 */
export async function prepareTestDatabase(env = process.env) {
  const target = resolveTestTarget(env)
  if (!target) {
    throw new Error(
      '缺少 DATABASE_URL（或 TEST_DATABASE_URL）：测试套件已迁移到 PostgreSQL，请提供测试库连接串'
    )
  }
  await recreateTestDatabase(target)
  await migrateTestDatabase({ testUrl: target.testUrl })
  return target
}
