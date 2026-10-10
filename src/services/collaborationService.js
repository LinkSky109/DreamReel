import { storageService } from './storageService.js'
import logger from '../utils/logger.js'
import crypto from 'crypto'
import { notificationService, NOTIFICATION_TYPE } from './notificationService.js'
import { generateId } from '../utils/idGenerator.js'

/**
 * 协作服务
 * 评论、活动记录、项目分享
 */
export class CollaborationService {
  constructor() {
    this._ensureCollections()
  }

  _ensureCollections() {
    if (!storageService.data.comments) storageService.data.comments = {}
    if (!storageService.data.activities) storageService.data.activities = {}
    if (!storageService.data.shares) storageService.data.shares = {}
  }

  // ============ Comments ============

  /**
   * 获取项目的所有评论
   */
  getComments(projectId, { shotId } = {}) {
    const projectComments = storageService.data.comments[projectId] || []
    if (shotId) {
      return projectComments.filter((c) => c.shotId === shotId)
    }
    return projectComments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  }

  /**
   * 添加评论
   */
  addComment(projectId, { userId, userName, content, shotId, parentId }) {
    if (!storageService.data.comments[projectId]) {
      storageService.data.comments[projectId] = []
    }

    // 提取 @提及
    const mentions = this._extractMentions(content)

    const comment = {
      id: generateId(),
      projectId,
      shotId: shotId || null,
      parentId: parentId || null,
      userId: userId || 'anonymous',
      userName: userName || '匿名用户',
      content,
      mentions,
      likes: [],
      likeCount: 0,
      createdAt: new Date().toISOString(),
      resolved: false,
    }

    storageService.data.comments[projectId].push(comment)
    storageService.save()

    // 记录活动
    this.addActivity(projectId, {
      userId,
      userName,
      type: 'comment',
      message: `${userName || '匿名用户'} 发表了评论`,
      shotId,
    })

    // @提及通知
    if (mentions.length > 0) {
      this._notifyMentions(projectId, comment, mentions)
    }

    // 回复通知
    if (parentId) {
      const parentComment = this._findComment(projectId, parentId)
      if (parentComment) {
        this._notifyReply(projectId, comment, parentComment)
      }
    }

    logger.info(`Comment added to project ${projectId} by ${userName}`)
    return comment
  }

  /**
   * 查找评论
   */
  _findComment(projectId, commentId) {
    const comments = storageService.data.comments[projectId] || []
    return comments.find((c) => c.id === commentId)
  }

  /**
   * 提取 @提及
   */
  _extractMentions(content) {
    if (!content) return []
    const mentionRegex = /@(\w+)/g
    const matches = content.match(mentionRegex)
    if (!matches) return []
    return [...new Set(matches.map((m) => m.slice(1)))]
  }

  /**
   * @提及通知
   */
  _notifyMentions(projectId, comment, mentions) {
    try {
      // 记录活动
      this.addActivity(projectId, {
        userId: comment.userId,
        userName: comment.userName,
        type: 'mention',
        message: `${comment.userName} 在评论中 @了 ${mentions.join(', ')}`,
        shotId: comment.shotId,
      })

      // 发送通知给每个被提及的用户
      for (const mentionedUser of mentions) {
        notificationService.create({
          userId: mentionedUser,
          type: NOTIFICATION_TYPE.MENTION,
          title: `${comment.userName} 提到了你`,
          message: comment.content,
          projectId,
          data: {
            commentId: comment.id,
            mentionedBy: comment.userId,
            mentionedByName: comment.userName,
          },
        })
      }

      logger.info(`Mentions notified: ${mentions.join(', ')} in project ${projectId}`)
    } catch (e) {
      logger.warn(`Failed to notify mentions: ${e.message}`)
    }
  }

  /**
   * 回复通知
   */
  _notifyReply(projectId, comment, parentComment) {
    try {
      if (!parentComment) return

      // 不要给自己发通知
      if (parentComment.userId === comment.userId) return

      notificationService.create({
        userId: parentComment.userId,
        type: NOTIFICATION_TYPE.COMMENT_REPLY,
        title: `${comment.userName} 回复了你的评论`,
        message: comment.content,
        projectId,
        data: {
          commentId: comment.id,
          parentCommentId: parentComment.id,
          repliedBy: comment.userId,
          repliedByName: comment.userName,
        },
      })

      logger.info(`Reply notification sent to ${parentComment.userId} in project ${projectId}`)
    } catch (e) {
      logger.warn(`Failed to notify reply: ${e.message}`)
    }
  }

