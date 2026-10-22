import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import config from '../src/config/index.js'
import { storageService } from '../src/services/storageService.js'
import { createNovelProject, deleteNovelProject } from '../src/services/novelProjectService.js'
import { ingestNovel } from '../src/services/novelChunkService.js'
import { novelReadService } from '../src/services/novelReadService.js'
import { novelChildReadService } from '../src/services/novelChildReadService.js'
import { listChunksAsync } from '../src/services/novelAsyncReadService.js'
import { getPool, closeDb } from '../src/db/client.js'

const SAMPLE = `第1章 起点
张三走在路上，张三看见李四。
第2章 转折
王五出现，王五和张三对望。
`

/**
 * 测试环境契约：
 * 1. `npm test` 只连独立 `_test` 库，开发库不被读写；
 * 2. 小说读服务只有 PostgreSQL 一条路径，db.json 投影不能作为回退。
 */
describe('小说域 · 测试库隔离与 PG-only 读', () => {
  let project
  const ghostId = `ghost-json-${Date.now()}`
  const pgOnlyId = `pg-only-${Date.now()}`

  before(async () => {
    project = await createNovelProject({ title: '隔离契约测试' })
    await ingestNovel(project.id, { sourceType: 'text', text: SAMPLE })
  })

  after(async () => {
    if (project) await deleteNovelProject(project.id).catch(() => {})
    delete storageService.data.novelProjects?.[ghostId]
    await getPool()
      .query('DELETE FROM novels WHERE id = $1', [pgOnlyId])
      .catch(() => {})
    await closeDb()
  })

  it('运行在独立 *_test 库，且非小说域仍使用隔离存储', async () => {
    const url = new URL(process.env.DATABASE_URL)
    const urlDb = decodeURIComponent(url.pathname.replace(/^\//, ''))
    assert.ok(urlDb.endsWith('_test'), `测试库必须以 _test 结尾：${urlDb}`)
    assert.equal(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL)

    const { rows } = await getPool().query('SELECT current_database() AS db')
    assert.equal(rows[0].db, urlDb, '实际连接的库必须等于配置的测试库')

    assert.equal(config.db.driver, 'json', '非小说域不应切到 PG 测试库')
    assert.match(String(config.storage.path), /test-run|e2e-storage/, 'STORAGE_PATH 必须是隔离目录')
  })

  it('项目读回来自 PG，且章节正文按偏移水合', async () => {
    const fromPg = await novelReadService.get(project.id)
    assert.equal(fromPg.id, project.id)
    assert.equal(fromPg.title, '隔离契约测试')

    const chunks = await listChunksAsync(project.id)
    assert.equal(chunks.length, 2)
    assert.ok(chunks.every((c) => c.text.length > 0), '章节正文应由 novel_sources 水合')

    const { rows } = await getPool().query(
      'SELECT count(*)::int AS n FROM novel_chunks WHERE novel_id = $1 AND deleted_at IS NULL',
      [project.id]
    )
    assert.equal(rows[0].n, 2)
  })

  it('只存在于 db.json 投影的小说不会被读服务看到', async () => {
    storageService.data.novelProjects ??= {}
    storageService.data.novelProjects[ghostId] = {
      id: ghostId,
      title: '仅 JSON 的幽灵小说',
      createdAt: new Date().toISOString(),
    }

    await assert.rejects(() => novelReadService.get(ghostId), /not found/i)
    const list = await novelReadService.list()
    assert.ok(!list.some((n) => n.id === ghostId), 'PG-only 读不得回退到 JSON 投影')

    const chunks = await novelChildReadService.list('chunks', ghostId)
    assert.deepEqual(chunks, [])
  })

  it('直接写入 PG 的小说无需 JSON 投影即可读到', async () => {
    await getPool().query(
      `INSERT INTO novels (id, org_id, title, status, payload)
       VALUES ($1, 'default', '直接入 PG', 'draft', '{}'::jsonb)`,
      [pgOnlyId]
    )
    assert.equal(storageService.data.novelProjects?.[pgOnlyId], undefined)

    const list = await novelReadService.list()
    assert.ok(list.some((n) => n.id === pgOnlyId), '列表必须来自 PG')

    const doc = await novelReadService.get(pgOnlyId)
    assert.equal(doc.title, '直接入 PG')
  })

  it('小说写入不产生 outbox 事件（PG 已是事实源）', async () => {
    const { rows } = await getPool().query(
      `SELECT count(*)::int AS n FROM outbox_events
       WHERE payload->>'id' = $1 OR payload->>'novelId' = $1`,
      [project.id]
    )
    assert.equal(rows[0].n, 0)
  })
})
