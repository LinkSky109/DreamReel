/**
 * Movie Review Community API - Wave 2
 * Entry point exposing all community interaction features.
 */

import { createServer } from 'http'
import { URL } from 'url'

import { storageService } from './services/storageService.js'
import { getLeaderboard } from './services/rankingService.js'
import {
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from './services/notificationService.js'
import { getRecommendations } from './services/recommendationService.js'
import {
  submitReport,
  getPendingReports,
  getReports,
  processReport,
  getReport,
} from './services/moderationService.js'

// Seed data helper for demonstration
export async function seedData() {
  await storageService.clearAll()

  const { User } = await import('./models/user.js')
  const { Review } = await import('./models/review.js')

  const userA = await storageService.createUser(
    new User({ id: 'usr_a', name: 'Alice', preferenceTags: ['sci-fi', 'action'], scoreStyle: { story: 8, visual: 9, performance: 7, soundtrack: 6 } })
  )
  const userB = await storageService.createUser(
    new User({ id: 'usr_b', name: 'Bob', preferenceTags: ['drama', 'romance'], scoreStyle: { story: 9, visual: 6, performance: 8, soundtrack: 7 } })
  )
  const userC = await storageService.createUser(
    new User({ id: 'usr_c', name: 'Carol', preferenceTags: ['sci-fi', 'noir'], scoreStyle: { story: 7, visual: 8, performance: 9, soundtrack: 8 }, role: 'admin' })
  )

  const now = Date.now()

  const review1 = await storageService.createReview(
    new Review({
      id: 'rev_1',
      userId: userA.id,
      movieId: 'mov_inception',
      title: 'Inception - Mind-bending masterpiece',
      content: 'A layered dream narrative...',
      storyScore: 9,
      visualScore: 10,
      performanceScore: 8,
      soundtrackScore: 9,
      movieTags: ['sci-fi', 'action', 'thriller'],
      likeCount: 42,
      commentCount: 15,
      favoriteCount: 8,
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2h ago
    })
  )

  const review2 = await storageService.createReview(
    new Review({
      id: 'rev_2',
      userId: userB.id,
      movieId: 'mov_titanic',
      title: 'Titanic - Timeless romance',
      content: 'The love story transcends...',
      storyScore: 8,
      visualScore: 9,
      performanceScore: 7,
      soundtrackScore: 10,
      movieTags: ['drama', 'romance', 'history'],
      likeCount: 35,
      commentCount: 10,
      favoriteCount: 12,
      createdAt: new Date(now - 24 * 60 * 60 * 1000).toISOString(), // 1d ago
    })
  )

  const review3 = await storageService.createReview(
    new Review({
      id: 'rev_3',
      userId: userA.id,
      movieId: 'mov_blade_runner',
      title: 'Blade Runner 2049 - Visual poetry',
      content: 'Every frame is a painting...',
      storyScore: 7,
      visualScore: 10,
      performanceScore: 8,
      soundtrackScore: 9,
      movieTags: ['sci-fi', 'noir', 'drama'],
      likeCount: 28,
      commentCount: 8,
      favoriteCount: 5,
      createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString(), // 5h ago
    })
  )

  return { users: [userA, userB, userC], reviews: [review1, review2, review3] }
}

function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        reject(new Error('Invalid JSON'))
      }
    })
  })
}