  /**
   * 点赞评论
   */
  likeComment(projectId, commentId, userId) {
    const comments = storageService.data.comments[projectId] || []
    const comment = comments.find((c) => c.id === commentId)
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`)
    }

    if (!comment.likes) comment.likes = []
    if (!comment.likeCount) comment.likeCount = 0

    // 检查是否已点赞
    if (comment.likes.includes(userId)) {
      throw new Error('Already liked')
    }

    comment.likes.push(userId)
    comment.likeCount = comment.likes.length
    storageService.save()

    logger.info(`Comment ${commentId} liked by ${userId}`)
    return { success: true, likeCount: comment.likeCount }
  }

  /**
   * 取消点赞
   */
  unlikeComment(projectId, commentId, userId) {
    const comments = storageService.data.comments[projectId] || []
    const comment = comments.find((c) => c.id === commentId)
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`)
    }

    if (!comment.likes) comment.likes = []

    const index = comment.likes.indexOf(userId)
    if (index === -1) {
      throw new Error('Not liked')
    }

    comment.likes.splice(index, 1)
    comment.likeCount = comment.likes.length
    storageService.save()

    logger.info(`Comment ${commentId} unliked by ${userId}`)
    return { success: true, likeCount: comment.likeCount }
  }

  /**
   * 获取评论的回复
   */
  getCommentReplies(projectId, commentId) {
    const comments = storageService.data.comments[projectId] || []
    return comments
      .filter((c) => c.parentId === commentId)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  }

  /**
   * 获取评论统计
   */
  getCommentStats(projectId) {
    const comments = storageService.data.comments[projectId] || []
    const total = comments.length
    const resolved = comments.filter((c) => c.resolved).length
    const unresolved = total - resolved
    const totalLikes = comments.reduce((sum, c) => sum + (c.likeCount || 0), 0)
    const withMentions = comments.filter((c) => c.mentions && c.mentions.length > 0).length
    const replies = comments.filter((c) => c.parentId).length

    return {
      total,
      resolved,
      unresolved,
      totalLikes,
      withMentions,
      replies,
      resolutionRate: total > 0 ? Math.round((resolved / total) * 100) : 0,
    }
  }

  /**
   * 标记评论已解决
   */
  resolveComment(projectId, commentId, resolved = true) {
    const comments = storageService.data.comments[projectId] || []
    const comment = comments.find((c) => c.id === commentId)
    if (!comment) {
      throw new Error(`Comment not found: ${commentId}`)
    }
    comment.resolved = resolved
    comment.resolvedAt = resolved ? new Date().toISOString() : null
    storageService.save()
    return comment
  }

  /**
   * 删除评论
   */
  deleteComment(projectId, commentId) {
    const comments = storageService.data.comments[projectId] || []
    const index = comments.findIndex((c) => c.id === commentId)
    if (index === -1) {
      throw new Error(`Comment not found: ${commentId}`)
    }
    comments.splice(index, 1)
    storageService.save()
    return { success: true }
  }

  // ============ Activity Log ============

  /**
   * 获取项目活动记录
   */
  getActivities(projectId, { limit = 50, offset = 0 } = {}) {
    const activities = storageService.data.activities[projectId] || []
    const sorted = activities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return {
      total: sorted.length,
      items: sorted.slice(offset, offset + limit),
    }
  }

  /**
   * 添加活动记录
   */
  addActivity(projectId, { userId, userName, type, message, shotId, metadata }) {
    if (!storageService.data.activities[projectId]) {
      storageService.data.activities[projectId] = []
    }

    const activity = {
      id: generateId(),
      projectId,
      userId: userId || 'system',
      userName: userName || '系统',
      type, // comment, script_generated, video_generated, dubbing, export, share, edit
      message,
      shotId: shotId || null,
      metadata: metadata || {},
      createdAt: new Date().toISOString(),
    }

    storageService.data.activities[projectId].push(activity)
    // 只保留最近 200 条
    if (storageService.data.activities[projectId].length > 200) {
      storageService.data.activities[projectId] = storageService.data.activities[projectId].slice(-200)
    }
    storageService.save()
    return activity
  }

  // ============ Project Sharing ============

  /**
   * 创建/更新项目分享设置
   */
  setShareSettings(projectId, { isPublic, allowComments, password }) {
    const share = {
      projectId,
      isPublic: isPublic !== undefined ? isPublic : false,
      allowComments: allowComments !== undefined ? allowComments : true,
      password: password || null,
      shareToken: this._generateShareToken(projectId),
      updatedAt: new Date().toISOString(),
    }

    storageService.data.shares[projectId] = share
    storageService.save()

    this.addActivity(projectId, {
      type: 'share',
      message: share.isPublic ? '项目已设为公开可访问' : '项目已设为私有',
    })

    return share
  }

  /**
   * 获取项目分享设置
   */
  getShareSettings(projectId) {
    return (
      storageService.data.shares[projectId] || {
        projectId,
        isPublic: false,
        allowComments: true,
        password: null,
        shareToken: null,
        updatedAt: null,
      }
    )
  }

  /**
   * 通过分享 token 访问项目
   */
  getProjectByShareToken(token) {
    for (const [projectId, share] of Object.entries(storageService.data.shares)) {
      if (share.shareToken === token && share.isPublic) {
        return { projectId, share }
      }
    }
    return null
  }

  /**
   * 生成分享链接 token
   */
  _generateShareToken(projectId) {
    return crypto.createHash('md5').update(`${projectId}-${Date.now()}-${Math.random()}`).digest('hex').slice(0, 12)
  }

  /**
   * 删除项目的所有协作数据
   */
  cleanupProject(projectId) {
    delete storageService.data.comments[projectId]
    delete storageService.data.activities[projectId]
    delete storageService.data.shares[projectId]
    storageService.save()
  }
}

export const collaborationService = new CollaborationService()
export default collaborationService
