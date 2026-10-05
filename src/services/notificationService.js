import { v4 as uuidv4 } from 'uuid'
import { logger } from '../utils/logger.js'

/**
 * 通知服务
 * 管理用户通知，支持多种类型和已读状态
 */

export const NOTIFICATION_TYPE = {
  VIDEO_COMPLETED: 'video_completed',
  VIDEO_FAILED: 'video_failed',
  SCRIPT_COMPLETED: 'script_completed',
  EXPORT_COMPLETED: 'export_completed',
  EXPORT_FAILED: 'export_failed',
  ANALYSIS_COMPLETED: 'analysis_completed',
  COLLABORATION: 'collaboration',
  SYSTEM: 'system',
  MENTION: 'mention',
  COMMENT_REPLY: 'comment_reply',
}

const TYPE_ICONS = {
  [NOTIFICATION_TYPE.VIDEO_COMPLETED]: '🎬',
  [NOTIFICATION_TYPE.VIDEO_FAILED]: '⚠️',
  [NOTIFICATION_TYPE.SCRIPT_COMPLETED]: '📝',
  [NOTIFICATION_TYPE.EXPORT_COMPLETED]: '📤',
  [NOTIFICATION_TYPE.EXPORT_FAILED]: '❌',
  [NOTIFICATION_TYPE.ANALYSIS_COMPLETED]: '🔍',
  [NOTIFICATION_TYPE.COLLABORATION]: '👥',
  [NOTIFICATION_TYPE.SYSTEM]: '🔔',
  [NOTIFICATION_TYPE.MENTION]: '@',
  [NOTIFICATION_TYPE.COMMENT_REPLY]: '💬',
}

const TYPE_LABELS = {
  [NOTIFICATION_TYPE.VIDEO_COMPLETED]: '视频生成完成',
  [NOTIFICATION_TYPE.VIDEO_FAILED]: '视频生成失败',
  [NOTIFICATION_TYPE.SCRIPT_COMPLETED]: '剧本生成完成',
  [NOTIFICATION_TYPE.EXPORT_COMPLETED]: '导出完成',
  [NOTIFICATION_TYPE.EXPORT_FAILED]: '导出失败',
  [NOTIFICATION_TYPE.ANALYSIS_COMPLETED]: 'AI 影评完成',
  [NOTIFICATION_TYPE.COLLABORATION]: '协作消息',
  [NOTIFICATION_TYPE.SYSTEM]: '系统通知',
  [NOTIFICATION_TYPE.MENTION]: '提到了你',
  [NOTIFICATION_TYPE.COMMENT_REPLY]: '评论回复',
}

export class NotificationService {
  constructor() {
    this.notifications = new Map() // id -> notification
    this.preferences = new Map() // userId -> { type: boolean }
    this.maxPerUser = 100
  }

  /**
   * 获取默认通知偏好（所有类型启用）
   */
  getDefaultPreferences() {
    return {
      [NOTIFICATION_TYPE.VIDEO_COMPLETED]: true,
      [NOTIFICATION_TYPE.VIDEO_FAILED]: true,
      [NOTIFICATION_TYPE.SCRIPT_COMPLETED]: true,
      [NOTIFICATION_TYPE.EXPORT_COMPLETED]: true,
      [NOTIFICATION_TYPE.EXPORT_FAILED]: true,
      [NOTIFICATION_TYPE.ANALYSIS_COMPLETED]: true,
      [NOTIFICATION_TYPE.COLLABORATION]: true,
      [NOTIFICATION_TYPE.SYSTEM]: true,
      [NOTIFICATION_TYPE.MENTION]: true,
      [NOTIFICATION_TYPE.COMMENT_REPLY]: true,
    }
  }

  /**
   * 获取用户通知偏好
   */
  getPreferences(userId) {
    const uid = userId || 'default'
    if (!this.preferences.has(uid)) {
      this.preferences.set(uid, { ...this.getDefaultPreferences() })
    }
    return { ...this.preferences.get(uid) }
  }

  /**
   * 更新用户通知偏好
   */
  updatePreferences(userId, updates) {
    const uid = userId || 'default'
    const current = this.getPreferences(uid)
    const updated = { ...current, ...updates }
    this.preferences.set(uid, updated)
    logger.info(`Notification preferences updated for user ${uid}`)
    return updated
  }

  /**
   * 检查用户是否启用了某类型通知
   */
  isTypeEnabled(userId, type) {
    const prefs = this.getPreferences(userId)
    return prefs[type] !== false // 默认启用
  }

  /**
   * 创建通知
   */
  create({ userId, type, title, message, projectId, data = {} }) {
    try {
      const uid = userId || 'default'

      // 检查用户偏好
      if (!this.isTypeEnabled(uid, type)) {
        logger.info(`Notification skipped [${type}] for user ${uid} (disabled in preferences)`)
        return null
      }

      const notification = {
        id: uuidv4(),
        userId: uid,
        type,
        title,
        message,
        projectId: projectId || null,
        data,
        read: false,
        createdAt: new Date().toISOString(),
        icon: TYPE_ICONS[type] || '🔔',
        typeLabel: TYPE_LABELS[type] || '通知',
      }

      this.notifications.set(notification.id, notification)
      this._cleanupOldNotifications(uid)

      logger.info(`Notification created [${type}]: ${title}`)
      return notification
    } catch (error) {
      logger.error('Failed to create notification:', error.message)
      return null
    }
  }

  /**
   * 获取用户通知列表
   */
  getByUser(userId, { unreadOnly = false, limit = 50 } = {}) {
    let list = Array.from(this.notifications.values())
      .filter((n) => n.userId === userId)

    if (unreadOnly) {
      list = list.filter((n) => !n.read)
    }

    list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return list.slice(0, limit)
  }

  /**
   * 获取未读数量
   */
  getUnreadCount(userId) {
    return Array.from(this.notifications.values())
      .filter((n) => n.userId === userId && !n.read)
      .length
  }

  /**
   * 标记为已读
   */
  markAsRead(notificationId) {
    const notification = this.notifications.get(notificationId)
    if (notification) {
      notification.read = true
      notification.readAt = new Date().toISOString()
      return notification
    }
    return null
  }

  /**
   * 标记所有为已读
   */
  markAllAsRead(userId) {
    let count = 0
    for (const notification of this.notifications.values()) {
      if (notification.userId === userId && !notification.read) {
        notification.read = true
        notification.readAt = new Date().toISOString()
        count++
      }
    }
    return { marked: count }
  }

  /**
   * 删除通知
   */
  remove(notificationId) {
    return this.notifications.delete(notificationId)
  }

  /**
   * 清除所有通知
   */
  clearAll(userId) {
    let count = 0
    for (const [id, notification] of this.notifications.entries()) {
      if (notification.userId === userId) {
        this.notifications.delete(id)
        count++
      }
    }
    return { cleared: count }
  }

  /**
   * 清理旧通知（保留最近 maxPerUser 条）
   */
  _cleanupOldNotifications(userId) {
    const userNotifications = Array.from(this.notifications.values())
      .filter((n) => n.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    if (userNotifications.length > this.maxPerUser) {
      const toRemove = userNotifications.slice(this.maxPerUser)
      for (const n of toRemove) {
        this.notifications.delete(n.id)
      }
    }
  }
}

export const notificationService = new NotificationService()
export default notificationService
