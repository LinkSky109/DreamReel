import { Router } from 'express'
import { AppError } from '../utils/appError.js'
import { quotaService } from '../services/quotaService.js'

const router = Router()

// 获取当前用户额度（推荐）
router.get('/me', (req, res) => {
  try {
    const userId = req.userId
    const overview = quotaService.getQuotaOverview(userId)
    res.json(overview)
  } catch (error) {
    throw AppError.badRequest(error.message, { cause: error })
  }
})

// 获取指定用户额度（向后兼容）
router.get('/:userId', (req, res) => {
  try {
    const userId = req.userId
    const overview = quotaService.getQuotaOverview(userId)
    res.json(overview)
  } catch (error) {
    throw AppError.badRequest(error.message, { cause: error })
  }
})

export default router
