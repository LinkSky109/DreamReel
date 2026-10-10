import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  notificationService,
  NOTIFICATION_TYPE,
} from '../src/services/notificationService.js'

test('通知服务 - 创建通知', () => {
  const notification = notificationService.create({
    userId: 'test-user',
    type: NOTIFICATION_TYPE.VIDEO_COMPLETED,
    title: '视频生成完成',
    message: '3个镜头已生成',
    projectId: 'proj-123',
  })
  assert.ok(notification.id)
  assert.equal(notification.userId, 'test-user')
  assert.equal(notification.type, NOTIFICATION_TYPE.VIDEO_COMPLETED)
  assert.equal(notification.title, '视频生成完成')
  assert.equal(notification.read, false)
  assert.ok(notification.createdAt)
  assert.equal(notification.icon, '🎬')
})

test('通知服务 - 获取用户通知', () => {
  const userId = 'test-user-list'
  notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: '通知1', message: '消息1' })
  notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: '通知2', message: '消息2' })

  const list = notificationService.getByUser(userId)
  assert.ok(list.length >= 2)
  // 按时间倒序
  assert.ok(new Date(list[0].createdAt) >= new Date(list[1].createdAt))
})

test('通知服务 - 未读数量', () => {
  const userId = 'test-user-unread'
  const n1 = notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: '未读1', message: '消息' })
  notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: '未读2', message: '消息' })

  const countBefore = notificationService.getUnreadCount(userId)
  assert.ok(countBefore >= 2)

  notificationService.markAsRead(n1.id)
  const countAfter = notificationService.getUnreadCount(userId)
  assert.equal(countAfter, countBefore - 1)
})

test('通知服务 - 标记为已读', () => {
  const notification = notificationService.create({
    userId: 'test-user-read',
    type: NOTIFICATION_TYPE.SYSTEM,
    title: '测试',
    message: '测试',
  })
  assert.equal(notification.read, false)

  const updated = notificationService.markAsRead(notification.id)
  assert.equal(updated.read, true)
  assert.ok(updated.readAt)
})

test('通知服务 - 标记全部已读', () => {
  const userId = 'test-user-readall'
  notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: 'A', message: 'A' })
  notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: 'B', message: 'B' })

  const result = notificationService.markAllAsRead(userId)
  assert.ok(result.marked >= 2)
  assert.equal(notificationService.getUnreadCount(userId), 0)
})

test('通知服务 - 删除通知', () => {
  const notification = notificationService.create({
    userId: 'test-user-delete',
    type: NOTIFICATION_TYPE.SYSTEM,
    title: '待删除',
    message: '删除测试',
  })
  const deleted = notificationService.remove(notification.id)
  assert.equal(deleted, true)

  // 再次删除应返回 false
  const deletedAgain = notificationService.remove(notification.id)
  assert.equal(deletedAgain, false)
})

test('通知服务 - 清除所有通知', () => {
  const userId = 'test-user-clear'
  notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: 'X', message: 'X' })
  notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: 'Y', message: 'Y' })

  const result = notificationService.clearAll(userId)
  assert.ok(result.cleared >= 2)
  const list = notificationService.getByUser(userId)
  assert.equal(list.length, 0)
})

test('通知服务 - 仅未读筛选', () => {
  const userId = 'test-user-filter'
  const n1 = notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: '未读', message: '未读' })
  const n2 = notificationService.create({ userId, type: NOTIFICATION_TYPE.SYSTEM, title: '已读', message: '已读' })
  notificationService.markAsRead(n2.id)

  const unreadList = notificationService.getByUser(userId, { unreadOnly: true })
  assert.ok(unreadList.every((n) => !n.read))
  assert.ok(unreadList.some((n) => n.id === n1.id))
  assert.ok(!unreadList.some((n) => n.id === n2.id))
})

test('通知服务 - 通知类型图标和标签', () => {
  const n = notificationService.create({
    userId: 'test-user-type',
    type: NOTIFICATION_TYPE.EXPORT_COMPLETED,
    title: '导出完成',
    message: '导出成功',
  })
  assert.equal(n.icon, '📤')
  assert.equal(n.typeLabel, '导出完成')
})

test('通知服务 - 空用户ID默认 default', () => {
  const notification = notificationService.create({
    type: NOTIFICATION_TYPE.SYSTEM,
    title: '默认用户',
    message: '测试默认用户',
  })
  assert.equal(notification.userId, 'default')
})
