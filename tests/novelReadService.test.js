import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createNovelReadService } from '../src/services/novelReadService.js'

const legacyRows = [
  { id: 'n1', title: 'A', status: 'draft', stage: 'source', counts: { a: 1, b: 2 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
  { id: 'n2', title: 'B', status: 'done', stage: 'compose', counts: { a: 3 }, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
]

function legacyImpl(rows = legacyRows, getRow = (id) => rows.find((r) => r.id === id) || null) {
  return {
    list: () => rows.map((r) => ({ ...r })),
    get: (id) => {
      const row = getRow(id)
      if (!row) throw new Error(`Novel project not found: ${id}`)
      return { ...row }
    },
  }
}

function repoImpl(rows = legacyRows) {
  return {
    list: async () => rows.map((r) => ({ ...r, orgId: 'default', version: 1, deletedAt: null })),
    findById: async (id) => {
      const row = rows.find((r) => r.id === id)
      return row ? { ...row, orgId: 'default', version: 1, deletedAt: null } : null
    },
  }
}

function loggerStub() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

describe('novelReadService 只读切换', () => {
  it('legacy：不访问 PostgreSQL', async () => {
    const log = loggerStub()
    const service = createNovelReadService({
      legacy: legacyImpl(),
      getRepo: () => {
        throw new Error('should not be called')
      },
      mode: 'legacy',
      log,
    })
    const rows = await service.list()
    assert.equal(rows.length, 2)
    assert.equal(log.warnings.length, 0)
  })

  it('shadow：一致时返回 legacy 且无告警', async () => {
    const log = loggerStub()
    const service = createNovelReadService({ legacy: legacyImpl(), getRepo: () => repoImpl(), mode: 'shadow', log })
    const rows = await service.list({ requestId: 'r1' })
    assert.deepEqual(rows.map((r) => r.id), ['n1', 'n2'])
    assert.equal(log.warnings.length, 0)
  })

  it('shadow：内容不一致时记录告警但仍返回 legacy', async () => {
    const log = loggerStub()
    const drifted = legacyRows.map((r) => ({ ...r, title: r.id === 'n1' ? 'A-changed' : r.title }))
    const service = createNovelReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(drifted),
      mode: 'shadow',
      log,
    })
    const rows = await service.list({ requestId: 'r2' })
    assert.equal(rows[0].title, 'A')
    assert.equal(log.warnings.length, 1)
    assert.match(log.warnings[0][0], /mismatch/)
  })

  it('shadow：PostgreSQL 缺失详情时告警', async () => {
    const log = loggerStub()
    const service = createNovelReadService({
      legacy: legacyImpl(),
      getRepo: () => ({ list: async () => [], findById: async () => null }),
      mode: 'shadow',
      log,
    })
    const doc = await service.get('n1', { requestId: 'r3' })
    assert.equal(doc.title, 'A')
    assert.match(log.warnings[0][0], /detail missing/)
  })

  it('postgres：返回仓库结果并去掉内部字段', async () => {
    const service = createNovelReadService({
      legacy: legacyImpl(),
      getRepo: () => repoImpl(),
      mode: 'postgres',
      log: loggerStub(),
    })
    const rows = await service.list()
    assert.equal(rows[0].id, 'n2')
    assert.equal(rows[0].orgId, undefined)
    assert.equal(rows[0].version, undefined)
    assert.equal(rows[0].deletedAt, undefined)

    const doc = await service.get('n2')
    assert.equal(doc.title, 'B')
    assert.equal(doc.version, undefined)
  })

  it('postgres：详情不存在时抛 not found', async () => {
    const service = createNovelReadService({
      legacy: legacyImpl(),
      getRepo: () => ({ list: async () => [], findById: async () => null }),
      mode: 'postgres',
      log: loggerStub(),
    })
    await assert.rejects(() => service.get('nope'), /not found/i)
  })

  it('仓库异常时回退 legacy 并告警', async () => {
    const log = loggerStub()
    const service = createNovelReadService({
      legacy: legacyImpl(),
      getRepo: () => ({
        list: async () => {
          throw new Error('db down')
        },
        findById: async () => {
          throw new Error('db down')
        },
      }),
      mode: 'postgres',
      log,
    })
    const rows = await service.list({ requestId: 'r4' })
    assert.equal(rows.length, 2)
    assert.match(log.warnings[0][0], /回退 legacy/)
  })
})
