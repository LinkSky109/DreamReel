import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { databaseUrl } from './config.js'

const { Client } = pg

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_DIR = path.join(__dirname, 'migrations')
// 固定 advisory lock key，避免并发迁移
const LOCK_KEY = 738201045

function checksum(text) {
  return crypto.createHash('sha256').update(text).digest('hex')
}

export function listMigrationFiles(dir = DEFAULT_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((file) => {
      const content = fs.readFileSync(path.join(dir, file), 'utf8')
      return { version: file.replace(/\.sql$/, ''), file, content, checksum: checksum(content) }
    })
}

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    text PRIMARY KEY,
      checksum   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
}

/**
 * 执行挂起的迁移。
 * @returns {{applied: string[], pending: string[], dryRun: boolean}}
 */
export async function migrate({ url = databaseUrl(), dir = DEFAULT_DIR, dryRun = false } = {}) {
  const files = listMigrationFiles(dir)
  const client = new Client({ connectionString: url })
  await client.connect()
  const applied = []
  const wouldApply = []
  try {
    await ensureTable(client)
    await client.query(`SELECT pg_advisory_lock(${LOCK_KEY}::bigint)`)
    const { rows } = await client.query('SELECT version, checksum FROM schema_migrations')
    const already = new Map(rows.map((r) => [r.version, r.checksum]))

    for (const migration of files) {
      const known = already.get(migration.version)
      if (known && known !== migration.checksum) {
        throw new Error(`迁移 ${migration.version} 校验和不一致：已应用内容被修改`)
      }
    }

    for (const migration of files) {
      if (already.has(migration.version)) continue
      if (dryRun) {
        wouldApply.push(migration.version)
        continue
      }
      await client.query('BEGIN')
      try {
        await client.query(migration.content)
        await client.query('INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)', [
          migration.version,
          migration.checksum,
        ])
        await client.query('COMMIT')
        applied.push(migration.version)
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error(`迁移 ${migration.version} 失败：${error.message}`)
      }
    }

    if (dryRun) return { applied: [], pending: wouldApply, dryRun: true }
    return { applied, pending: [], dryRun: false }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(${LOCK_KEY}::bigint)`).catch(() => {})
    await client.end()
  }
}

export async function status({ url = databaseUrl(), dir = DEFAULT_DIR } = {}) {
  const files = listMigrationFiles(dir)
  const client = new Client({ connectionString: url })
  await client.connect()
  try {
    await ensureTable(client)
    const { rows } = await client.query('SELECT version, applied_at FROM schema_migrations ORDER BY version')
    const appliedSet = new Set(rows.map((r) => r.version))
    return {
      applied: rows.map((r) => ({ version: r.version, appliedAt: r.applied_at })),
      pending: files.filter((f) => !appliedSet.has(f.version)).map((f) => f.version),
    }
  } finally {
    await client.end()
  }
}
