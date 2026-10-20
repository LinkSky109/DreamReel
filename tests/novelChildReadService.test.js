import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createNovelChildReadService } from '../src/services/novelChildReadService.js'

const docs = {
  chunks: [
    { id: 'k1', novelId: 'n1', index: 0, text: '第一章', chapterTitle: '开端' },
    { id: 'k2', novelId: 'n1', index: 1, text: '第二章', chapterTitle: '发展' },
  ],
  characters: [{ id: 'c1', novelId: 'n1', name: '甲', description: '主角' }],
  entities: [{ id: 'e1', novelId: 'n1', name: '废土', type: 'location' }],
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
    { id: 'cs1', provider: 'llm', createdAt: '2026-01-01T00:00:00.000Z', characterIds: ['c1', 'c2'] },
    { id: 'cs2', provider: 'llm', createdAt: '2026-02-01T00:00:00.000Z', characterIds: ['c1'] },
  ],
  worldSets: [{ id: 'ws1', provider: 'llm', createdAt: '2026-01-01T00:00:00.000Z', entityIds: ['e1'] }],
}

const project = {
  characterSets: ['cs2', 'cs1'],
  selectedCharacterSet: 'cs1',
  worldSets: ['ws1'],
  selectedWorldSet: 'ws1',
}

function legacyImpl(data = docs) {
  return {
    list: (kind) => (data[kind] || []).map((d) => ({ ...d })),
    listSets: (kind) =>
      (setsData[kind] || []).map((set) => ({
        id: set.id,
        provider: set.provider,
        createdAt: set.createdAt,
        count: (set.characterIds || set.entityIds || []).length,
        live: 1,
        selected: set.id === project.selectedCharacterSet || set.id === project.selectedWorldSet,
      })),
  }
}

function repoImpl(data = docs) {
  return { list: async (kind) => (data[kind] || []).map((d) => ({ ...d })) }
}

function loggerStub() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

describe('novelChildReadService', () => {
  it('legacy：不访问 PostgreSQL', async () => {
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => {
        throw new Error('should not be called')
      },
      mode: 'legacy',
    })
    const rows = await service.list('chunks', 'n1')
    assert.equal(rows.length, 2)
  })

  it('shadow：一致时无告警', async () => {
    const log = loggerStub()
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(),
      mode: 'shadow',
      log,
    })
    const rows = await service.list('characters', 'n1', { requestId: 'r1' })
    assert.equal(rows.length, 1)
    assert.equal(log.warnings.length, 0)
  })

  it('shadow：漂移时告警并返回 legacy', async () => {
    const log = loggerStub()
    const drifted = { ...docs, characters: [{ ...docs.characters[0], name: '乙' }] }
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(drifted),
      mode: 'shadow',
      log,
    })
    const rows = await service.list('characters', 'n1', { requestId: 'r2' })
    assert.equal(rows[0].name, '甲')
    assert.equal(log.warnings.length, 1)
    assert.match(log.warnings[0][0], /mismatch/)
    assert.equal(log.warnings[0][1].kind, 'characters')
  })

  it('postgres：返回仓库结果', async () => {
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(),
      mode: 'postgres',
    })
    const rows = await service.list('entities', 'n1')
    assert.equal(rows[0].id, 'e1')
  })

  it('仓库异常回退 legacy 并告警', async () => {
    const log = loggerStub()
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => ({
        list: async () => {
          throw new Error('db down')
        },
      }),
      mode: 'postgres',
      log,
    })
    const rows = await service.list('chunks', 'n1', { requestId: 'r3' })
    assert.equal(rows.length, 2)
    assert.match(log.warnings[0][0], /回退 legacy/)
  })
})

describe('novelChildReadService · 季/集/设定图', () => {
  it('postgres：季按 seasonNo 升序', async () => {
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(),
      mode: 'postgres',
    })
    const rows = await service.list('seasons', 'n1')
    assert.deepEqual(rows.map((r) => r.id), ['s1', 's2'])
  })

  it('postgres：集按 seasonId 过滤并按 episodeNo 升序', async () => {
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(),
      mode: 'postgres',
    })
    const rows = await service.list('episodes', 'n1', { seasonId: 's1' })
    assert.deepEqual(rows.map((r) => r.id), ['ep11', 'ep12'])
  })

  it('postgres：设定图按类别过滤且 createdAt 降序', async () => {
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(),
      mode: 'postgres',
    })
    const all = await service.list('assets', 'n1')
    assert.deepEqual(all.map((r) => r.id), ['a2', 'a1'])
    const chars = await service.list('assets', 'n1', { category: 'character' })
    assert.deepEqual(chars.map((r) => r.id), ['a1'])
  })
})

describe('novelChildReadService · 形象状态', () => {
  it('postgres：按角色过滤并按 episodeNo 升序', async () => {
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(),
      mode: 'postgres',
    })
    const rows = await service.list('states', 'n1', { characterId: 'c1' })
    assert.deepEqual(rows.map((r) => r.id), ['st1', 'st2'])
  })
})

describe('novelChildReadService · 备选集合', () => {
  it('postgres：按项目 ID 顺序，计算 count/live/selected', async () => {
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl({ ...docs, ...setsData }),
      mode: 'postgres',
      getProject: () => project,
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

  it('shadow：不一致时告警并返回 legacy', async () => {
    const log = loggerStub()
    const drifted = { ...setsData, characterSets: [{ ...setsData.characterSets[0], provider: 'other' }] }
    const service = createNovelChildReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl({ ...docs, ...drifted }),
      mode: 'shadow',
      log,
      getProject: () => project,
    })
    const rows = await service.listSets('characterSets', 'n1', { requestId: 'r5' })
    assert.equal(rows[0].id, 'cs1')
    assert.equal(log.warnings.length, 1)
  })
})
