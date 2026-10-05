import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { notificationService, NOTIFICATION_TYPE } from '../src/services/notificationService.js'

describe('NotificationPreferences', () => {
  beforeEach(() => {
    notificationService.notifications.clear()
    notificationService.preferences.clear()
  })

  after(() => {
    notificationService.notifications.clear()
    notificationService.preferences.clear()
  })

  it('should get default preferences with all types enabled', () => {
    const prefs = notificationService.getPreferences('test-user')
    assert.ok(prefs)
    assert.equal(prefs[NOTIFICATION_TYPE.VIDEO_COMPLETED], true)
    assert.equal(prefs[NOTIFICATION_TYPE.VIDEO_FAILED], true)
    assert.equal(prefs[NOTIFICATION_TYPE.SCRIPT_COMPLETED], true)
    assert.equal(prefs[NOTIFICATION_TYPE.EXPORT_COMPLETED], true)
    assert.equal(prefs[NOTIFICATION_TYPE.EXPORT_FAILED], true)
    assert.equal(prefs[NOTIFICATION_TYPE.ANALYSIS_COMPLETED], true)
    assert.equal(prefs[NOTIFICATION_TYPE.COLLABORATION], true)
    assert.equal(prefs[NOTIFICATION_TYPE.SYSTEM], true)
    assert.equal(prefs[NOTIFICATION_TYPE.MENTION], true)
    assert.equal(prefs[NOTIFICATION_TYPE.COMMENT_REPLY], true)
  })

  it('should update preferences', () => {
    notificationService.updatePreferences('test-user', {
      [NOTIFICATION_TYPE.VIDEO_COMPLETED]: false,
      [NOTIFICATION_TYPE.MENTION]: false,
    })

    const prefs = notificationService.getPreferences('test-user')
    assert.equal(prefs[NOTIFICATION_TYPE.VIDEO_COMPLETED], false)
    assert.equal(prefs[NOTIFICATION_TYPE.MENTION], false)
    // 其他类型应保持默认启用
    assert.equal(prefs[NOTIFICATION_TYPE.VIDEO_FAILED], true)
    assert.equal(prefs[NOTIFICATION_TYPE.SYSTEM], true)
  })

  it('should check if type is enabled', () => {
    assert.equal(notificationService.isTypeEnabled('test-user', NOTIFICATION_TYPE.VIDEO_COMPLETED), true)

    notificationService.updatePreferences('test-user', {
      [NOTIFICATION_TYPE.VIDEO_COMPLETED]: false,
    })

    assert.equal(notificationService.isTypeEnabled('test-user', NOTIFICATION_TYPE.VIDEO_COMPLETED), false)
    assert.equal(notificationService.isTypeEnabled('test-user', NOTIFICATION_TYPE.VIDEO_FAILED), true)
  })

  it('should skip notification creation when type disabled', () => {
    notificationService.updatePreferences('test-user', {
      [NOTIFICATION_TYPE.VIDEO_COMPLETED]: false,
    })

    const result = notificationService.create({
      userId: 'test-user',
      type: NOTIFICATION_TYPE.VIDEO_COMPLETED,
      title: 'Test',
      message: 'Test message',
    })

    assert.equal(result, null)
    const notifications = notificationService.getByUser('test-user')
    assert.equal(notifications.length, 0)
  })

  it('should create notification when type enabled', () => {
    const result = notificationService.create({
      userId: 'test-user',
      type: NOTIFICATION_TYPE.VIDEO_COMPLETED,
      title: 'Test',
      message: 'Test message',
    })

    assert.ok(result)
    assert.equal(result.type, NOTIFICATION_TYPE.VIDEO_COMPLETED)
    const notifications = notificationService.getByUser('test-user')
    assert.equal(notifications.length, 1)
  })

  it('should have independent preferences per user', () => {
    notificationService.updatePreferences('user-a', {
      [NOTIFICATION_TYPE.VIDEO_COMPLETED]: false,
    })

    // user-b 应该有默认偏好
    assert.equal(notificationService.isTypeEnabled('user-b', NOTIFICATION_TYPE.VIDEO_COMPLETED), true)
    // user-a 应该已禁用
    assert.equal(notificationService.isTypeEnabled('user-a', NOTIFICATION_TYPE.VIDEO_COMPLETED), false)
  })

  it('should use default user when userId not provided', () => {
    const prefs = notificationService.getPreferences(null)
    assert.ok(prefs)
    assert.equal(prefs[NOTIFICATION_TYPE.SYSTEM], true)
  })

  it('should return copy of preferences to prevent external mutation', () => {
    const prefs = notificationService.getPreferences('test-user')
    prefs[NOTIFICATION_TYPE.VIDEO_COMPLETED] = false

    // 内部状态不应被修改
    const internalPrefs = notificationService.getPreferences('test-user')
    assert.equal(internalPrefs[NOTIFICATION_TYPE.VIDEO_COMPLETED], true)
  })

  it('should disable all comment-related notifications', () => {
    notificationService.updatePreferences('test-user', {
      [NOTIFICATION_TYPE.MENTION]: false,
      [NOTIFICATION_TYPE.COMMENT_REPLY]: false,
      [NOTIFICATION_TYPE.COLLABORATION]: false,
    })

    assert.equal(notificationService.isTypeEnabled('test-user', NOTIFICATION_TYPE.MENTION), false)
    assert.equal(notificationService.isTypeEnabled('test-user', NOTIFICATION_TYPE.COMMENT_REPLY), false)
    assert.equal(notificationService.isTypeEnabled('test-user', NOTIFICATION_TYPE.COLLABORATION), false)
    // 视频通知应保持启用
    assert.equal(notificationService.isTypeEnabled('test-user', NOTIFICATION_TYPE.VIDEO_COMPLETED), true)
  })
})
