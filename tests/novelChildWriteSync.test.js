import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyChildUpsert,
  applyChildDelete,
  applyChildDeleteStates,
} from '../src/services/novelChildWriteSync.js'
import { getPool, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL

/**
 * legacy/dual 镜像类已随写模式删除；
 * 保留的 applyChild* 是离线迁移/恢复工具，测试只覆盖 PostgreSQL 契约。
 */
describe('novelChildWriteSync · PostgreSQL apply 工具', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_child_write_${Date.now()}`
  const novelId = `${orgId}-n1`

  before(async () => {
    await getPool().query(
      'INSERT INTO organizations (id,name,slug,plan) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [orgId, '子集合写测试', orgId, 'free']
    )
    await getPool().query(
      `INSERT INTO novels (id,org_id,title,status,payload) VALUES ($1,$2,'子集写','draft','{}'::jsonb)
       ON CONFLICT (id) DO NOTHING`,
      [novelId, orgId]
    )
  })

  after(async () => {
    await getPool().query('DELETE FROM organizations WHERE id = $1', [orgId])
    await closeDb()
  })

  it('九类集合 upsert 后可查询，删除/复活语义正确', async () => {
    const pool = await getPool()
    const docs = {
      chunks: { id: `${novelId}-k`, novelId, index: 0, text: '正文' },
      characters: { id: `${novelId}-c`, novelId, name: '甲', description: '主角' },
      entities: { id: `${novelId}-e`, novelId, name: '废土', type: 'location' },
      seasons: { id: `${novelId}-s`, novelId, seasonNo: 1, title: '第一季' },
      episodes: { id: `${novelId}-ep`, novelId, seasonId: `${novelId}-s`, episodeNo: 1, title: '第一集' },
      assets: { id: `${novelId}-a`, novelId, category: 'character', name: '甲', status: 'draft' },
      states: { id: `${novelId}-st`, novelId, characterId: `${novelId}-c`, episodeNo: 1, appearance: '少年' },
      characterSets: { id: `${novelId}-cs`, novelId, provider: 'llm', characterIds: ['c'] },
      worldSets: { id: `${novelId}-ws`, novelId, provider: 'llm', entityIds: ['e'] },
    }
    for (const [kind, doc] of Object.entries(docs)) {
      await applyChildUpsert(pool, kind, doc, orgId)
    }

    const counts = await pool.query(
      `SELECT
        (SELECT count(*) FROM novel_chunks WHERE novel_id=$1) AS chunks,
        (SELECT count(*) FROM novel_characters WHERE novel_id=$1) AS characters,
        (SELECT count(*) FROM novel_world_entities WHERE novel_id=$1) AS entities,
        (SELECT count(*) FROM seasons WHERE novel_id=$1) AS seasons,
        (SELECT count(*) FROM episodes WHERE novel_id=$1) AS episodes,
        (SELECT count(*) FROM novel_asset_images WHERE novel_id=$1) AS assets,
        (SELECT count(*) FROM novel_character_states WHERE novel_id=$1) AS states,
        (SELECT count(*) FROM character_sets WHERE novel_id=$1) AS character_sets,
        (SELECT count(*) FROM world_sets WHERE novel_id=$1) AS world_sets`,
      [novelId]
    )
    assert.equal(counts.rows[0].chunks, '1')
    assert.equal(counts.rows[0].characters, '1')
    assert.equal(counts.rows[0].entities, '1')
    assert.equal(counts.rows[0].seasons, '1')
    assert.equal(counts.rows[0].episodes, '1')
    assert.equal(counts.rows[0].assets, '1')
    assert.equal(counts.rows[0].states, '1')
    assert.equal(counts.rows[0].character_sets, '1')
    assert.equal(counts.rows[0].world_sets, '1')

    await applyChildDelete(pool, 'characters', `${novelId}-c`, orgId)
    const deleted = await pool.query('SELECT deleted_at FROM novel_characters WHERE id=$1', [`${novelId}-c`])
    assert.ok(deleted.rows[0].deleted_at)

    await applyChildUpsert(pool, 'characters', { id: `${novelId}-c`, novelId, name: '甲-复活' }, orgId)
    const revived = await pool.query('SELECT name, deleted_at FROM novel_characters WHERE id=$1', [`${novelId}-c`])
    assert.equal(revived.rows[0].name, '甲-复活')
    assert.equal(revived.rows[0].deleted_at, null)

    await applyChildDeleteStates(pool, novelId, orgId, `${novelId}-c`)
    const stateDeleted = await pool.query('SELECT deleted_at FROM novel_character_states WHERE id=$1', [`${novelId}-st`])
    assert.ok(stateDeleted.rows[0].deleted_at)
  })
})
