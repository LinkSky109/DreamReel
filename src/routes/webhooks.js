import { Router } from 'express'
import { webhookService } from '../services/webhookService.js'

const router = Router()

/** 身份只来自 req.auth/req.user；无登录态时保持旧行为（default），生产由 authGate 拦截。 */
function currentUserId(req) {
  return req.userId
}

/**
 * 加载 Webhook 并校验归属，避免跨用户读取/修改/删除。
 * 失败时已发送 404/403，返回 null。
 */
function loadOwnedWebhook(req, res) {
  const webhook = webhookService.getWebhook(req.params.webhookId)
  if (!webhook) {
    res.status(404).json({ error: 'Webhook not found' })
    return null
  }
  if (webhook.userId && webhook.userId !== currentUserId(req)) {
    res.status(403).json({ error: '无权操作该 Webhook' })
    return null
  }
  return webhook
}

/**
 * 获取所有 Webhook
 */
router.get('/', (req, res) => {
  try {
    const userId = currentUserId(req)
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
    const userId = currentUserId(req)
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
    const webhook = loadOwnedWebhook(req, res)
    if (!webhook) return
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
    if (!loadOwnedWebhook(req, res)) return
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
    if (!loadOwnedWebhook(req, res)) return
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
    if (!loadOwnedWebhook(req, res)) return
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
    if (!loadOwnedWebhook(req, res)) return
    const limit = parseInt(req.query.limit, 10) || 50
    const logs = webhookService.getDeliveryLogs(req.params.webhookId, limit)
    res.json({ deliveries: logs })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
