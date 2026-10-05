import { Router } from 'express'
import { quotaService } from '../services/quotaService.js'

const router = Router()

// 获取当前用户额度（推荐）
router.get('/me', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const overview = quotaService.getQuotaOverview(userId)
    res.json(overview)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取指定用户额度（向后兼容）
router.get('/:userId', (req, res) => {
  try {
    const userId = req.params.userId || 'default'
    const overview = quotaService.getQuotaOverview(userId)
    res.json(overview)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
