import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import request from 'supertest'
import app from '../src/server.js'
import { storageService } from '../src/services/storageService.js'
import { createNovelProject, novelDir } from '../src/services/novelProjectService.js'
import { cleanText, splitChapters, ingestNovel } from '../src/services/novelChunkService.js'
import { heuristicExtract } from '../src/services/characterExtractionService.js'

const SAMPLE = `第1章 起点
一秒记住【奇书网】本站域名
张三走在路上，张三看见李四。
李四说：张三你好。
第2章 转折
王五出现，王五和张三对望。
`

describe('Sprint 19 小说 → 角色流水线', () => {
  const created = []

  after(() => {
    for (const id of created) {
      try {
        fs.rmSync(novelDir(id), { recursive: true, force: true })
      } catch {
        /* ignore */
      }
      delete storageService.data.novelProjects?.[id]
      for (const c of storageService.listNovelChunks(id)) delete storageService.data.novelChunks[c.id]
      for (const c of storageService.listNovelCharacters(id)) delete storageService.data.novelCharacters[c.id]
    }
    storageService._flush()
  })

  it('cleanText 去水印；splitChapters 分章', () => {
    const clean = cleanText(SAMPLE)
    assert.ok(!clean.includes('一秒记住'))
    const chapters = splitChapters(SAMPLE)
    assert.equal(chapters.length, 2)
    assert.equal(chapters[0].chapterTitle, '第1章 起点')
  })

  it('heuristicExtract 识别高频姓名', () => {
    const chars = heuristicExtract([{ text: SAMPLE }], { minFreq: 1 })
    const names = chars.map((c) => c.name)
    assert.ok(names.includes('张三'))
    assert.ok(names.includes('李四'))
    assert.ok(names.includes('王五'))
  })

  it('ingest → 切片入库', async () => {
    const p = createNovelProject({ title: '单元测试小说' })
    created.push(p.id)
    const r = await ingestNovel(p.id, { sourceType: 'text', text: SAMPLE })
    assert.equal(r.chapterCount, 2)
    assert.equal(storageService.listNovelChunks(p.id).length, 2)
  })

  it('HTTP: create → ingest → extract → patch → review-stats', async () => {
    let res = await request(app).post('/api/novels').send({ title: 'HTTP 小说' })
    assert.equal(res.status, 201)
    const id = res.body.data.id
    created.push(id)

    res = await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.chapterCount, 2)

    res = await request(app).post(`/api/novels/${id}/extract`).send({ provider: 'heuristic', minFreq: 1 })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.provider, 'heuristic')
    const chars = res.body.data.characters
    assert.ok(chars.length >= 3)

    const c0 = chars[0]
    res = await request(app)
      .patch(`/api/novels/${id}/characters/${c0.id}`)
      .send({ card: { personality: '冷静' } })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.card.personality, '冷静')
    assert.ok(res.body.data.reviewEdits.length >= 1)

    res = await request(app).get(`/api/novels/${id}/review-stats`)
    assert.equal(res.status, 200)
    assert.ok(res.body.data.revisionRate > 0)
  })

  it('HTTP: 风格生成 + 角色成长状态', async () => {
    let res = await request(app).post('/api/novels').send({ title: '风格与成长测试' })
    const id = res.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })

    res = await request(app).post(`/api/novels/${id}/style/generate`)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.scope, 'book')
    assert.ok(['llm', 'heuristic'].includes(res.body.data.provider))

    res = await request(app).post(`/api/novels/${id}/extract`).send({ provider: 'heuristic', minFreq: 1 })
    const cid = res.body.data.characters[0].id

    res = await request(app)
      .post(`/api/novels/${id}/characters/${cid}/states`)
      .send({ chapterIndex: 1, chapterTitle: '第1章', abilities: '觉醒异能' })
    assert.equal(res.status, 201)

    res = await request(app).get(`/api/novels/${id}/characters/${cid}/states`)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.length, 1)
    assert.equal(res.body.data[0].abilities, '觉醒异能')
  })

  it('HTTP: 分季分集 + 单集剧本 + 一致性', async () => {
    let res = await request(app).post('/api/novels').send({ title: '分季分集测试' })
    const id = res.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })

    // 规划：每季 1 集（便于小样本断言）
    res = await request(app).post(`/api/novels/${id}/series/plan`).send({ episodesPerSeason: 1 })
    assert.equal(res.status, 200)
    assert.ok(res.body.data.episodes >= 2)
    assert.ok(res.body.data.seasons >= 1)

    res = await request(app).get(`/api/novels/${id}/seasons`)
    assert.equal(res.status, 200)
    assert.ok(res.body.data.length >= 1)

    res = await request(app).get(`/api/novels/${id}/episodes`)
    const episodes = res.body.data
    assert.ok(episodes.length >= 2)
    // 每集目标时长
    assert.equal(episodes[0].targetSeconds, 90)

    // 单集剧本（启发式）→ 时长落 85–95
    res = await request(app).post(`/api/novels/${id}/episodes/${episodes[0].id}/script`).send({ provider: 'heuristic' })
    assert.equal(res.status, 200)
    const total = res.body.data.screenplay.totalSeconds
    assert.ok(total >= 85 && total <= 95, `total=${total}`)
    assert.ok(res.body.data.screenplay.shots.length >= 4)

    // 一致性
    res = await request(app).get(`/api/novels/${id}/consistency`)
    assert.equal(res.status, 200)
    assert.ok(res.body.data.episodes >= 2)
  })

  it('HTTP: 单集资产生成（图/音/视频，mock）', async () => {
    let res = await request(app).post('/api/novels').send({ title: '资产生成测试' })
    const id = res.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })
    await request(app).post(`/api/novels/${id}/series/plan`).send({ episodesPerSeason: 1 })

    res = await request(app).get(`/api/novels/${id}/episodes`)
    const eid = res.body.data[0].id

    res = await request(app).post(`/api/novels/${id}/episodes/${eid}/assets`).send({ videoTimeoutMs: 30000 })
    assert.equal(res.status, 200)
    const assets = res.body.data.assets
    assert.ok(assets.image && (assets.image.url || assets.image.filePath), 'image asset')
    assert.ok(assets.audio && (assets.audio.url || assets.audio.filePath), 'audio asset')
    assert.ok(assets.video && assets.video.taskId, 'video task started')
  })

  it('HTTP: 单集成片 + 清单 + 本地/夸克同步', async () => {
    let res = await request(app).post('/api/novels').send({ title: '成片与同步测试' })
    const id = res.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })
    await request(app).post(`/api/novels/${id}/series/plan`).send({ episodesPerSeason: 1 })
    res = await request(app).get(`/api/novels/${id}/episodes`)
    const eid = res.body.data[0].id

    // 先生成素材（mock 视频需完成）
    await request(app).post(`/api/novels/${id}/episodes/${eid}/assets`).send({ videoTimeoutMs: 60000 })

    // 成片（测试用 5s 短成片，避免 90s 编码耗时）
    res = await request(app).post(`/api/novels/${id}/episodes/${eid}/compose`).send({ seconds: 5 })
    assert.equal(res.status, 200)
    assert.ok(res.body.data.url)
    assert.equal(res.body.data.hasVideo, true)

    // 清单
    res = await request(app).get(`/api/novels/${id}/manifest`)
    assert.equal(res.status, 200)
    assert.ok(res.body.data.fileCount >= 1)

    // 本地同步（真实复制）
    const target = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-sync-'))
    res = await request(app).post(`/api/novels/${id}/sync`).send({ backend: 'local', targetDir: target })
    assert.equal(res.status, 200)
    assert.ok(res.body.data.copied >= 1)

    // 夸克网盘 dry-run
    res = await request(app).post(`/api/novels/${id}/sync`).send({ backend: 'quark', dryRun: true })
    assert.equal(res.status, 200)
    assert.ok(res.body.data.fileCount >= 1)

    // 夸克网盘真实上传（无 cookie）→ 如实失败
    res = await request(app).post(`/api/novels/${id}/sync`).send({ backend: 'quark', dryRun: false })
    assert.equal(res.status, 400)
  })

  it('HTTP: 单集外部生成交接（导出提示词/参考 + 回传）', async () => {
    let res = await request(app).post('/api/novels').send({ title: '交接测试' })
    const id = res.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })
    await request(app).post(`/api/novels/${id}/series/plan`).send({ episodesPerSeason: 1 })
    res = await request(app).get(`/api/novels/${id}/episodes`)
    const eid = res.body.data[0].id

    // 导出交接包
    res = await request(app).post(`/api/novels/${id}/episodes/${eid}/handoff`).send({})
    assert.equal(res.status, 200)
    assert.ok(res.body.data.dir.includes('handoff'))
    const promptFile = path.join(novelDir(id), 'handoff', eid, 'prompt.txt')
    const specFile = path.join(novelDir(id), 'handoff', eid, 'spec.json')
    assert.ok(fs.existsSync(promptFile), 'prompt.txt')
    assert.ok(fs.existsSync(specFile), 'spec.json')

    // 回传外部产物
    const src = path.join(os.tmpdir(), `dr-import-${Date.now()}.mp4`)
    fs.writeFileSync(src, Buffer.from('fake-mp4-bytes'))
    res = await request(app).post(`/api/novels/${id}/episodes/${eid}/handoff/import`).send({ filePath: src })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.provider, 'external')
    assert.ok(res.body.data.videoUrl.includes('/storage/videos/novels/'))

    // 交接列表
    res = await request(app).get(`/api/novels/${id}/handoff`)
    assert.equal(res.status, 200)
    assert.ok(res.body.data.some((h) => h.episodeId === eid && h.status === 'imported'))
  })

  it('HTTP: 世界观设定集（种族/势力/事件/装备/文化）', async () => {
    const WORLD_SAMPLE = `第1章 帝国
银河帝国崛起。银河帝国强大。银河帝国扩张。
第2章 战争
自由联盟对抗银河帝国。战争爆发，帝国军团推进。
第3章 装备
殖装装甲广泛使用，帝国军团与自由联盟的战争持续。`

    let res = await request(app).post('/api/novels').send({ title: '世界观测试' })
    const id = res.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: WORLD_SAMPLE })

    res = await request(app).post(`/api/novels/${id}/world/extract`).send({ provider: 'heuristic' })
    assert.equal(res.status, 200)
    assert.ok(res.body.data.summary.total >= 1, `entities=${res.body.data.summary.total}`)
    assert.ok(res.body.data.summary.byType.faction >= 1)

    res = await request(app).get(`/api/novels/${id}/world/entities`)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.data) && res.body.data.length >= 1)

    res = await request(app).get(`/api/novels/${id}/world/relations`)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.data))
  })

  it('HTTP: 阶段锁定 + 备选/选定', async () => {
    let res = await request(app).post('/api/novels').send({ title: '锁定测试' })
    const id = res.body.data.id
    created.push(id)
    await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })

    // 角色多次生成 → 备选集合
    await request(app).post(`/api/novels/${id}/extract`).send({ provider: 'heuristic', minFreq: 1 })
    await request(app).post(`/api/novels/${id}/extract`).send({ provider: 'heuristic', minFreq: 1 })
    res = await request(app).get(`/api/novels/${id}/characters/sets`)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.length, 2)
    const first = res.body.data[0].id

    // 选定某个备选
    res = await request(app).post(`/api/novels/${id}/characters/select`).send({ setId: first })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.selectedCharacterSet, first)

    // 推进到 characters → source 锁定 → 不能再 ingest
    res = await request(app).post(`/api/novels/${id}/advance`).send({ to: 'characters' })
    assert.equal(res.status, 200)
    res = await request(app).post(`/api/novels/${id}/ingest`).send({ sourceType: 'text', text: SAMPLE })
    assert.equal(res.status, 409)

    // 推进到 world → characters 锁定 → 不能再抽取
    await request(app).post(`/api/novels/${id}/advance`).send({ to: 'world' })
    res = await request(app).post(`/api/novels/${id}/extract`).send({ provider: 'heuristic', minFreq: 1 })
    assert.equal(res.status, 409)
  })

  it('HTTP: 400 / 404 语义', async () => {
    let res = await request(app).get('/api/novels/does-not-exist')
    assert.equal(res.status, 404)
    res = await request(app).post('/api/novels').send({})
    assert.equal(res.status, 400)
  })
})
