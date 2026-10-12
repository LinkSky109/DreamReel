import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
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

  it('HTTP: 400 / 404 语义', async () => {
    let res = await request(app).get('/api/novels/does-not-exist')
    assert.equal(res.status, 404)
    res = await request(app).post('/api/novels').send({})
    assert.equal(res.status, 400)
  })
})
