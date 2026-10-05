import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { webhookService } from '../src/services/webhookService.js'
import { storageService } from '../src/services/storageService.js'

describe('WebhookService', () => {
  beforeEach(() => {
    // 清理测试数据
    if (storageService.data.webhooks) {
      storageService.data.webhooks = { endpoints: [], deliveries: [] }
    }
    webhookService.webhooks.clear()
    webhookService.deliveryLogs = []
  })

  afterEach(() => {
    webhookService.webhooks.clear()
    webhookService.deliveryLogs = []
  })

  it('should register a webhook', () => {
    const webhook = webhookService.registerWebhook({
      url: 'https://example.com/webhook',
      events: ['video.completed'],
      userId: 'test-user',
      name: 'Test Webhook',
    })

    assert.ok(webhook.id)
    assert.equal(webhook.url, 'https://example.com/webhook')
    assert.deepEqual(webhook.events, ['video.completed'])
    assert.equal(webhook.userId, 'test-user')
    assert.equal(webhook.name, 'Test Webhook')
    assert.equal(webhook.active, true)
  })

  it('should reject invalid URL', () => {
    assert.throws(() => {
      webhookService.registerWebhook({
        url: 'not-a-url',
        events: ['video.completed'],
      })
    }, /Invalid webhook URL/)
  })

  it('should reject unsupported events', () => {
    assert.throws(() => {
      webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        events: ['invalid.event'],
      })
    }, /Unsupported events/)
  })

  it('should reject empty events', () => {
    assert.throws(() => {
      webhookService.registerWebhook({
        url: 'https://example.com/webhook',
        events: [],
      })
    }, /At least one event type is required/)
  })

  it('should list webhooks for user', () => {
    webhookService.registerWebhook({
      url: 'https://example.com/1',
      events: ['video.completed'],
      userId: 'user1',
    })
    webhookService.registerWebhook({
      url: 'https://example.com/2',
      events: ['script.completed'],
      userId: 'user2',
    })

    const user1Webhooks = webhookService.listWebhooks('user1')
    assert.equal(user1Webhooks.length, 1)
    assert.equal(user1Webhooks[0].url, 'https://example.com/1')
  })

  it('should not return secret in list', () => {
    webhookService.registerWebhook({
      url: 'https://example.com/webhook',
      events: ['video.completed'],
      secret: 'my-secret',
    })

    const webhooks = webhookService.listWebhooks()
    assert.equal(webhooks[0].secret, undefined)
  })

  it('should update webhook', () => {
    const webhook = webhookService.registerWebhook({
      url: 'https://example.com/webhook',
      events: ['video.completed'],
    })

    const updated = webhookService.updateWebhook(webhook.id, {
      name: 'Updated Name',
      active: false,
    })

    assert.equal(updated.name, 'Updated Name')
    assert.equal(updated.active, false)
  })

  it('should delete webhook', () => {
    const webhook = webhookService.registerWebhook({
      url: 'https://example.com/webhook',
      events: ['video.completed'],
    })

    const result = webhookService.deleteWebhook(webhook.id)
    assert.equal(result.success, true)

    const webhooks = webhookService.listWebhooks()
    assert.equal(webhooks.length, 0)
  })

  it('should return supported events', () => {
    const events = webhookService.getSupportedEvents()
    assert.ok(Array.isArray(events))
    assert.ok(events.includes('video.completed'))
    assert.ok(events.includes('script.completed'))
  })

  it('should generate HMAC signature', () => {
    const signature = webhookService._generateSignature('secret', 'body')
    assert.ok(signature.startsWith('sha256='))
    assert.equal(signature.length, 7 + 64) // sha256= + 64 hex chars
  })

  it('should get delivery logs', () => {
    webhookService.deliveryLogs = [
      { id: '1', webhookId: 'wh1', event: 'video.completed', success: true, timestamp: new Date().toISOString() },
      { id: '2', webhookId: 'wh2', event: 'script.completed', success: false, timestamp: new Date().toISOString() },
    ]

    const logs = webhookService.getDeliveryLogs('wh1')
    assert.equal(logs.length, 1)
    assert.equal(logs[0].webhookId, 'wh1')
  })

  it('should trigger event with no matching webhooks', async () => {
    const result = await webhookService.triggerEvent('video.completed', {}, 'nonexistent-user')
    assert.equal(result.delivered, 0)
  })
})
