import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  createJsonNovelRepository,
  createPostgresNovelRepository,
} from '../src/repositories/novelRepository.js'
import { migrate } from '../src/db/migrate.js'
import { getPool, getDb, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL

function jsonStore() {
  return { data: { novelProjects: {} }, save() {} }
}

async function assertContract(repo, orgId) {
  const base = {
    id: `${orgId}-n1`,
    title: '契约测试',
    author: 'tester',
    count: 3,
    style: { name: '废土' },
  }
  const created = await repo.create(base, { orgId })
  assert.equal(created.id, base.id)
  assert.equal(created.orgId, orgId)
  assert.equal(created.version, 1)
  assert.equal(created.count, 3)
  assert.equal(created.deletedAt, null)

  const found = await repo.findById(base.id, { orgId })
  assert.equal(found.title, '契约测试')
  assert.deepEqual(found.style, { name: '废土' })

  assert.equal(await repo.findById(base.id, { orgId: 'other-org' }), null)

  await assert.rejects(() => repo.create(base, { orgId }), (error) => error.code === 'CONFLICT')

  const updated = await repo.update(base.id, { title: '改名', extra: 'x' }, { orgId, expectedVersion: 1 })
  assert.equal(updated.title, '改名')
  assert.equal(updated.version, 2)
  assert.equal(updated.extra, 'x')
  assert.equal(updated.count, 3)

  await assert.rejects(
    () => repo.update(base.id, { title: '冲突' }, { orgId, expectedVersion: 1 }),
    (error) => error.code === 'CONFLICT'
  )

  const listed = await repo.list({ orgId })
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, base.id)

  assert.equal(await repo.softDelete(base.id, { orgId }), true)
  assert.equal(await repo.findById(base.id, { orgId }), null)
  assert.equal(await repo.softDelete(base.id, { orgId }), false)
  assert.equal((await repo.list({ orgId })).length, 0)
  assert.equal((await repo.list({ orgId, includeDeleted: true })).length, 1)
}

describe('NovelRepository 契约 · JSON 适配器', () => {
  it('满足创建/查询/更新/软删契约', async () => {
    const repo = createJsonNovelRepository(jsonStore())
    await assertContract(repo, 'org_json')
  })
})

describe('NovelRepository 契约 · PostgreSQL 适配器', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_pg_test_${Date.now()}`
  let repo

  before(async () => {
    await migrate({ url: DATABASE_URL })
    await getPool().query(
      'INSERT INTO organizations (id, name, slug, plan) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
      [orgId, 'PG 测试', orgId, 'free']
    )
    repo = createPostgresNovelRepository(getDb())
  })

  after(async () => {
    await getPool().query('DELETE FROM organizations WHERE id = $1', [orgId])
    await closeDb()
  })

  it('满足创建/查询/更新/软删契约', async () => {
    await assertContract(repo, orgId)
  })
})
