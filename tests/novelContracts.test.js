import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import request from 'supertest'
import app from '../src/server.js'
import { createNovelProject, deleteNovelProject, novelDir } from '../src/services/novelProjectService.js'
import { ingestNovel } from '../src/services/novelChunkService.js'
import './helpers/pg-teardown.js'

/**
 * 小说域写接口契约回归（R2-T2.1）。
 *
 * - 非法 body/query → 422 + 统一 error envelope；
 * - 合法 body 能穿过校验进入 service/handler（用真实项目 + mock provider 验证）；
 * - 需要 PostgreSQL 测试库（TEST_DATABASE_URL 以 _test 结尾），由测试运行器提供。
 */

const SAMPLE = `第1章 起点
张三走在路上，张三看见李四。
李四说：张三你好。
第2章 转折
王五出现，王五和张三对望。
`

function assertValidationError(res, field) {
  assert.equal(res.status, 422, `expected 422, got ${res.status}: ${JSON.stringify(res.body)}`)
  assert.equal(res.body.success, false)
  assert.equal(res.body.error.code, 'VALIDATION_ERROR')
  assert.ok(Array.isArray(res.body.error.details), 'details should be an array')
  if (field) {
    assert.ok(
      res.body.error.details.some((d) => d.path === field || d.path.startsWith(`${field}.`)),
      `details should mention ${field}: ${JSON.stringify(res.body.error.details)}`
    )
  }
}

describe('小说域写接口契约校验', () => {
  let id
  let seasonId
  let episodeId

  before(async () => {
    const project = await createNovelProject({ title: '契约校验测试' })
    id = project.id
    await ingestNovel(id, { sourceType: 'text', text: SAMPLE })

    const plan = await request(app)
      .post(`/api/novels/${id}/series/plan`)
      .send({ episodesPerSeason: 1, useLLM: false })
    assert.equal(plan.status, 200, JSON.stringify(plan.body))

    const seasons = await request(app).get(`/api/novels/${id}/seasons`)
    assert.equal(seasons.status, 200)
    seasonId = seasons.body.data[0].id

    const episodes = await request(app).get(`/api/novels/${id}/episodes`)
    assert.equal(episodes.status, 200)
    episodeId = episodes.body.data[0].id
  })

  after(async () => {
    try {
      await deleteNovelProject(id)
    } catch {
      /* 测试失败时项目可能未落库，忽略清理错误 */
    }
    try {
      fs.rmSync(novelDir(id), { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  })

  it('series/plan：非法数值 → 422', async () => {
    const res = await request(app)
      .post(`/api/novels/${id}/series/plan`)
      .send({ episodesPerSeason: 'abc' })
    assertValidationError(res, 'episodesPerSeason')

    const zero = await request(app)
      .post(`/api/novels/${id}/series/plan`)
      .send({ episodeSeconds: 0 })
    assertValidationError(zero, 'episodeSeconds')
  })

  it('series/plan：合法 body 进入 service', async () => {
    const res = await request(app)
      .post(`/api/novels/${id}/series/plan`)
      .send({
        episodesPerSeason: 1,
        episodeSeconds: 90,
        charsPerSecond: 4.5,
        tolerance: 30,
        maxChapters: 2,
        useLLM: false,
        provider: 'heuristic',
        force: false,
      })
    assert.equal(res.status, 200, JSON.stringify(res.body))
    assert.equal(res.body.success, true)
    assert.ok(res.body.data.episodes >= 2)
    assert.ok(res.body.data.seasons >= 1)
  })

  it('outline GET：非法 query → 422，合法 query 进入 service', async () => {
    const bad = await request(app).get(`/api/novels/${id}/episodes/${episodeId}/outline?force=maybe`)
    assertValidationError(bad, 'force')

    const ok = await request(app).get(`/api/novels/${id}/episodes/${episodeId}/outline?force=1`)
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.data.provider, 'heuristic')
  })

  it('outline POST/PUT：非法 body → 422，合法 body 进入 service', async () => {
    const bad = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/outline`)
      .send({ force: 'nope' })
    assertValidationError(bad, 'force')

    const badPut = await request(app)
      .put(`/api/novels/${id}/episodes/${episodeId}/outline`)
      .send({ provider: 123 })
    assertValidationError(badPut, 'provider')

    const ok = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/outline`)
      .send({ force: true, useLLM: false })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.data.provider, 'heuristic')

    const okPut = await request(app)
      .put(`/api/novels/${id}/episodes/${episodeId}/outline`)
      .send({ force: false })
    assert.equal(okPut.status, 200, JSON.stringify(okPut.body))
  })

  it('compose：非法 seconds → 422，合法 body 进入 service', async () => {
    const bad = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/compose`)
      .send({ seconds: 0 })
    assertValidationError(bad, 'seconds')

    // 未生成素材时 service 会抛业务错误（400），证明请求已穿过校验层。
    const ok = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/compose`)
      .send({ seconds: 5 })
    assert.equal(ok.status, 400, JSON.stringify(ok.body))
    assert.equal(ok.body.success, false)
    assert.match(ok.body.error, /素材/)
  })

  it('script：非法 provider → 422，合法 body 进入 service', async () => {
    const bad = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/script`)
      .send({ provider: 123 })
    assertValidationError(bad, 'provider')

    const ok = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/script`)
      .send({ provider: 'heuristic' })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.ok(ok.body.data.screenplay.shots.length >= 1)
  })

  it('assets：非法布尔 → 422，合法 body 进入 service', async () => {
    const bad = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/assets`)
      .send({ image: 'yes' })
    assertValidationError(bad, 'image')

    const ok = await request(app)
      .post(`/api/novels/${id}/episodes/${episodeId}/assets`)
      .send({ image: false, audio: false, video: false })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.success, true)
  })

  it('seasons bulk：非法 task/limit → 422，合法 body 进入 service', async () => {
    const badTask = await request(app)
      .post(`/api/novels/${id}/seasons/${seasonId}/bulk`)
      .send({ task: 'unknown' })
    assertValidationError(badTask, 'task')

    const badLimit = await request(app)
      .post(`/api/novels/${id}/seasons/${seasonId}/bulk`)
      .send({ limit: 0 })
    assertValidationError(badLimit, 'limit')

    const ok = await request(app)
      .post(`/api/novels/${id}/seasons/${seasonId}/bulk`)
      .send({ task: 'script', limit: 1, concurrency: 1, onlyMissing: true })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.success, true)
  })

  it('seasons assets bulk-generate：非法 concurrency → 422，合法 body 进入 service', async () => {
    const bad = await request(app)
      .post(`/api/novels/${id}/seasons/${seasonId}/assets/bulk-generate`)
      .send({ concurrency: 99 })
    assertValidationError(bad, 'concurrency')

    const ok = await request(app)
      .post(`/api/novels/${id}/seasons/${seasonId}/assets/bulk-generate`)
      .send({ limit: 1, concurrency: 1 })
    assert.equal(ok.status, 200, JSON.stringify(ok.body))
    assert.equal(ok.body.success, true)
  })
})
