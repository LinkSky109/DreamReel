import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import app from '../src/server.js'
import { storageService } from '../src/services/storageService.js'
import { authService } from '../src/services/authService.js'

let AUTHOR
let ACTOR
let authorToken
let actorToken
let reviewId
const notifIds = []

function register(prefix) {
  const reg = authService.register({
    username: `${prefix}${Date.now()}`,
    email: `${prefix}-${Date.now()}@example.com`,
    password: 'secret-123',
  })
  return reg
}

function cleanup() {
  if (storageService.data.reviews) delete storageService.data.reviews[reviewId]
  delete storageService.data.users?.[AUTHOR]
  delete storageService.data.users?.[ACTOR]
  const notifs = storageService.data.notifications || {}
  for (const id of Object.keys(notifs)) {
    if (notifs[id].userId === AUTHOR || notifs[id].userId === ACTOR) delete notifs[id]
  }
  storageService._flush()
}

describe('影评社区 /api/community/notifications', () => {
  before(async () => {
    const author = register('notifauthor')
    const actor = register('notifactor')
    AUTHOR = author.user.id
    ACTOR = actor.user.id
    authorToken = author.token
    actorToken = actor.token

    const res = await request(app)
      .post('/api/community/reviews')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ title: '被点赞的影评', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8 })
    reviewId = res.body.data.id
  })

  after(cleanup)

  it('匿名请求不返回他人通知', async () => {
    const res = await request(app).get('/api/community/notifications')
    assert.equal(res.status, 200)
    assert.equal(res.body.data.unreadCount, 0)
  })

  it('他人点赞后作者收到 like 通知且未读数为 1', async () => {
    const like = await request(app)
      .post(`/api/community/reviews/${reviewId}/like`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({})
    assert.equal(like.status, 200)

    const list = await request(app)
      .get('/api/community/notifications')
      .set('Authorization', `Bearer ${authorToken}`)
    assert.equal(list.status, 200)
    assert.equal(list.body.data.unreadCount, 1)
    const notif = list.body.data.items.find((n) => n.type === 'like')
    assert.ok(notif)
    assert.equal(notif.sourceId, reviewId)
    notifIds.push(notif.id)

    const count = await request(app)
      .get('/api/community/notifications/unread-count')
      .set('Authorization', `Bearer ${authorToken}`)
    assert.equal(count.body.data.count, 1)
  })

  it('本人点赞不产生通知', async () => {
    const before = await request(app)
      .get('/api/community/notifications/unread-count')
      .set('Authorization', `Bearer ${authorToken}`)
    await request(app)
      .post(`/api/community/reviews/${reviewId}/like`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({})
    const after = await request(app)
      .get('/api/community/notifications/unread-count')
      .set('Authorization', `Bearer ${authorToken}`)
    assert.equal(after.body.data.count, before.body.data.count)
  })

  it('单条已读：isRead=true 且未读数归零；不存在 404', async () => {
    const read = await request(app)
      .post(`/api/community/notifications/${notifIds[0]}/read`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({})
    assert.equal(read.status, 200)
    assert.equal(read.body.data.isRead, true)

    const count = await request(app)
      .get('/api/community/notifications/unread-count')
      .set('Authorization', `Bearer ${authorToken}`)
    assert.equal(count.body.data.count, 0)

    const missing = await request(app)
      .post('/api/community/notifications/not_missing/read')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({})
    assert.equal(missing.status, 404)
  })

  it('全部已读返回 markedCount', async () => {
    await request(app)
      .post(`/api/community/reviews/${reviewId}/like`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({})
    const all = await request(app)
      .post('/api/community/notifications/read-all')
      .set('Authorization', `Bearer ${authorToken}`)
      .send({})
    assert.equal(all.status, 200)
    assert.ok(all.body.data.markedCount >= 1)
    const count = await request(app)
      .get('/api/community/notifications/unread-count')
      .set('Authorization', `Bearer ${authorToken}`)
    assert.equal(count.body.data.count, 0)
  })
})
