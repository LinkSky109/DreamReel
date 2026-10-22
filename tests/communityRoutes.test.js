import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/server.js'
import { storageService } from '../src/services/storageService.js'
import { authService } from '../src/services/authService.js'
import { Review } from '../src/models/review.js'

let U1
let U2
let token1
let token2
const R1 = 'rev_comm_test_1'
const R2 = 'rev_comm_test_2'
let reportId

function register(prefix) {
  return authService.register({
    username: `${prefix}${Date.now()}`,
    email: `${prefix}-${Date.now()}@example.com`,
    password: 'secret-123',
  })
}

function cleanup() {
  if (storageService.data.reviews) {
    delete storageService.data.reviews[R1]
    delete storageService.data.reviews[R2]
  }
  delete storageService.data.users?.[U1]
  delete storageService.data.users?.[U2]
  if (reportId && storageService.data.reports) delete storageService.data.reports[reportId]
  storageService._flush()
}

describe('影评社区 /api/community', () => {
  before(() => {
    const a = register('comma')
    const b = register('commb')
    U1 = a.user.id
    U2 = b.user.id
    token1 = a.token
    token2 = b.token
    storageService.data.users[U1].preferenceTags = ['sci-fi']
    storageService.data.users[U1].scoreStyle = { story: 8, visual: 8, performance: 8, soundtrack: 8 }
    storageService.data.users[U2].preferenceTags = ['drama']
    storageService.data.users[U2].scoreStyle = { story: 5, visual: 5, performance: 5, soundtrack: 5 }

    storageService.createReview(
      new Review({
        id: R1,
        userId: U1,
        title: 'Community Review 1',
        storyScore: 9,
        visualScore: 9,
        performanceScore: 9,
        soundtrackScore: 9,
        likeCount: 5,
      })
    )
    storageService.createReview(
      new Review({
        id: R2,
        userId: U2,
        title: 'Community Review 2',
        storyScore: 6,
        visualScore: 6,
        performanceScore: 6,
        soundtrackScore: 6,
      })
    )
  })

  after(cleanup)

  it('GET /leaderboard 返回榜单且含已发布影评', async () => {
    const res = await request(app).get('/api/community/leaderboard?period=weekly&limit=10')
    assert.equal(res.status, 200)
    assert.equal(res.body.success, true)
    assert.ok(Array.isArray(res.body.data.leaderboard))
    assert.ok(res.body.data.leaderboard.some((x) => x.reviewId === R1))
  })

  it('GET /leaderboard 非法 period 返回 400', async () => {
    const res = await request(app).get('/api/community/leaderboard?period=bogus')
    assert.equal(res.status, 400)
  })

  it('GET /recommendations 匿名（default）无数据返回 404', async () => {
    const res = await request(app).get('/api/community/recommendations')
    assert.equal(res.status, 404)
  })

  it('GET /recommendations 返回推荐且排除本人作品', async () => {
    const res = await request(app)
      .get('/api/community/recommendations')
      .set('Authorization', `Bearer ${token1}`)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.data))
    assert.ok(!res.body.data.some((x) => x.reviewId === R1))
    assert.ok(res.body.data.some((x) => x.reviewId === R2))
  })

  it('POST /reports 缺字段 400；review 不存在 404', async () => {
    let res = await request(app)
      .post('/api/community/reports')
      .set('Authorization', `Bearer ${token2}`)
      .send({ reviewId: R1 })
    assert.equal(res.status, 400)
    res = await request(app)
      .post('/api/community/reports')
      .set('Authorization', `Bearer ${token2}`)
      .send({ reviewId: 'rev_missing_xyz', reason: 'spam' })
    assert.equal(res.status, 404)
  })

  it('POST /reports 创建 201；同一用户重复举报 409', async () => {
    let res = await request(app)
      .post('/api/community/reports')
      .set('Authorization', `Bearer ${token2}`)
      .send({ reviewId: R1, reason: 'spam' })
    assert.equal(res.status, 201)
    reportId = res.body.data.id

    res = await request(app)
      .post('/api/community/reports')
      .set('Authorization', `Bearer ${token2}`)
      .send({ reviewId: R1, reason: 'again' })
    assert.equal(res.status, 409)
  })

  it('GET /reports/pending 列出待处理；GET /reports/:id 详情与 404', async () => {
    let res = await request(app).get('/api/community/reports/pending')
    assert.equal(res.status, 200)
    assert.ok(res.body.data.some((r) => r.id === reportId))

    res = await request(app).get(`/api/community/reports/${reportId}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.id, reportId)

    res = await request(app).get('/api/community/reports/rep_missing_xyz')
    assert.equal(res.status, 404)
  })

  it('POST /reports/:id/process approved 隐藏被举报影评', async () => {
    const res = await request(app)
      .post(`/api/community/reports/${reportId}/process`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ decision: 'approved' })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'approved')

    const lb = await request(app).get('/api/community/leaderboard?period=weekly&limit=50')
    assert.ok(!lb.body.data.leaderboard.some((x) => x.reviewId === R1))
  })

  it('POST /reports/:id/process 缺 decision 返回 400', async () => {
    const res = await request(app)
      .post(`/api/community/reports/${reportId}/process`)
      .set('Authorization', `Bearer ${token1}`)
      .send({})
    assert.equal(res.status, 400)
  })
})
