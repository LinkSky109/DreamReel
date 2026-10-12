import { storageService } from './storageService.js'
import { Notification } from '../models/notification.js'

/**
 * 社区通知服务（Wave 2）。
 *
 * 与平台既有 notificationService（/api/notifications，视频/导出等系统通知）相互独立：
 * 社区通知描述影评/评论互动（reply / like / favorite），落在 storageService.notifications。
 *
 * 注意：storageService 重启后从 JSON 载入的是普通对象，故这里只做字段读写。
 */

/**
 * 创建社区通知
 * @param {object} data { userId(收件人), type, sourceId?, sourceType?, message? }
 * @returns {Notification}
 */
export function createNotification(data = {}) {
  if (!data.userId) throw new Error('userId is required')
  const notification = new Notification(data)
  return storageService.createNotification(notification)
}

/**
 * 列出某用户的通知
 * @param {string} userId
 * @param {object} opts { unreadOnly?, limit? }
 * @returns {Array}
 */
export function listNotifications(userId, { unreadOnly = false, limit = 50 } = {}) {
  if (!userId) throw new Error('userId is required')
  let items = storageService.getNotificationsByUser(userId)
  if (unreadOnly) items = items.filter((n) => !n.isRead)
  items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  return items.slice(0, Math.max(0, limit))
}

/**
 * 未读数量
 * @param {string} userId
 * @returns {number}
 */
export function getUnreadCount(userId) {
  if (!userId) throw new Error('userId is required')
  return storageService.getNotificationsByUser(userId).filter((n) => !n.isRead).length
}

/**
 * 标记单条已读
 * @param {string} id
 * @returns {object|null}
 */
export function markAsRead(id) {
  const notification = storageService.getNotificationById(id)
  if (!notification) return null
  notification.isRead = true
  notification.readAt = new Date().toISOString()
  return storageService.updateNotification(notification)
}

/**
 * 全部标记已读
 * @param {string} userId
 * @returns {{markedCount:number}}
 */
export function markAllAsRead(userId) {
  if (!userId) throw new Error('userId is required')
  const unread = storageService.getNotificationsByUser(userId).filter((n) => !n.isRead)
  for (const notification of unread) {
    notification.isRead = true
    notification.readAt = new Date().toISOString()
    storageService.updateNotification(notification)
  }
  return { markedCount: unread.length }
}
