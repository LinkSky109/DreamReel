import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { migrate } from '../src/db/migrate.js'
import { getPool, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL
const VERSION = '900_migrate_runner_test'

describe('迁移 runner', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dreamreel-migrate-'))
  const file = path.join(dir, `${VERSION}.sql`)

  after(async () => {
    await getPool().query('DROP TABLE IF EXISTS migrate_runner_test')
    await getPool().query('DELETE FROM schema_migrations WHERE version = $1', [VERSION])
    await closeDb()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('应用一次后幂等，改动已应用文件会被校验和拦截', async () => {
    fs.writeFileSync(file, 'CREATE TABLE IF NOT EXISTS migrate_runner_test (id text PRIMARY KEY);')

    const first = await migrate({ url: DATABASE_URL, dir })
    assert.deepEqual(first.applied, [VERSION])

    const second = await migrate({ url: DATABASE_URL, dir })
    assert.deepEqual(second.applied, [])

    fs.appendFileSync(file, '\n-- changed after apply\n')
    await assert.rejects(
      () => migrate({ url: DATABASE_URL, dir }),
      /校验和不一致/
    )
  })
})
