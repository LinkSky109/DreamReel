import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresNovelChildRepository } from '../src/repositories/novelChildRepository.js'
import { getPool, getDb, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL

describe('NovelChildRepository · PostgreSQL', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_child_test_${Date.now()}`
  const novelId = `${orgId}-novel`
  let repo

  before(async () => {
    await getPool().query(
      'INSERT INTO organizations (id, name, slug, plan) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [orgId, '子集合测试', orgId, 'free']
    )
    await getPool().query(
      `INSERT INTO novels (id, org_id, title, status, payload)
       VALUES ($1,$2,'子集合测试','draft','{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [novelId, orgId]
    )
    await getPool().query(
      `INSERT INTO novel_chunks (id, org_id, novel_id, idx, content, payload)
       VALUES ($1,$2,$3,0,'第一章正文','{"chapterTitle":"开端","wordCount":5}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-k1`, orgId, novelId]
    )
    await getPool().query(
      `INSERT INTO novel_characters (id, org_id, novel_id, name, payload)
       VALUES ($1,$2,$3,'甲','{"description":"主角","status":"draft"}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-c1`, orgId, novelId]
    )
    await getPool().query(
      `INSERT INTO novel_world_entities (id, org_id, novel_id, name, kind, payload)
       VALUES ($1,$2,$3,'废土','location','{"description":"末世"}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-e1`, orgId, novelId]
    )
    repo = createPostgresNovelChildRepository(getDb())
  })

  after(async () => {
    await getPool().query('DELETE FROM organizations WHERE id = $1', [orgId])
    await closeDb()
  })

  it('chunks 映射 index/text 与 payload', async () => {
    const rows = await repo.list('chunks', novelId, { orgId })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].index, 0)
    assert.equal(rows[0].text, '第一章正文')
    assert.equal(rows[0].chapterTitle, '开端')
  })

  it('characters 映射 name 与 payload', async () => {
    const rows = await repo.list('characters', novelId, { orgId })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, '甲')
    assert.equal(rows[0].description, '主角')
  })

  it('entities 映射 name/type', async () => {
    const rows = await repo.list('entities', novelId, { orgId })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, '废土')
    assert.equal(rows[0].type, 'location')
  })

  it('按 org 隔离', async () => {
    const rows = await repo.list('chunks', novelId, { orgId: 'other' })
    assert.equal(rows.length, 0)
  })
})
