import { Router } from 'express'
import { notificationService } from '../services/notificationService.js'

const router = Router()

// 获取通知列表
router.get('/', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const { unread, limit } = req.query
    const notifications = notificationService.getByUser(userId, {
      unreadOnly: unread === 'true',
      limit: limit ? parseInt(limit, 10) : 50,
    })
    const unreadCount = notificationService.getUnreadCount(userId)
    res.json({ items: notifications, unreadCount, total: notifications.length })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取未读数量
router.get('/unread-count', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const count = notificationService.getUnreadCount(userId)
    res.json({ count })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 标记为已读
router.post('/:id/read', (req, res) => {
  try {
    const notification = notificationService.markAsRead(req.params.id)
    if (!notification) {
      return res.status(404).json({ error: '通知不存在' })
    }
    res.json(notification)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 标记全部已读
router.post('/read-all', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const result = notificationService.markAllAsRead(userId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 删除通知
router.delete('/:id', (req, res) => {
  try {
    const deleted = notificationService.remove(req.params.id)
    if (!deleted) {
      return res.status(404).json({ error: '通知不存在' })
    }
    res.json({ success: true })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 清除所有通知
router.delete('/', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const result = notificationService.clearAll(userId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取通知偏好
router.get('/preferences', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const preferences = notificationService.getPreferences(userId)
    res.json({ preferences })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 更新通知偏好
router.patch('/preferences', (req, res) => {
  try {
    const userId = req.user?.id || 'default'
    const updates = req.body || {}
    const preferences = notificationService.updatePreferences(userId, updates)
    res.json({ preferences })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
