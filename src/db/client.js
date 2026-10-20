import pg from 'pg'
import { Kysely, PostgresDialect } from 'kysely'
import config from '../config/index.js'
import { databaseUrl } from './config.js'

const { Pool } = pg

let pool = null
let db = null

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl(),
      max: config.db.poolMax,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    })
    pool.on('error', (error) => {
      // 空闲连接异常不应导致进程退出
      console.error('[db] idle client error:', error.message)
    })
  }
  return pool
}

export function getDb() {
  if (!db) {
    db = new Kysely({
      dialect: new PostgresDialect({ pool: getPool() }),
    })
  }
  return db
}

export async function healthCheck() {
  const result = await getPool().query('select 1 as ok')
  return result.rows[0]?.ok === 1
}

export async function closeDb() {
  if (db) {
    await db.destroy().catch(() => {})
    db = null
    pool = null
    return
  }
  if (pool) {
    await pool.end().catch(() => {})
    pool = null
  }
}
