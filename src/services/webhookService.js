import logger from '../utils/logger.js'
import { storageService } from './storageService.js'
import crypto from 'crypto'

/**
 * Webhook 服务
 * 支持注册 Webhook URL，在特定事件发生时发送 HTTP POST 通知
 */

const SUPPORTED_EVENTS = [
  'video.completed',
  'video.failed',
  'script.completed',
  'export.completed',
  'export.failed',
  'analysis.completed',
  'project.created',
  'project.updated',
  'project.deleted',
]

const MAX_DELIVERY_LOGS = 100
const MAX_RETRIES = 3
const REQUEST_TIMEOUT = 10000

class WebhookService {
  constructor() {
    this.webhooks = new Map()
    this.deliveryLogs = []
    this._load()
  }

  _load() {
    try {
      const data = storageService.data.webhooks || { endpoints: [], deliveries: [] }
      for (const endpoint of data.endpoints || []) {
        this.webhooks.set(endpoint.id, endpoint)
      }
      this.deliveryLogs = data.deliveries || []
    } catch (error) {
      logger.warn('Failed to load webhooks:', error.message)
    }
  }

  _persist() {
    try {
      storageService.data.webhooks = {
        endpoints: Array.from(this.webhooks.values()),
        deliveries: this.deliveryLogs.slice(-MAX_DELIVERY_LOGS),
      }
      storageService.save()
    } catch (error) {
      logger.error('Failed to persist webhooks:', error.message)
    }
  }

  /**
   * 注册 Webhook
   */
  registerWebhook({ url, events, userId, name, secret }) {
    try {
      if (!url || !url.startsWith('http')) {
        throw new Error('Invalid webhook URL')
      }
      if (!events || !Array.isArray(events) || events.length === 0) {
        throw new Error('At least one event type is required')
      }
      const invalidEvents = events.filter((e) => !SUPPORTED_EVENTS.includes(e))
      if (invalidEvents.length > 0) {
        throw new Error(`Unsupported events: ${invalidEvents.join(', ')}`)
      }

      const webhook = {
        id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        url,
        events,
        userId: userId || 'default',
        name: name || url,
        secret: secret || '',
        active: true,
        createdAt: new Date().toISOString(),
        lastTriggeredAt: null,
        successCount: 0,
        failureCount: 0,
      }

      this.webhooks.set(webhook.id, webhook)
      this._persist()
      logger.info(`Webhook registered: ${webhook.id} -> ${url}`)
      return webhook
    } catch (error) {
      logger.error('Failed to register webhook:', error.message)
      throw error
    }
  }

  /**
   * 更新 Webhook
   */
  updateWebhook(webhookId, updates) {
    const webhook = this.webhooks.get(webhookId)
    if (!webhook) {
      throw new Error('Webhook not found')
    }

    if (updates.url !== undefined) {
      if (!updates.url.startsWith('http')) {
        throw new Error('Invalid webhook URL')
      }
      webhook.url = updates.url
    }
    if (updates.events !== undefined) {
      const invalidEvents = updates.events.filter((e) => !SUPPORTED_EVENTS.includes(e))
      if (invalidEvents.length > 0) {
        throw new Error(`Unsupported events: ${invalidEvents.join(', ')}`)
      }
      webhook.events = updates.events
    }
    if (updates.name !== undefined) webhook.name = updates.name
    if (updates.active !== undefined) webhook.active = updates.active
    if (updates.secret !== undefined) webhook.secret = updates.secret

    webhook.updatedAt = new Date().toISOString()
    this._persist()
    return webhook
  }

  /**
   * 删除 Webhook
   */
  deleteWebhook(webhookId) {
    if (!this.webhooks.has(webhookId)) {
      throw new Error('Webhook not found')
    }
    this.webhooks.delete(webhookId)
    this._persist()
    logger.info(`Webhook deleted: ${webhookId}`)
    return { success: true }
  }

  /**
   * 获取用户的所有 Webhook
   */
  listWebhooks(userId) {
    return Array.from(this.webhooks.values())
      .filter((w) => !userId || w.userId === userId)
      .map((w) => {
        const rest = { ...w }
        delete rest.secret
        return rest
      })
  }

