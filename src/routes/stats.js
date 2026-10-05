import { Router } from 'express'
import { statsService } from '../services/statsService.js'

const router = Router()

/**
 * 获取仪表盘完整数据
 * GET /api/stats/dashboard
 */
router.get('/dashboard', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const dashboard = statsService.getDashboard(userId)
    res.json(dashboard)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取概览统计
 * GET /api/stats/overview
 */
router.get('/overview', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    res.json(statsService.getOverview(userId))
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取创作趋势
 * GET /api/stats/trend?days=14
 */
router.get('/trend', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const days = parseInt(req.query.days, 10) || 14
    res.json(statsService.getTrend(userId, days))
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取风格分布
 * GET /api/stats/styles
 */
router.get('/styles', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    res.json(statsService.getStyleDistribution(userId))
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取额度使用
 * GET /api/stats/quota
 */
router.get('/quota', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    res.json(statsService.getQuotaUsage(userId))
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
