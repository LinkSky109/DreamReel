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
    await getPool().query(
      `INSERT INTO seasons (id, org_id, novel_id, season_no, title, payload, sort_order)
       VALUES ($1,$2,$3,1,'第一季','{"synopsis":"开端"}'::jsonb,0)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-s1`, orgId, novelId]
    )
    await getPool().query(
      `INSERT INTO episodes (id, org_id, novel_id, season_id, episode_no, title, payload, sort_order)
       VALUES ($1,$2,$3,$4,1,'第一集','{"status":"draft"}'::jsonb,0)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-ep1`, orgId, novelId, `${novelId}-s1`]
    )
    await getPool().query(
      `INSERT INTO novel_asset_images (id, org_id, novel_id, category, name, status, payload, sort_order)
       VALUES ($1,$2,$3,'character','甲','draft','{"prompt":"x"}'::jsonb,0)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-a1`, orgId, novelId]
    )
    await getPool().query(
      `INSERT INTO novel_character_states (id, org_id, novel_id, character_id, episode_no, appearance, equipment, payload, sort_order)
       VALUES ($1,$2,$3,$4,1,'少年','铁片','{"source":"llm"}'::jsonb,0)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-st1`, orgId, novelId, `${novelId}-c1`]
    )
    await getPool().query(
      `INSERT INTO character_sets (id, org_id, novel_id, provider, payload, sort_order)
       VALUES ($1,$2,$3,'llm','{"characterIds":["c1"]}'::jsonb,0)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-cs`, orgId, novelId]
    )
    await getPool().query(
      `INSERT INTO world_sets (id, org_id, novel_id, provider, payload, sort_order)
       VALUES ($1,$2,$3,'llm','{"entityIds":["e1"]}'::jsonb,0)
       ON CONFLICT (id) DO NOTHING`,
      [`${novelId}-ws`, orgId, novelId]
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

  it('seasons 映射 seasonNo/title', async () => {
    const rows = await repo.list('seasons', novelId, { orgId })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].seasonNo, 1)
    assert.equal(rows[0].title, '第一季')
    assert.equal(rows[0].synopsis, '开端')
  })

  it('episodes 映射 seasonId/episodeNo/title', async () => {
    const rows = await repo.list('episodes', novelId, { orgId })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].seasonId, `${novelId}-s1`)
    assert.equal(rows[0].episodeNo, 1)
    assert.equal(rows[0].title, '第一集')
  })

  it('assets 映射 category/name/status', async () => {
    const rows = await repo.list('assets', novelId, { orgId })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].category, 'character')
    assert.equal(rows[0].name, '甲')
    assert.equal(rows[0].status, 'draft')
    assert.equal(rows[0].prompt, 'x')
  })

  it('states 映射 characterId/episodeNo/appearance/equipment', async () => {
    const rows = await repo.list('states', novelId, { orgId })
    assert.equal(rows.length, 1)
    assert.equal(rows[0].characterId, `${novelId}-c1`)
    assert.equal(rows[0].episodeNo, 1)
    assert.equal(rows[0].appearance, '少年')
    assert.equal(rows[0].equipment, '铁片')
    assert.equal(rows[0].source, 'llm')
  })

  it('characterSets / worldSets 映射 provider 与 payload', async () => {
    const cs = await repo.list('characterSets', novelId, { orgId })
    assert.equal(cs.length, 1)
    assert.equal(cs[0].provider, 'llm')
    assert.deepEqual(cs[0].characterIds, ['c1'])
    const ws = await repo.list('worldSets', novelId, { orgId })
    assert.equal(ws.length, 1)
    assert.deepEqual(ws[0].entityIds, ['e1'])
  })

  it('按 org 隔离', async () => {
    const rows = await repo.list('chunks', novelId, { orgId: 'other' })
    assert.equal(rows.length, 0)
  })
})
