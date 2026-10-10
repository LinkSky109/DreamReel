import { Router } from 'express'
import { webhookService } from '../services/webhookService.js'

const router = Router()

/**
 * 获取所有 Webhook
 */
router.get('/', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const webhooks = webhookService.listWebhooks(userId)
    res.json({ webhooks })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取支持的事件类型
 */
router.get('/events', (req, res) => {
  try {
    const events = webhookService.getSupportedEvents()
    res.json({ events })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 注册 Webhook
 */
router.post('/', (req, res) => {
  try {
    const { url, events, name, secret } = req.body
    const userId = req.user?.id || 'default'
    const webhook = webhookService.registerWebhook({ url, events, name, secret, userId })
    const safeWebhook = { ...webhook }
    delete safeWebhook.secret
    res.status(201).json(safeWebhook)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取 Webhook 详情
 */
router.get('/:webhookId', (req, res) => {
  try {
    const webhook = webhookService.getWebhook(req.params.webhookId)
    if (!webhook) {
      return res.status(404).json({ error: 'Webhook not found' })
    }
    res.json(webhook)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 更新 Webhook
 */
router.put('/:webhookId', (req, res) => {
  try {
    const webhook = webhookService.updateWebhook(req.params.webhookId, req.body)
    const safeWebhook = { ...webhook }
    delete safeWebhook.secret
    res.json(safeWebhook)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 删除 Webhook
 */
router.delete('/:webhookId', (req, res) => {
  try {
    const result = webhookService.deleteWebhook(req.params.webhookId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 测试 Webhook
 */
router.post('/:webhookId/test', async (req, res) => {
  try {
    const result = await webhookService.testWebhook(req.params.webhookId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取投递日志
 */
router.get('/:webhookId/deliveries', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50
    const logs = webhookService.getDeliveryLogs(req.params.webhookId, limit)
    res.json({ deliveries: logs })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
