import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collaborationService } from '../src/services/collaborationService.js'

const TEST_PROJECT = 'collab_test_project'

test('collaborationService: addComment should create a comment', () => {
  const comment = collaborationService.addComment(TEST_PROJECT, {
    userName: '测试用户',
    content: '这个镜头很棒',
  })
  assert.ok(comment.id)
  assert.equal(comment.userName, '测试用户')
  assert.equal(comment.content, '这个镜头很棒')
  assert.equal(comment.resolved, false)
})

test('collaborationService: getComments should return project comments', () => {
  collaborationService.addComment(TEST_PROJECT, { userName: '用户B', content: '第二条评论' })
  const comments = collaborationService.getComments(TEST_PROJECT)
  assert.ok(comments.length >= 2)
})

test('collaborationService: getComments should filter by shotId', () => {
  collaborationService.addComment(TEST_PROJECT, {
    userName: '用户C',
    content: '镜头评论',
    shotId: 'shot_123',
  })
  const shotComments = collaborationService.getComments(TEST_PROJECT, { shotId: 'shot_123' })
  assert.equal(shotComments.length, 1)
  assert.equal(shotComments[0].shotId, 'shot_123')
})

test('collaborationService: resolveComment should mark as resolved', () => {
  const comment = collaborationService.addComment(TEST_PROJECT, {
    userName: '用户D',
    content: '待解决的问题',
  })
  const resolved = collaborationService.resolveComment(TEST_PROJECT, comment.id, true)
  assert.equal(resolved.resolved, true)
  assert.ok(resolved.resolvedAt)
})

test('collaborationService: deleteComment should remove comment', () => {
  const comment = collaborationService.addComment(TEST_PROJECT, {
    userName: '用户E',
    content: '要删除的评论',
  })
  collaborationService.deleteComment(TEST_PROJECT, comment.id)
  const comments = collaborationService.getComments(TEST_PROJECT)
  assert.ok(!comments.find((c) => c.id === comment.id))
})

test('collaborationService: addActivity should create activity record', () => {
  const activity = collaborationService.addActivity(TEST_PROJECT, {
    userName: '系统',
    type: 'edit',
    message: '项目已更新',
  })
  assert.ok(activity.id)
  assert.equal(activity.type, 'edit')
  assert.equal(activity.message, '项目已更新')
})

test('collaborationService: getActivities should return sorted activities', () => {
  collaborationService.addActivity(TEST_PROJECT, { type: 'export', message: '导出完成' })
  const result = collaborationService.getActivities(TEST_PROJECT)
  assert.ok(result.total >= 2)
  // 按时间倒序
  assert.ok(new Date(result.items[0].createdAt) >= new Date(result.items[1].createdAt))
})

test('collaborationService: setShareSettings should update sharing', () => {
  const share = collaborationService.setShareSettings(TEST_PROJECT, {
    isPublic: true,
    allowComments: true,
  })
  assert.equal(share.isPublic, true)
  assert.ok(share.shareToken)
  assert.equal(share.shareToken.length, 12)
})

test('collaborationService: getShareSettings should return default for unshared project', () => {
  const share = collaborationService.getShareSettings('nonexistent_project')
  assert.equal(share.isPublic, false)
  assert.equal(share.shareToken, null)
})

test('collaborationService: getProjectByShareToken should find public project', () => {
  const share = collaborationService.setShareSettings(TEST_PROJECT, { isPublic: true })
  const found = collaborationService.getProjectByShareToken(share.shareToken)
  assert.ok(found)
  assert.equal(found.projectId, TEST_PROJECT)
})

test('collaborationService: cleanupProject should remove all collaboration data', () => {
  collaborationService.cleanupProject(TEST_PROJECT)
  const comments = collaborationService.getComments(TEST_PROJECT)
  const activities = collaborationService.getActivities(TEST_PROJECT)
  const share = collaborationService.getShareSettings(TEST_PROJECT)
  assert.equal(comments.length, 0)
  assert.equal(activities.total, 0)
  assert.equal(share.isPublic, false)
})
