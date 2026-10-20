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