  /**
   * 获取 Webhook 详情
   */
  getWebhook(webhookId) {
    const webhook = this.webhooks.get(webhookId)
    if (!webhook) return null
    const rest = { ...webhook }
    delete rest.secret
    return rest
  }

  /**
   * 触发事件，发送 Webhook 通知
   */
  async triggerEvent(eventType, payload, userId) {
    try {
      const matchingWebhooks = Array.from(this.webhooks.values()).filter(
        (w) => w.active && w.events.includes(eventType) && (!userId || w.userId === userId)
      )

      if (matchingWebhooks.length === 0) {
        return { delivered: 0, skipped: 0 }
      }

      logger.info(`Triggering webhook event: ${eventType} to ${matchingWebhooks.length} endpoints`)

      const results = await Promise.allSettled(
        matchingWebhooks.map((w) => this._deliver(w, eventType, payload))
      )

      const delivered = results.filter((r) => r.status === 'fulfilled' && r.value?.success).length
      const failed = results.length - delivered

      return { delivered, failed, total: matchingWebhooks.length }
    } catch (error) {
      logger.error('Failed to trigger webhook event:', error.message)
      return { delivered: 0, failed: 0, error: error.message }
    }
  }

  /**
   * 发送 Webhook 通知（带重试）
   */
  async _deliver(webhook, eventType, payload) {
    const eventData = {
      event: eventType,
      timestamp: new Date().toISOString(),
      payload,
    }

    let lastError = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

        const headers = {
          'Content-Type': 'application/json',
          'X-Webhook-Event': eventType,
          'X-Webhook-Delivery': `dlv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        }

        // 如果配置了 secret，添加签名
        if (webhook.secret) {
          headers['X-Webhook-Signature'] = this._generateSignature(webhook.secret, JSON.stringify(eventData))
        }

        const response = await fetch(webhook.url, {
          method: 'POST',
          headers,
          body: JSON.stringify(eventData),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        const deliveryLog = {
          id: `dlv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          webhookId: webhook.id,
          event: eventType,
          url: webhook.url,
          statusCode: response.status,
          success: response.ok,
          attempt,
          timestamp: new Date().toISOString(),
        }

        this.deliveryLogs.push(deliveryLog)
        if (this.deliveryLogs.length > MAX_DELIVERY_LOGS) {
          this.deliveryLogs = this.deliveryLogs.slice(-MAX_DELIVERY_LOGS)
        }

        if (response.ok) {
          webhook.lastTriggeredAt = new Date().toISOString()
          webhook.successCount++
          this._persist()
          return { success: true, statusCode: response.status }
        } else {
          lastError = `HTTP ${response.status}`
          logger.warn(`Webhook delivery failed (attempt ${attempt}): ${webhook.url} -> ${response.status}`)
        }
      } catch (error) {
        lastError = error.message
        logger.warn(`Webhook delivery error (attempt ${attempt}): ${webhook.url} -> ${error.message}`)
      }

      // 重试前等待（指数退避）
      if (attempt < MAX_RETRIES) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt))
      }
    }

    webhook.failureCount++
    this._persist()
    return { success: false, error: lastError }
  }

  /**
   * 生成 HMAC 签名
   */
  _generateSignature(secret, body) {
    try {
      return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`
    } catch {
      return ''
    }
  }

  /**
   * 获取投递日志
   */
  getDeliveryLogs(webhookId, limit = 50) {
    let logs = this.deliveryLogs
    if (webhookId) {
      logs = logs.filter((l) => l.webhookId === webhookId)
    }
    return logs.slice(-limit).reverse()
  }

  /**
   * 获取支持的事件类型
   */
  getSupportedEvents() {
    return SUPPORTED_EVENTS
  }

  /**
   * 测试 Webhook（发送测试事件）
   */
  async testWebhook(webhookId) {
    const webhook = this.webhooks.get(webhookId)
    if (!webhook) {
      throw new Error('Webhook not found')
    }
    return this._deliver(webhook, 'test', { message: 'Test webhook from DreamReel', timestamp: new Date().toISOString() })
  }
}

export const webhookService = new WebhookService()
export default webhookService
