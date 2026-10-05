import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { collaborationService } from '../src/services/collaborationService.js'
import { notificationService } from '../src/services/notificationService.js'
import { storageService } from '../src/services/storageService.js'

const TEST_PROJECT = 'test-notif-project'

describe('CommentNotification', () => {
  beforeEach(() => {
    // 清理测试数据
    if (storageService.data.comments) {
      delete storageService.data.comments[TEST_PROJECT]
    }
    if (storageService.data.activities) {
      delete storageService.data.activities[TEST_PROJECT]
    }
    // 清理通知
    notificationService.notifications.clear()
  })

  after(() => {
    // 清理测试数据
    if (storageService.data.comments) {
      delete storageService.data.comments[TEST_PROJECT]
    }
    if (storageService.data.activities) {
      delete storageService.data.activities[TEST_PROJECT]
    }
    notificationService.notifications.clear()
  })

  it('should send mention notification when comment contains @username', () => {
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Hey @bob please review this',
    })

    const notifications = notificationService.getByUser('bob')
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].type, 'mention')
    assert.equal(notifications[0].title, 'Alice 提到了你')
    assert.equal(notifications[0].message, 'Hey @bob please review this')
    assert.equal(notifications[0].projectId, TEST_PROJECT)
  })

  it('should send multiple mention notifications', () => {
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: '@bob @charlie please review',
    })

    const bobNotifs = notificationService.getByUser('bob')
    const charlieNotifs = notificationService.getByUser('charlie')
    assert.equal(bobNotifs.length, 1)
    assert.equal(charlieNotifs.length, 1)
  })

  it('should not send mention notification when no @username', () => {
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'This is a normal comment',
    })

    const notifications = notificationService.getByUser('default')
    // 应该没有 mention 类型的通知
    const mentionNotifs = notifications.filter((n) => n.type === 'mention')
    assert.equal(mentionNotifs.length, 0)
  })

  it('should send reply notification when commenting on a comment', () => {
    // 先添加父评论
    const parent = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Original comment',
    })

    // 清理之前的通知
    notificationService.notifications.clear()

    // 添加回复
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user2',
      userName: 'Bob',
      content: 'I agree with this',
      parentId: parent.id,
    })

    const notifications = notificationService.getByUser('user1')
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].type, 'comment_reply')
    assert.equal(notifications[0].title, 'Bob 回复了你的评论')
    assert.equal(notifications[0].message, 'I agree with this')
  })

  it('should not send reply notification to self', () => {
    // 先添加父评论
    const parent = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Original comment',
    })

    // 清理之前的通知
    notificationService.notifications.clear()

    // 自己回复自己
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Self reply',
      parentId: parent.id,
    })

    const notifications = notificationService.getByUser('user1')
    const replyNotifs = notifications.filter((n) => n.type === 'comment_reply')
    assert.equal(replyNotifs.length, 0)
  })

  it('should send both mention and reply notifications', () => {
    // 先添加父评论
    const parent = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Original comment',
    })

    // 清理之前的通知
    notificationService.notifications.clear()

    // 添加带 @提及的回复
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user2',
      userName: 'Bob',
      content: '@charlie what do you think?',
      parentId: parent.id,
    })

    // user1 应该收到回复通知
    const user1Notifs = notificationService.getByUser('user1')
    assert.equal(user1Notifs.length, 1)
    assert.equal(user1Notifs[0].type, 'comment_reply')

    // charlie 应该收到提及通知
    const charlieNotifs = notificationService.getByUser('charlie')
    assert.equal(charlieNotifs.length, 1)
    assert.equal(charlieNotifs[0].type, 'mention')
  })

  it('should include comment data in notification', () => {
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Hey @bob please review',
    })

    const notifications = notificationService.getByUser('bob')
    assert.equal(notifications.length, 1)
    assert.ok(notifications[0].data.commentId)
    assert.equal(notifications[0].data.mentionedBy, 'user1')
    assert.equal(notifications[0].data.mentionedByName, 'Alice')
  })

  it('should have correct icon and label for mention type', () => {
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Hey @bob',
    })

    const notifications = notificationService.getByUser('bob')
    assert.equal(notifications[0].icon, '@')
    assert.equal(notifications[0].typeLabel, '提到了你')
  })

  it('should have correct icon and label for reply type', () => {
    const parent = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Original',
    })
    notificationService.notifications.clear()

    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user2',
      userName: 'Bob',
      content: 'Reply',
      parentId: parent.id,
    })

    const notifications = notificationService.getByUser('user1')
    assert.equal(notifications[0].icon, '💬')
    assert.equal(notifications[0].typeLabel, '评论回复')
  })
})
