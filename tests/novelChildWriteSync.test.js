import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createNovelChildWriteSync } from '../src/services/novelChildWriteSync.js'
import { getPool, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL

function fakePool() {
  const calls = []
  return {
    calls,
    query: async (sql, params) => {
      calls.push({ sql, params })
      return { rows: [] }
    },
  }
}

function loggerStub() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

const chunk = { id: 'k1', novelId: 'n1', index: 0, text: '正文', chapterTitle: '开端', createdAt: '2026-01-01T00:00:00.000Z' }

describe('novelChildWriteSync', () => {
  it('legacy：不入队、不连库', async () => {
    const sync = createNovelChildWriteSync({
      mode: 'legacy',
      getPool: () => {
        throw new Error('should not be called')
      },
    })
    assert.equal(sync.enabled, false)
    sync.scheduleUpsert('chunks', chunk)
    sync.scheduleDelete('chunks', 'k1')
    assert.equal(sync.pending(), 0)
  })

  it('dual：同 id 多次写入合并为一次', async () => {
    const pool = fakePool()
    const sync = createNovelChildWriteSync({ mode: 'dual', getPool: async () => pool, orgId: 'org_x' })
    sync.scheduleUpsert('chunks', chunk)
    sync.scheduleUpsert('chunks', { ...chunk, text: '正文-改' })
    assert.equal(sync.pending(), 1)
    await sync.flush()
    assert.equal(pool.calls.length, 1)
    const { sql, params } = pool.calls[0]
    assert.match(sql, /INSERT INTO novel_chunks/)
    assert.match(sql, /ON CONFLICT \(id\) DO UPDATE/)
    assert.equal(params[0], 'k1')
    assert.equal(params[1], 'org_x')
    assert.equal(params[4], '正文-改')
  })

  it('dual：删除与按作品级删除', async () => {
    const pool = fakePool()
    const sync = createNovelChildWriteSync({ mode: 'dual', getPool: async () => pool })
    sync.scheduleDelete('assets', 'a1')
    sync.scheduleDeleteByNovel('n1')
    await sync.flush()
    assert.equal(pool.calls.length, 10) // 1 单条 + 9 类
    assert.match(pool.calls[0].sql, /WHERE id = \$1/)
    assert.match(pool.calls[1].sql, /WHERE novel_id = \$1/)
  })

  it('dual：失败只告警，不抛出', async () => {
    const log = loggerStub()
    const sync = createNovelChildWriteSync({
      mode: 'dual',
      getPool: async () => ({
        query: async () => {
          throw new Error('pg down')
        },
      }),
      log,
    })
    sync.scheduleUpsert('chunks', chunk)
    await sync.flush()
    assert.equal(log.warnings.length, 1)
    assert.match(log.warnings[0][0], /flush 失败/)
  })
})

describe('novelChildWriteSync · 真实 PostgreSQL', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
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

  it('六类集合 upsert 后可查询，软删除生效', async () => {
    const sync = createNovelChildWriteSync({ mode: 'dual', getPool, orgId })
    sync.scheduleUpsert('chunks', { id: `${novelId}-k`, novelId, index: 0, text: '正文' })
    sync.scheduleUpsert('characters', { id: `${novelId}-c`, novelId, name: '甲', description: '主角' })
    sync.scheduleUpsert('entities', { id: `${novelId}-e`, novelId, name: '废土', type: 'location' })
    sync.scheduleUpsert('seasons', { id: `${novelId}-s`, novelId, seasonNo: 1, title: '第一季' })
    sync.scheduleUpsert('episodes', { id: `${novelId}-ep`, novelId, seasonId: `${novelId}-s`, episodeNo: 1, title: '第一集' })
    sync.scheduleUpsert('assets', { id: `${novelId}-a`, novelId, category: 'character', name: '甲', status: 'draft' })
    sync.scheduleUpsert('states', { id: `${novelId}-st`, novelId, characterId: `${novelId}-c`, episodeNo: 1, appearance: '少年' })
    sync.scheduleUpsert('characterSets', { id: `${novelId}-cs`, novelId, provider: 'llm', characterIds: ['c'] })
    sync.scheduleUpsert('worldSets', { id: `${novelId}-ws`, novelId, provider: 'llm', entityIds: ['e'] })
    await sync.flush()

    const counts = await getPool().query(
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
    assert.deepEqual(counts.rows[0].chunks, '1')
    assert.deepEqual(counts.rows[0].episodes, '1')
    assert.deepEqual(counts.rows[0].states, '1')
    assert.deepEqual(counts.rows[0].character_sets, '1')
    assert.deepEqual(counts.rows[0].world_sets, '1')

    sync.scheduleDelete('characters', `${novelId}-c`)
    await sync.flush()
    const deleted = await getPool().query('SELECT deleted_at FROM novel_characters WHERE id=$1', [`${novelId}-c`])
    assert.ok(deleted.rows[0].deleted_at)

    sync.scheduleUpsert('characters', { id: `${novelId}-c`, novelId, name: '甲-复活' })
    await sync.flush()
    const revived = await getPool().query('SELECT name, deleted_at FROM novel_characters WHERE id=$1', [`${novelId}-c`])
    assert.equal(revived.rows[0].name, '甲-复活')
    assert.equal(revived.rows[0].deleted_at, null)

    sync.scheduleDeleteStates(novelId, `${novelId}-c`)
    await sync.flush()
    const stateDeleted = await getPool().query('SELECT deleted_at FROM novel_character_states WHERE id=$1', [`${novelId}-st`])
    assert.ok(stateDeleted.rows[0].deleted_at)
  })
})
