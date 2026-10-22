import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createNovelReadService } from '../src/services/novelReadService.js'

const rows = [
  { id: 'n1', title: 'A', status: 'draft', stage: 'source', counts: { a: 1, b: 2 }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' },
  { id: 'n2', title: 'B', status: 'done', stage: 'compose', counts: { a: 3 }, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-02T00:00:00.000Z' },
]

function repoImpl(data = rows) {
  return {
    list: async () => data.map((r) => ({ ...r, orgId: 'default', version: 1, deletedAt: null })),
    findById: async (id) => {
      const row = data.find((r) => r.id === id)
      return row ? { ...row, orgId: 'default', version: 1, deletedAt: null } : null
    },
  }
}

function loggerStub() {
  const warnings = []
  return { warnings, warn: (...args) => warnings.push(args) }
}

describe('novelReadService（PostgreSQL only）', () => {
  it('list：返回仓库结果、按创建时间倒序并去掉内部字段', async () => {
    const service = createNovelReadService({ getRepo: () => repoImpl(), log: loggerStub() })
    const list = await service.list()
    assert.deepEqual(list.map((r) => r.id), ['n2', 'n1'])
    assert.equal(list[0].orgId, undefined)
    assert.equal(list[0].version, undefined)
    assert.equal(list[0].deletedAt, undefined)
  })

  it('get：返回仓库详情并去掉内部字段', async () => {
    const service = createNovelReadService({ getRepo: () => repoImpl(), log: loggerStub() })
    const doc = await service.get('n2')
    assert.equal(doc.title, 'B')
    assert.equal(doc.version, undefined)
    assert.equal(doc.orgId, undefined)
  })

  it('get：不存在时抛 not found', async () => {
    const service = createNovelReadService({
      getRepo: () => ({ list: async () => [], findById: async () => null }),
      log: loggerStub(),
    })
    await assert.rejects(() => service.get('nope'), /not found/i)
  })

  it('仓库异常时直接报错并告警', async () => {
    const log = loggerStub()
    const service = createNovelReadService({
      getRepo: () => ({
        list: async () => {
          throw new Error('db down')
        },
        findById: async () => {
          throw new Error('db down')
        },
      }),
      log,
    })
    await assert.rejects(() => service.list({ requestId: 'r1' }), /db down/)
    assert.match(log.warnings[0][0], /postgres 读取失败/)
  })

  it('默认 PG：即使注入 legacy 适配器也不会回退', async () => {
    let legacyCalls = 0
    const legacy = {
      list: () => {
        legacyCalls += 1
        return [{ id: 'legacy-only' }]
      },
      get: () => {
        legacyCalls += 1
        return { id: 'legacy-only' }
      },
    }
    const service = createNovelReadService({ getRepo: () => repoImpl(), legacy, log: loggerStub() })
    const list = await service.list()
    assert.deepEqual(list.map((r) => r.id), ['n2', 'n1'])
    const doc = await service.get('n1')
    assert.equal(doc.id, 'n1')
    assert.equal(legacyCalls, 0, 'PG 读路径不得触碰 legacy 适配器')
  })

  it('PG 报错时不得回退 legacy', async () => {
    let legacyCalls = 0
    const service = createNovelReadService({
      getRepo: () => ({
        list: async () => {
          throw new Error('pg unavailable')
        },
        findById: async () => {
          throw new Error('pg unavailable')
        },
      }),
      legacy: {
        list: () => {
          legacyCalls += 1
          return []
        },
        get: () => {
          legacyCalls += 1
          return null
        },
      },
      log: loggerStub(),
    })
    await assert.rejects(() => service.list(), /pg unavailable/)
    assert.equal(legacyCalls, 0)
  })
})
