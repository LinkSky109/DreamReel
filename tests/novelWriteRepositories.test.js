import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { migrate } from '../src/db/migrate.js'
import { getPool, closeDb } from '../src/db/client.js'
import { withNovelTransaction, getNovelWriteRepositories } from '../src/repositories/unitOfWork.js'

const DATABASE_URL = process.env.DATABASE_URL

describe('小说写仓储 · PostgreSQL', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_write_test_${Date.now()}`
  const novelId = `${orgId}-novel`

  before(async () => {
    await migrate({ url: DATABASE_URL })
    await getPool().query(
      'INSERT INTO organizations (id, name, slug, plan) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO NOTHING',
      [orgId, '写仓储测试', orgId, 'free']
    )
    await getPool().query(
      `INSERT INTO novels (id, org_id, title, status, payload)
       VALUES ($1,$2,'写仓储测试','draft','{}'::jsonb) ON CONFLICT (id) DO NOTHING`,
      [novelId, orgId]
    )
  })

  after(async () => {
    await getPool().query('DELETE FROM organizations WHERE id = $1', [orgId])
    await closeDb()
  })

  it('novel_sources upsert 保留版本并更新 hash', async () => {
    const repos = getNovelWriteRepositories()
    const first = await repos.sources.upsert(
      novelId,
      { cleanedText: '第一章\n正文', cleanedHash: 'h1', sourceType: 'text', wordCount: 7 },
      { orgId }
    )
    assert.equal(first.cleanedText, '第一章\n正文')
    assert.equal(first.cleanedHash, 'h1')
    assert.equal(first.version, 1)

    const second = await repos.sources.upsert(
      novelId,
      { cleanedText: '第一章\n正文改', cleanedHash: 'h2', sourceType: 'text' },
      { orgId }
    )
    assert.equal(second.cleanedHash, 'h2')
    assert.equal(second.version, 2)
  })

  it('chunks replaceAll 写入偏移并可整体替换', async () => {
    const repos = getNovelWriteRepositories()
    const first = await repos.chunks.replaceAll(
      novelId,
      [
        { id: `${novelId}-k1`, index: 0, chapterTitle: '第一章', startOffset: 0, endOffset: 5, wordCount: 5, cleanedHash: 'h2' },
        { id: `${novelId}-k2`, index: 1, chapterTitle: '第二章', startOffset: 6, endOffset: 11, wordCount: 5, cleanedHash: 'h2' },
      ],
      { orgId }
    )
    assert.equal(first.length, 2)
    assert.equal(first[0].startOffset, 0)
    assert.equal(first[1].chapterTitle, '第二章')

    const second = await repos.chunks.replaceAll(
      novelId,
      [{ id: `${novelId}-k3`, index: 0, chapterTitle: '新第一章', startOffset: 0, endOffset: 8, wordCount: 8 }],
      { orgId }
    )
    assert.equal(second.length, 1)
    assert.equal(second[0].chapterTitle, '新第一章')
  })

  it('season/episode upsert 保留 id，并按 logical_key 软删旧集', async () => {
    await withNovelTransaction(novelId, async (repos) => {
      const seasonIds = await repos.seasons.upsertMany(
        novelId,
        [
          { id: `${novelId}-s1`, seasonNo: 1, title: '第一季', synopsis: '开端', episodeCount: 1, arcName: '弧一', goal: '目标', chapterStart: 0, chapterEnd: 3, planProvider: 'llm' },
        ],
        { orgId }
      )
      assert.equal(seasonIds.get(1), `${novelId}-s1`)
      const epIds = await repos.episodes.upsertMany(
        novelId,
        [
          {
            id: `${novelId}-ep1`,
            seasonId: `${novelId}-s1`,
            episodeNo: 1,
            logicalKey: 's1:e1',
            title: '第一集',
            targetSeconds: 90,
            estimatedSeconds: 91.2,
            chapterStart: 0,
            chapterEnd: 0,
            startOffset: 0,
            endOffset: 410,
            status: 'planned',
            outline: { coreConflict: '旧冲突' },
          },
        ],
        { orgId }
      )
      assert.equal(epIds.get('s1:e1'), `${novelId}-ep1`)
    })

    // 同一 logical_key 再次 upsert：id 必须保留，内容更新
    await withNovelTransaction(novelId, async (repos) => {
      const seasonIds = await repos.seasons.upsertMany(
        novelId,
        [{ id: `${novelId}-s1-new`, seasonNo: 1, title: '第一季·改', episodeCount: 1, chapterStart: 0, chapterEnd: 3 }],
        { orgId }
      )
      assert.equal(seasonIds.get(1), `${novelId}-s1`)
      const epIds = await repos.episodes.upsertMany(
        novelId,
        [
          {
            id: `${novelId}-ep1-new`,
            seasonId: `${novelId}-s1`,
            episodeNo: 1,
            logicalKey: 's1:e1',
            title: '第一集·改',
            estimatedSeconds: 92.5,
            outline: { coreConflict: '新冲突' },
          },
        ],
        { orgId }
      )
      assert.equal(epIds.get('s1:e1'), `${novelId}-ep1`)

      const eps = await repos.episodes.list(novelId, { orgId })
      assert.equal(eps.length, 1)
      assert.equal(eps[0].title, '第一集·改')
      assert.equal(eps[0].estimatedSeconds, 92.5)
      assert.equal(eps[0].outline.coreConflict, '新冲突')
    })

    // 第二季出现、第一季消失：旧季/集软删除
    await withNovelTransaction(novelId, async (repos) => {
      const seasonIds = await repos.seasons.replaceForNovel(
        novelId,
        [{ id: `${novelId}-s2`, seasonNo: 2, title: '第二季', episodeCount: 1, chapterStart: 4, chapterEnd: 6 }],
        { orgId }
      )
      assert.equal(seasonIds.get(2), `${novelId}-s2`)
      await repos.episodes.replaceForNovel(
        novelId,
        [
          {
            id: `${novelId}-ep2`,
            seasonId: `${novelId}-s2`,
            episodeNo: 2,
            logicalKey: 's2:e2',
            title: '第二集',
            estimatedSeconds: 90,
          },
        ],
        { orgId }
      )
    })

    const repos = getNovelWriteRepositories()
    const seasons = await repos.seasons.list(novelId, { orgId })
    const episodes = await repos.episodes.list(novelId, { orgId })
    assert.deepEqual(seasons.map((s) => s.seasonNo), [2])
    assert.deepEqual(episodes.map((e) => e.logicalKey), ['s2:e2'])
  })

  it('事务失败整体回滚', async () => {
    const marker = `${novelId}-rollback`
    await assert.rejects(
      () =>
        withNovelTransaction(novelId, async (repos) => {
          await repos.seasons.upsertMany(
            novelId,
            [{ id: marker, seasonNo: 99, title: '回滚季', episodeCount: 0 }],
            { orgId }
          )
          throw new Error('boom')
        }),
      /boom/
    )
    const rows = await getPool().query('SELECT id FROM seasons WHERE id = $1', [marker])
    assert.equal(rows.rowCount, 0)
  })

  it('规划运行与产物可查询', async () => {
    const repos = getNovelWriteRepositories()
    const runId = `${novelId}-run1`
    await repos.plans.createRun(
      { id: runId, novelId, cleanedHash: 'h2', provider: 'litellm', model: 'deepseek-flash' },
      { orgId }
    )
    await repos.plans.addArtifact(runId, 'arcs', [{ name: '弧一', chapterStart: 0, chapterEnd: 3 }])
    await repos.plans.finishRun(runId, { status: 'done', stats: { seasons: 1, episodes: 1 } })

    const latest = await repos.plans.getLatest(novelId, { orgId })
    assert.equal(latest.id, runId)
    assert.equal(latest.status, 'done')
    assert.deepEqual(latest.stats, { seasons: 1, episodes: 1 })

    const artifacts = await repos.plans.getArtifacts(runId)
    assert.equal(artifacts.arcs.length, 1)
    assert.equal(artifacts.arcs[0].name, '弧一')
  })
})
