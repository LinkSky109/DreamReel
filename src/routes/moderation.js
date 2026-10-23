import { Router } from 'express'
import { AppError } from '../utils/appError.js'
import { contentModerationService } from '../services/contentModerationService.js'

const router = Router()

// 审核文本内容
router.post('/check', (req, res) => {
  try {
    const { text, context } = req.body
    if (!text) {
      return res.status(400).json({ error: 'text is required' })
    }
    const result = contentModerationService.moderate(text, {
      userId: req.userId,
      context,
    })
    res.json(result)
  } catch (error) {
    throw AppError.badRequest(error.message, { cause: error })
  }
})

// 批量审核
router.post('/check-batch', (req, res) => {
  try {
    const { texts, context } = req.body
    if (!texts || !Array.isArray(texts)) {
      return res.status(400).json({ error: 'texts array is required' })
    }
    const result = contentModerationService.moderateBatch(texts, {
      userId: req.userId,
      context,
    })
    res.json(result)
  } catch (error) {
    throw AppError.badRequest(error.message, { cause: error })
  }
})

// 获取审核统计
router.get('/stats', (_req, res) => {
  try {
    const stats = contentModerationService.getStats()
    res.json(stats)
  } catch (error) {
    throw AppError.badRequest(error.message, { cause: error })
  }
})

// 获取审核日志
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50
    const logs = contentModerationService.getAuditLog(limit)
    res.json({ logs, total: logs.length })
  } catch (error) {
    throw AppError.badRequest(error.message, { cause: error })
  }
})

export default router
