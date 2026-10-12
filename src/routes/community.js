import { Router } from 'express'
import { getLeaderboard } from '../services/rankingService.js'
import { getRecommendations } from '../services/recommendationService.js'
import {
  submitReport,
  getReports,
  getPendingReports,
  processReport,
  getReport,
} from '../services/moderationService.js'
import { createReview, listReviews, getReview, likeReview } from '../services/reviewService.js'
import {
  createNotification,
  listNotifications,
  getUnreadCount as getCommunityUnreadCount,
  markAsRead as markCommunityNotificationRead,
  markAllAsRead as markAllCommunityRead,
} from '../services/communityNotificationService.js'

/**
 * 影评社区（Wave 2）路由，挂载于 /api/community。
 *
 * 原实现位于孤立的 src/app.js（独立 node:http 服务、import 即报错）。此处以标准
 * Express 路由接入主服务，复用 rankingService / recommendationService /
 * moderationService，统一响应信封 { success, data } / { success, error }。
 *
 * 命名空间：使用 /api/community 前缀，避免与既有 /api/notifications（平台通知）
 * 和 /api/moderation（文本内容审核）冲突。
 *
 * 身份：本模块沿用社区用户命名空间（storageService.users），采用 authOptional；
 * 登录用户的 req.user.id 优先，否则回退到 query/body 中的 userId。
 */

const router = Router()

function resolveUserId(req) {
  return req.user?.id || req.query?.userId || req.body?.userId || null
}

// 热评榜单
router.get('/leaderboard', async (req, res) => {
  try {
    const period = req.query.period || 'weekly'
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 20)
    const data = await getLeaderboard(period, limit)
    res.json({ success: true, data: { period, leaderboard: data } })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 个性化推荐
router.get('/recommendations', async (req, res) => {
  try {
    const userId = resolveUserId(req)
    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId required' })
    }
    const limit = Math.min(50, parseInt(req.query.limit, 10) || 10)
    const data = await getRecommendations(userId, limit)
    res.json({ success: true, data })
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400
    res.status(status).json({ success: false, error: error.message })
  }
})

// 发布影评
router.post('/reviews', async (req, res) => {
  try {
    const body = req.body || {}
    const userId = req.user?.id || body.userId
    if (!body.title || !userId) {
      return res.status(400).json({ success: false, error: 'userId and title required' })
    }
    const review = createReview({ ...body, userId })
    res.status(201).json({ success: true, data: review })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 影评列表（可按 userId / movieId 过滤）
router.get('/reviews', async (req, res) => {
  try {
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50)
    const data = listReviews({
      userId: req.query.userId,
      movieId: req.query.movieId,
      status: req.query.status || 'published',
      limit,
    })
    res.json({ success: true, data })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 影评详情
router.get('/reviews/:id', async (req, res) => {
  try {
    const review = getReview(req.params.id)
    if (!review) {
      return res.status(404).json({ success: false, error: 'Review not found' })
    }
    res.json({ success: true, data: review })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 点赞影评（非本人点赞时通知作者）
router.post('/reviews/:id/like', async (req, res) => {
  try {
    const review = likeReview(req.params.id)
    const actor = req.user?.id || req.body?.userId
    if (actor && review.userId && actor !== review.userId) {
      createNotification({
        userId: review.userId,
        type: 'like',
        sourceId: review.id,
        sourceType: 'review',
        message: `你的影评《${review.title}》收到一个赞`,
      })
    }
    res.json({ success: true, data: review })
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400
    res.status(status).json({ success: false, error: error.message })
  }
})

// ===== 社区通知（与平台 /api/notifications 相互独立） =====

// 通知列表
router.get('/notifications', async (req, res) => {
  try {
    const userId = resolveUserId(req)
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' })
    const unreadOnly = req.query.unreadOnly === 'true'
    const limit = Math.min(100, parseInt(req.query.limit, 10) || 50)
    const items = listNotifications(userId, { unreadOnly, limit })
    res.json({ success: true, data: { items, unreadCount: getCommunityUnreadCount(userId) } })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 未读数量
router.get('/notifications/unread-count', async (req, res) => {
  try {
    const userId = resolveUserId(req)
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' })
    res.json({ success: true, data: { count: getCommunityUnreadCount(userId) } })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 全部已读
router.post('/notifications/read-all', async (req, res) => {
  try {
    const userId = req.user?.id || req.body?.userId
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' })
    res.json({ success: true, data: markAllCommunityRead(userId) })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 单条已读
router.post('/notifications/:id/read', async (req, res) => {
  try {
    const result = markCommunityNotificationRead(req.params.id)
    if (!result) return res.status(404).json({ success: false, error: 'Notification not found' })
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 举报影评（静态路径先于 /:id 注册）
router.post('/reports', async (req, res) => {
  try {
    const { reviewId, reason } = req.body || {}
    const reporterId = req.user?.id || req.body?.reporterId
    if (!reviewId || !reporterId || !reason) {
      return res.status(400).json({ success: false, error: 'reviewId, reporterId, reason required' })
    }
    const report = await submitReport(reviewId, reporterId, reason)
    res.status(201).json({ success: true, data: report })
  } catch (error) {
    const status = /already reported/i.test(error.message)
      ? 409
      : /not found/i.test(error.message)
        ? 404
        : 400
    res.status(status).json({ success: false, error: error.message })
  }
})

// 举报列表（可按 status 过滤；不传返回全部）
router.get('/reports', async (req, res) => {
  try {
    const data = await getReports(req.query.status || null)
    res.json({ success: true, data })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 待处理举报
router.get('/reports/pending', async (_req, res) => {
  try {
    const data = await getPendingReports()
    res.json({ success: true, data })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 举报详情
router.get('/reports/:id', async (req, res) => {
  try {
    const report = await getReport(req.params.id)
    if (!report) {
      return res.status(404).json({ success: false, error: 'Report not found' })
    }
    res.json({ success: true, data: report })
  } catch (error) {
    res.status(400).json({ success: false, error: error.message })
  }
})

// 处理举报（审核通过则隐藏被举报影评）
router.post('/reports/:id/process', async (req, res) => {
  try {
    const { decision, adminNote } = req.body || {}
    const adminId = req.user?.id || req.body?.adminId
    if (!decision || !adminId) {
      return res.status(400).json({ success: false, error: 'decision and adminId required' })
    }
    const report = await processReport(req.params.id, decision, adminId, adminNote)
    res.json({ success: true, data: report })
  } catch (error) {
    const status = /not found/i.test(error.message) ? 404 : 400
    res.status(status).json({ success: false, error: error.message })
  }
})

export default router
