import { Router } from 'express'
import { collaborationService } from '../services/collaborationService.js'
import { projectService } from '../services/projectService.js'

const router = Router()

// ============ Comments ============

// 获取项目评论
router.get('/:projectId/comments', (req, res) => {
  try {
    const { shotId } = req.query
    const comments = collaborationService.getComments(req.params.projectId, { shotId })
    res.json({ total: comments.length, items: comments })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 添加评论
router.post('/:projectId/comments', async (req, res) => {
  try {
    const { userId, userName, content, shotId, parentId } = req.body
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '评论内容不能为空' })
    }
    // 验证项目存在
    await projectService.getProject(req.params.projectId)
    const comment = collaborationService.addComment(req.params.projectId, {
      userId,
      userName,
      content: content.trim(),
      shotId,
      parentId,
    })
    res.status(201).json(comment)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 标记评论已解决
router.patch('/:projectId/comments/:commentId/resolve', (req, res) => {
  try {
    const { resolved } = req.body
    const comment = collaborationService.resolveComment(
      req.params.projectId,
      req.params.commentId,
      resolved !== false
    )
    res.json(comment)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 删除评论
router.delete('/:projectId/comments/:commentId', (req, res) => {
  try {
    collaborationService.deleteComment(req.params.projectId, req.params.commentId)
    res.json({ success: true })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 点赞评论
router.post('/:projectId/comments/:commentId/like', (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId 不能为空' })
    }
    const result = collaborationService.likeComment(req.params.projectId, req.params.commentId, userId)
    res.json(result)
  } catch (error) {
    if (error.message === 'Already liked') {
      return res.status(409).json({ error: error.message })
    }
    res.status(400).json({ error: error.message })
  }
})

// 取消点赞
router.delete('/:projectId/comments/:commentId/like', (req, res) => {
  try {
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId 不能为空' })
    }
    const result = collaborationService.unlikeComment(req.params.projectId, req.params.commentId, userId)
    res.json(result)
  } catch (error) {
    if (error.message === 'Not liked') {
      return res.status(404).json({ error: error.message })
    }
    res.status(400).json({ error: error.message })
  }
})

// 获取评论回复
router.get('/:projectId/comments/:commentId/replies', (req, res) => {
  try {
    const replies = collaborationService.getCommentReplies(req.params.projectId, req.params.commentId)
    res.json({ total: replies.length, items: replies })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 获取评论统计
router.get('/:projectId/comments/stats', (req, res) => {
  try {
    const stats = collaborationService.getCommentStats(req.params.projectId)
    res.json(stats)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// ============ Activities ============

// 获取项目活动记录
router.get('/:projectId/activities', (req, res) => {
  try {
    const { limit, offset } = req.query
    const result = collaborationService.getActivities(req.params.projectId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// ============ Sharing ============

// 获取分享设置
router.get('/:projectId/share', (req, res) => {
  try {
    const share = collaborationService.getShareSettings(req.params.projectId)
    res.json(share)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 更新分享设置
router.put('/:projectId/share', async (req, res) => {
  try {
    await projectService.getProject(req.params.projectId)
    const { isPublic, allowComments, password } = req.body
    const share = collaborationService.setShareSettings(req.params.projectId, {
      isPublic,
      allowComments,
      password,
    })
    res.json(share)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 通过分享 token 访问项目（公开访问）
router.get('/shared/:token', (req, res) => {
  try {
    const result = collaborationService.getProjectByShareToken(req.params.token)
    if (!result) {
      return res.status(404).json({ error: '分享链接无效或项目未公开' })
    }
    res.json({ projectId: result.projectId, share: result.share })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
