import { Router } from 'express'
import { subscriptionService } from '../services/subscriptionService.js'
import { authRequired } from '../middleware/auth.js'

const router = Router()

/**
 * 获取所有订阅计划
 * GET /api/subscription/plans
 */
router.get('/plans', (_req, res) => {
  const plans = subscriptionService.getPlans()
  res.json({ plans })
})

/**
 * 获取当前用户订阅信息
 * GET /api/subscription/current
 */
router.get('/current', authRequired, (req, res) => {
  try {
    const features = subscriptionService.getUserFeatures(req.user.id)
    res.json(features)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 订阅/升级计划
 * POST /api/subscription/subscribe
 * Body: { planId, billingCycle, paymentInfo }
 */
router.post('/subscribe', authRequired, (req, res) => {
  try {
    const { planId, billingCycle, paymentInfo } = req.body
    if (!planId) {
      return res.status(400).json({ error: '请选择订阅计划' })
    }
    const result = subscriptionService.subscribe(req.user.id, planId, billingCycle, paymentInfo)
    res.status(201).json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 取消订阅
 * POST /api/subscription/cancel
 */
router.post('/cancel', authRequired, (req, res) => {
  try {
    const subscription = subscriptionService.cancelSubscription(req.user.id)
    res.json({ subscription, message: '已取消订阅，将在当前周期结束后生效' })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 恢复订阅
 * POST /api/subscription/reactivate
 */
router.post('/reactivate', authRequired, (req, res) => {
  try {
    const subscription = subscriptionService.reactivateSubscription(req.user.id)
    res.json({ subscription, message: '订阅已恢复' })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
