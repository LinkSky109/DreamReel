import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/server.js'
import { storageService } from '../src/services/storageService.js'
import { User } from '../src/models/user.js'
import { Review } from '../src/models/review.js'

const U1 = 'usr_comm_test_a'
const U2 = 'usr_comm_test_b'
const R1 = 'rev_comm_test_1'
const R2 = 'rev_comm_test_2'
let reportId

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
    storageService.createUser(
      new User({
        id: U1,
        name: 'CommunityA',
        preferenceTags: ['sci-fi'],
        scoreStyle: { story: 8, visual: 8, performance: 8, soundtrack: 8 },
      })
    )
    storageService.createUser(
      new User({
        id: U2,
        name: 'CommunityB',
        preferenceTags: ['drama'],
        scoreStyle: { story: 5, visual: 5, performance: 5, soundtrack: 5 },
      })
    )
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

  it('GET /recommendations 缺 userId 返回 400', async () => {
    const res = await request(app).get('/api/community/recommendations')
    assert.equal(res.status, 400)
  })

  it('GET /recommendations 返回推荐且排除本人作品', async () => {
    const res = await request(app).get(`/api/community/recommendations?userId=${U1}`)
    assert.equal(res.status, 200)
    assert.ok(Array.isArray(res.body.data))
    assert.ok(!res.body.data.some((x) => x.reviewId === R1))
    assert.ok(res.body.data.some((x) => x.reviewId === R2))
  })

  it('GET /recommendations 未知用户返回 404', async () => {
    const res = await request(app).get('/api/community/recommendations?userId=usr_missing_xyz')
    assert.equal(res.status, 404)
  })

  it('POST /reports 缺字段 400；review 不存在 404', async () => {
    let res = await request(app).post('/api/community/reports').send({ reviewId: R1 })
    assert.equal(res.status, 400)
    res = await request(app)
      .post('/api/community/reports')
      .send({ reviewId: 'rev_missing_xyz', reporterId: U2, reason: 'spam' })
    assert.equal(res.status, 404)
  })

  it('POST /reports 创建 201；同一用户重复举报 409', async () => {
    let res = await request(app)
      .post('/api/community/reports')
      .send({ reviewId: R1, reporterId: U2, reason: 'spam' })
    assert.equal(res.status, 201)
    reportId = res.body.data.id

    res = await request(app)
      .post('/api/community/reports')
      .send({ reviewId: R1, reporterId: U2, reason: 'again' })
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
      .send({ decision: 'approved', adminId: 'admin_test' })
    assert.equal(res.status, 200)
    assert.equal(res.body.data.status, 'approved')

    const lb = await request(app).get('/api/community/leaderboard?period=weekly&limit=50')
    assert.ok(!lb.body.data.leaderboard.some((x) => x.reviewId === R1))
  })

  it('POST /reports/:id/process 缺 decision 返回 400', async () => {
    const res = await request(app)
      .post(`/api/community/reports/${reportId}/process`)
      .send({ adminId: 'admin_test' })
    assert.equal(res.status, 400)
  })
})
