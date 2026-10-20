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
}

function legacyImpl(data = docs) {
  return { list: (kind) => (data[kind] || []).map((d) => ({ ...d })) }
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
