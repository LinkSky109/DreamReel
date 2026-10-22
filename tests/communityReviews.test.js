import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/server.js'
import { storageService } from '../src/services/storageService.js'
import { authService } from '../src/services/authService.js'

let U
let token
const created = []

function cleanup() {
  const reviews = storageService.data.reviews || {}
  for (const id of created) delete reviews[id]
  delete storageService.data.users?.[U]
  storageService._flush()
}

describe('影评社区 /api/community/reviews', () => {
  before(() => {
    const reg = authService.register({
      username: `review${Date.now()}`,
      email: `review-${Date.now()}@example.com`,
      password: 'secret-123',
    })
    U = reg.user.id
    token = reg.token
    storageService.data.users[U].preferenceTags = ['sci-fi']
    storageService.data.users[U].scoreStyle = { story: 7, visual: 7, performance: 7, soundtrack: 7 }
  })

  after(cleanup)

  it('POST /reviews 缺 title 返回 400', async () => {
    const res = await request(app)
      .post('/api/community/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ userId: U })
    assert.equal(res.status, 400)
  })

  it('POST /reviews 创建 201，四维评分与 movieTags 正确落库', async () => {
    const res = await request(app)
      .post('/api/community/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({
        userId: 'spoofed-user',
        title: 'Dune - 沙漠史诗',
        movieId: 'mov_dune',
        content: 'sand and spice',
        storyScore: 8,
        visualScore: 10,
        performanceScore: 7,
        soundtrackScore: 9,
        movieTags: ['sci-fi', 'epic'],
      })
    assert.equal(res.status, 201)
    assert.equal(res.body.success, true)
    assert.equal(res.body.data.userId, U)
    assert.ok(res.body.data.id)
    created.push(res.body.data.id)
    assert.equal(res.body.data.overallScore, 8.5)
    assert.deepEqual(res.body.data.movieTags, ['sci-fi', 'epic'])
  })

  it('GET /reviews 列表返回创建项，可按 userId 过滤', async () => {
    const res = await request(app).get(`/api/community/reviews?userId=${U}`)
    assert.equal(res.status, 200)
    assert.ok(res.body.data.some((r) => r.userId === U && r.movieTags.includes('epic')))
  })

  it('GET /reviews/:id 详情；不存在 404', async () => {
    const id = created[0]
    let res = await request(app).get(`/api/community/reviews/${id}`)
    assert.equal(res.status, 200)
    assert.equal(res.body.data.id, id)

    res = await request(app).get('/api/community/reviews/rev_missing_xyz')
    assert.equal(res.status, 404)
  })

  it('POST /reviews/:id/like 点赞 +1', async () => {
    const id = created[0]
    const before = await request(app).get(`/api/community/reviews/${id}`)
    const liked = await request(app)
      .post(`/api/community/reviews/${id}/like`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    assert.equal(liked.status, 200)
    assert.equal(liked.body.data.likeCount, (before.body.data.likeCount || 0) + 1)
  })

  it('新影评进入热评榜单', async () => {
    const res = await request(app).get('/api/community/leaderboard?period=weekly&limit=100')
    assert.equal(res.status, 200)
    assert.ok(res.body.data.leaderboard.some((x) => x.reviewId === created[0]))
  })
})
