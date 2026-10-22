import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createNovelChildReadService } from '../src/services/novelChildReadService.js'

const docs = {
  chunks: [
    { id: 'k1', novelId: 'n1', index: 0, text: '第一章', chapterTitle: '开端' },
    { id: 'k2', novelId: 'n1', index: 1, text: '第二章', chapterTitle: '发展' },
  ],
  characters: [{ id: 'c1', novelId: 'n1', name: '甲', description: '主角' }],
  entities: [
    { id: 'e1', novelId: 'n1', name: '废土', type: 'location', mentions: 2 },
    { id: 'e2', novelId: 'n1', name: '旧城', type: 'location', mentions: 5 },
  ],
  seasons: [
    { id: 's2', novelId: 'n1', seasonNo: 2, title: '第二季' },
    { id: 's1', novelId: 'n1', seasonNo: 1, title: '第一季' },
  ],
  episodes: [
    { id: 'ep12', novelId: 'n1', seasonId: 's1', episodeNo: 2, title: '第二集' },
    { id: 'ep11', novelId: 'n1', seasonId: 's1', episodeNo: 1, title: '第一集' },
    { id: 'ep21', novelId: 'n1', seasonId: 's2', episodeNo: 1, title: '另一季' },
  ],
  assets: [
    { id: 'a1', novelId: 'n1', category: 'character', name: '甲', status: 'draft', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'a2', novelId: 'n1', category: 'scene', name: '废墟', status: 'draft', createdAt: '2026-02-01T00:00:00.000Z' },
  ],
  states: [
    { id: 'st2', novelId: 'n1', characterId: 'c1', episodeNo: 5, appearance: '青年' },
    { id: 'st1', novelId: 'n1', characterId: 'c1', episodeNo: 1, appearance: '少年' },
    { id: 'st3', novelId: 'n1', characterId: 'c2', episodeNo: 2, appearance: '旁人' },
  ],
}

const setsData = {
  characterSets: [
    { id: 'cs1', novelId: 'n1', provider: 'llm', createdAt: '2026-01-01T00:00:00.000Z', characterIds: ['c1', 'c2'] },
    { id: 'cs2', novelId: 'n1', provider: 'llm', createdAt: '2026-02-01T00:00:00.000Z', characterIds: ['c1'] },
  ],
  worldSets: [{ id: 'ws1', novelId: 'n1', provider: 'llm', createdAt: '2026-01-01T00:00:00.000Z', entityIds: ['e1'] }],
}

const project = {
  characterSets: ['cs2', 'cs1'],
  selectedCharacterSet: 'cs1',
  worldSets: ['ws1'],
  selectedWorldSet: 'ws1',
}

function repoImpl(data = docs) {
  return { list: async (kind) => (data[kind] || []).map((d) => ({ ...d })) }
}

function loggerStub() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

describe('novelChildReadService（PostgreSQL only）', () => {
  it('chunks 按 index 排序', async () => {
    const service = createNovelChildReadService({ getRepo: () => repoImpl() })
    const rows = await service.list('chunks', 'n1')
    assert.deepEqual(rows.map((r) => r.id), ['k1', 'k2'])
  })

  it('entities 按 mentions 降序', async () => {
    const service = createNovelChildReadService({ getRepo: () => repoImpl() })
    const rows = await service.list('entities', 'n1')
    assert.deepEqual(rows.map((r) => r.id), ['e2', 'e1'])
  })

  it('季按 seasonNo 升序', async () => {
    const service = createNovelChildReadService({ getRepo: () => repoImpl() })
    const rows = await service.list('seasons', 'n1')
    assert.deepEqual(rows.map((r) => r.id), ['s1', 's2'])
  })

  it('集按 seasonId 过滤并按 episodeNo 升序', async () => {
    const service = createNovelChildReadService({ getRepo: () => repoImpl() })
    const rows = await service.list('episodes', 'n1', { seasonId: 's1' })
    assert.deepEqual(rows.map((r) => r.id), ['ep11', 'ep12'])
  })

  it('设定图按类别过滤且 createdAt 降序', async () => {
    const service = createNovelChildReadService({ getRepo: () => repoImpl() })
    const all = await service.list('assets', 'n1')
    assert.deepEqual(all.map((r) => r.id), ['a2', 'a1'])
    const chars = await service.list('assets', 'n1', { category: 'character' })
    assert.deepEqual(chars.map((r) => r.id), ['a1'])
  })

  it('形象状态按角色过滤并按 episodeNo 升序', async () => {
    const service = createNovelChildReadService({ getRepo: () => repoImpl() })
    const rows = await service.list('states', 'n1', { characterId: 'c1' })
    assert.deepEqual(rows.map((r) => r.id), ['st1', 'st2'])
  })

  it('备选集合按项目 ID 顺序，计算 count/live/selected', async () => {
    const service = createNovelChildReadService({
      getRepo: () => repoImpl({ ...docs, ...setsData }),
      getProjectAsync: async () => project,
    })
    const chars = await service.listSets('characterSets', 'n1')
    assert.deepEqual(chars.map((s) => s.id), ['cs2', 'cs1'])
    assert.equal(chars[0].count, 1)
    assert.equal(chars[0].live, 1)
    assert.equal(chars[0].selected, false)
    assert.equal(chars[1].count, 2)
    assert.equal(chars[1].live, 1)
    assert.equal(chars[1].selected, true)
  })

  it('仓库异常时直接报错并告警', async () => {
    const log = loggerStub()
    const service = createNovelChildReadService({
      getRepo: () => ({
        list: async () => {
          throw new Error('db down')
        },
      }),
      log,
    })
    await assert.rejects(() => service.list('chunks', 'n1', { requestId: 'r1' }), /db down/)
    assert.match(log.warnings[0][0], /postgres 读取失败/)
  })

  it('默认 PG：注入 legacy 适配器也不会回退', async () => {
    let legacyCalls = 0
    const legacy = {
      list: () => {
        legacyCalls += 1
        return [{ id: 'legacy-only' }]
      },
      listSets: () => {
        legacyCalls += 1
        return []
      },
    }
    const service = createNovelChildReadService({
      getRepo: () => repoImpl(),
      getProjectAsync: async () => project,
      legacy,
    })
    const rows = await service.list('seasons', 'n1')
    assert.deepEqual(rows.map((r) => r.id), ['s1', 's2'])
    assert.equal(legacyCalls, 0, 'PG 读路径不得触碰 legacy 适配器')
  })

  it('PG 报错时不得回退 legacy', async () => {
    let legacyCalls = 0
    const service = createNovelChildReadService({
      getRepo: () => ({
        list: async () => {
          throw new Error('pg unavailable')
        },
      }),
      getProjectAsync: async () => project,
      legacy: {
        list: () => {
          legacyCalls += 1
          return []
        },
        listSets: () => {
          legacyCalls += 1
          return []
        },
      },
      log: loggerStub(),
    })
    await assert.rejects(() => service.list('chunks', 'n1'), /pg unavailable/)
    assert.equal(legacyCalls, 0)
  })
})