const routes = {
  'GET /api/leaderboard': async (_req, res, query) => {
    const period = query.get('period') || 'weekly'
    const limit = Math.min(100, parseInt(query.get('limit') || '20', 10))
    const data = await getLeaderboard(period, limit)
    jsonResponse(res, 200, { success: true, data: { period, leaderboard: data } })
  },

  'GET /api/notifications': async (req, res, query) => {
    const userId = query.get('userId')
    if (!userId) return jsonResponse(res, 400, { success: false, error: 'userId required' })
    const unreadOnly = query.get('unreadOnly') === 'true'
    const limit = parseInt(query.get('limit') || '50', 10)
    const data = await getUserNotifications(userId, { unreadOnly, limit })
    jsonResponse(res, 200, { success: true, data })
  },

  'GET /api/notifications/unread-count': async (_req, res, query) => {
    const userId = query.get('userId')
    if (!userId) return jsonResponse(res, 400, { success: false, error: 'userId required' })
    const count = await getUnreadCount(userId)
    jsonResponse(res, 200, { success: true, data: { count } })
  },

  'POST /api/notifications/:id/read': async (req, res, _query, params) => {
    const body = await parseBody(req)
    const userId = body.userId
    if (!userId) return jsonResponse(res, 400, { success: false, error: 'userId required' })
    const result = await markAsRead(params.id, userId)
    if (!result) return jsonResponse(res, 404, { success: false, error: 'Notification not found' })
    jsonResponse(res, 200, { success: true, data: result })
  },

  'POST /api/notifications/read-all': async (req, res) => {
    const body = await parseBody(req)
    const userId = body.userId
    if (!userId) return jsonResponse(res, 400, { success: false, error: 'userId required' })
    const count = await markAllAsRead(userId)
    jsonResponse(res, 200, { success: true, data: { markedCount: count } })
  },

  'GET /api/recommendations': async (_req, res, query) => {
    const userId = query.get('userId')
    if (!userId) return jsonResponse(res, 400, { success: false, error: 'userId required' })
    const limit = parseInt(query.get('limit') || '10', 10)
    const data = await getRecommendations(userId, limit)
    jsonResponse(res, 200, { success: true, data })
  },

  'POST /api/reports': async (req, res) => {
    const body = await parseBody(req)
    const { reviewId, reporterId, reason } = body
    if (!reviewId || !reporterId || !reason) {
      return jsonResponse(res, 400, { success: false, error: 'reviewId, reporterId, reason required' })
    }
    try {
      const report = await submitReport(reviewId, reporterId, reason)
      jsonResponse(res, 201, { success: true, data: report })
    } catch (err) {
      jsonResponse(res, 409, { success: false, error: err.message })
    }
  },

  'GET /api/reports': async (_req, res, query) => {
    const status = query.get('status') || undefined
    const data = await getReports(status)
    jsonResponse(res, 200, { success: true, data })
  },

  'GET /api/reports/pending': async (_req, res) => {
    const data = await getPendingReports()
    jsonResponse(res, 200, { success: true, data })
  },

  'POST /api/reports/:id/process': async (req, res, _query, params) => {
    const body = await parseBody(req)
    const { decision, adminId, adminNote } = body
    if (!decision || !adminId) {
      return jsonResponse(res, 400, { success: false, error: 'decision and adminId required' })
    }
    try {
      const report = await processReport(params.id, decision, adminId, adminNote)
      jsonResponse(res, 200, { success: true, data: report })
    } catch (err) {
      jsonResponse(res, 400, { success: false, error: err.message })
    }
  },

  'GET /api/reports/:id': async (_req, res, _query, params) => {
    const report = await getReport(params.id)
    if (!report) return jsonResponse(res, 404, { success: false, error: 'Report not found' })
    jsonResponse(res, 200, { success: true, data: report })
  },
}

function matchRoute(method, pathname) {
  for (const [routeKey, handler] of Object.entries(routes)) {
    const [routeMethod, routePath] = routeKey.split(' ')
    if (routeMethod !== method) continue

    // Exact match
    if (routePath === pathname) {
      return { handler, params: {} }
    }

    // Param match: /api/reports/:id
    const routeParts = routePath.split('/')
    const pathParts = pathname.split('/')
    if (routeParts.length !== pathParts.length) continue

    const params = {}
    let match = true
    for (let i = 0; i < routeParts.length; i++) {
      if (routeParts[i].startsWith(':')) {
        params[routeParts[i].slice(1)] = pathParts[i]
      } else if (routeParts[i] !== pathParts[i]) {
        match = false
        break
      }
    }

    if (match) {
      return { handler, params }
    }
  }
  return null
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`)
      const match = matchRoute(req.method, url.pathname)

      if (!match) {
        jsonResponse(res, 404, { success: false, error: 'Not found' })
        return
      }

      await match.handler(req, res, url.searchParams, match.params)
    } catch (err) {
      jsonResponse(res, 500, { success: false, error: err.message })
    }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await seedData()
  const server = createApp()
  server.listen(3000, () => {
    // eslint-disable-next-line no-console
    console.log('Movie Review Community API listening on port 3000')
  })
}

