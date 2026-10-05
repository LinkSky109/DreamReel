import { describe, it, beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { collaborationService } from '../src/services/collaborationService.js'
import { storageService } from '../src/services/storageService.js'

const TEST_PROJECT = 'test-comment-project'

describe('CommentEnhancements', () => {
  beforeEach(() => {
    // 清理测试数据
    if (storageService.data.comments) {
      delete storageService.data.comments[TEST_PROJECT]
    }
    if (storageService.data.activities) {
      delete storageService.data.activities[TEST_PROJECT]
    }
  })

  after(() => {
    // 清理测试数据
    if (storageService.data.comments) {
      delete storageService.data.comments[TEST_PROJECT]
    }
    if (storageService.data.activities) {
      delete storageService.data.activities[TEST_PROJECT]
    }
  })

  it('should extract @mentions from comment', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Hey @bob and @charlie, please review this shot',
    })

    assert.ok(comment.mentions)
    assert.equal(comment.mentions.length, 2)
    assert.ok(comment.mentions.includes('bob'))
    assert.ok(comment.mentions.includes('charlie'))
  })

  it('should handle comment without mentions', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'This is a normal comment',
    })

    assert.ok(comment.mentions)
    assert.equal(comment.mentions.length, 0)
  })

  it('should deduplicate mentions', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: '@bob @bob @charlie @bob',
    })

    assert.equal(comment.mentions.length, 2)
  })

  it('should initialize likes array', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Test comment',
    })

    assert.ok(Array.isArray(comment.likes))
    assert.equal(comment.likes.length, 0)
    assert.equal(comment.likeCount, 0)
  })

  it('should like a comment', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Test comment',
    })

    const result = collaborationService.likeComment(TEST_PROJECT, comment.id, 'user2')
    assert.equal(result.success, true)
    assert.equal(result.likeCount, 1)

    const comments = collaborationService.getComments(TEST_PROJECT)
    const updated = comments.find((c) => c.id === comment.id)
    assert.equal(updated.likeCount, 1)
    assert.ok(updated.likes.includes('user2'))
  })

  it('should not like a comment twice', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Test comment',
    })

    collaborationService.likeComment(TEST_PROJECT, comment.id, 'user2')

    try {
      collaborationService.likeComment(TEST_PROJECT, comment.id, 'user2')
      assert.fail('Should have thrown')
    } catch (error) {
      assert.equal(error.message, 'Already liked')
    }
  })

  it('should unlike a comment', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Test comment',
    })

    collaborationService.likeComment(TEST_PROJECT, comment.id, 'user2')
    const result = collaborationService.unlikeComment(TEST_PROJECT, comment.id, 'user2')
    assert.equal(result.success, true)
    assert.equal(result.likeCount, 0)
  })

  it('should not unlike a comment not liked', () => {
    const comment = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Test comment',
    })

    try {
      collaborationService.unlikeComment(TEST_PROJECT, comment.id, 'user2')
      assert.fail('Should have thrown')
    } catch (error) {
      assert.equal(error.message, 'Not liked')
    }
  })

  it('should get comment replies', () => {
    const parent = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Parent comment',
    })

    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user2',
      userName: 'Bob',
      content: 'Reply 1',
      parentId: parent.id,
    })

    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user3',
      userName: 'Charlie',
      content: 'Reply 2',
      parentId: parent.id,
    })

    const replies = collaborationService.getCommentReplies(TEST_PROJECT, parent.id)
    assert.equal(replies.length, 2)
    assert.equal(replies[0].content, 'Reply 1')
    assert.equal(replies[1].content, 'Reply 2')
  })

  it('should get comment stats', () => {
    const c1 = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user1',
      userName: 'Alice',
      content: 'Comment 1 @bob',
    })
    const c2 = collaborationService.addComment(TEST_PROJECT, {
      userId: 'user2',
      userName: 'Bob',
      content: 'Comment 2',
    })
    collaborationService.addComment(TEST_PROJECT, {
      userId: 'user3',
      userName: 'Charlie',
      content: 'Reply',
      parentId: c1.id,
    })

    collaborationService.likeComment(TEST_PROJECT, c1.id, 'user2')
    collaborationService.likeComment(TEST_PROJECT, c1.id, 'user3')
    collaborationService.resolveComment(TEST_PROJECT, c1.id, true)

    const stats = collaborationService.getCommentStats(TEST_PROJECT)
    assert.equal(stats.total, 3)
    assert.equal(stats.resolved, 1)
    assert.equal(stats.unresolved, 2)
    assert.equal(stats.totalLikes, 2)
    assert.equal(stats.withMentions, 1)
    assert.equal(stats.replies, 1)
    assert.equal(stats.resolutionRate, 33)
  })

  it('should get empty stats for project with no comments', () => {
    const stats = collaborationService.getCommentStats('empty-project')
    assert.equal(stats.total, 0)
    assert.equal(stats.resolved, 0)
    assert.equal(stats.totalLikes, 0)
    assert.equal(stats.resolutionRate, 0)
  })

  it('should throw when liking non-existent comment', () => {
    try {
      collaborationService.likeComment(TEST_PROJECT, 'non-existent', 'user1')
      assert.fail('Should have thrown')
    } catch (error) {
      assert.ok(error.message.includes('Comment not found'))
    }
  })
})
