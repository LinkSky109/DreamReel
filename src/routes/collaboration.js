import { Router } from 'express'
import { AppError } from '../utils/appError.js'
import { collaborationService } from '../services/collaborationService.js'
import { projectService } from '../services/projectService.js'
import { requireProjectOwnership } from '../middleware/projectAccess.js'

const router = Router()

// ============ Comments ============

// 获取项目评论
router.get('/:projectId/comments', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { shotId } = req.query
    const comments = collaborationService.getComments(req.params.projectId, { shotId })
    res.json({ total: comments.length, items: comments })
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 添加评论
router.post('/:projectId/comments', async (req, res, next) => {
  try {
    const { userId, userName, content, shotId, parentId } = req.body
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '评论内容不能为空' })
    }
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const comment = collaborationService.addComment(req.params.projectId, {
      userId,
      userName,
      content: content.trim(),
      shotId,
      parentId,
    })
    res.status(201).json(comment)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 标记评论已解决
router.patch('/:projectId/comments/:commentId/resolve', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { resolved } = req.body
    const comment = collaborationService.resolveComment(
      req.params.projectId,
      req.params.commentId,
      resolved !== false
    )
    res.json(comment)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 删除评论
router.delete('/:projectId/comments/:commentId', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    collaborationService.deleteComment(req.params.projectId, req.params.commentId)
    res.json({ success: true })
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 点赞评论
router.post('/:projectId/comments/:commentId/like', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
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
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 取消点赞
router.delete('/:projectId/comments/:commentId/like', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { userId } = req.body
    if (!userId) {
      return res.status(400).json({ error: 'userId 不能为空' })
    }
    const result = collaborationService.unlikeComment(req.params.projectId, req.params.commentId, userId)
    res.json(result)
  } catch (error) {
    if (error.message === 'Not liked') {
      return next(AppError.notFound(error.message, { cause: error }))
    }
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 获取评论回复
router.get('/:projectId/comments/:commentId/replies', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const replies = collaborationService.getCommentReplies(req.params.projectId, req.params.commentId)
    res.json({ total: replies.length, items: replies })
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 获取评论统计
router.get('/:projectId/comments/stats', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const stats = collaborationService.getCommentStats(req.params.projectId)
    res.json(stats)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// ============ Activities ============

// 获取项目活动记录
router.get('/:projectId/activities', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { limit, offset } = req.query
    const result = collaborationService.getActivities(req.params.projectId, {
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    })
    res.json(result)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// ============ Sharing ============

// 获取分享设置
router.get('/:projectId/share', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const share = collaborationService.getShareSettings(req.params.projectId)
    res.json(share)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 更新分享设置
router.put('/:projectId/share', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { isPublic, allowComments, password } = req.body
    const share = collaborationService.setShareSettings(req.params.projectId, {
      isPublic,
      allowComments,
      password,
    })
    res.json(share)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 通过分享 token 访问项目（公开访问，只读）
router.get('/shared/:token', (req, res) => {
  try {
    const result = collaborationService.getProjectByShareToken(req.params.token)
    if (!result) {
      return res.status(404).json({ error: '分享链接无效或项目未公开' })
    }
    res.json({ projectId: result.projectId, share: result.share })
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

// 通过分享 token 读取项目详情（公开访问，只读）
router.get('/shared/:token/project', async (req, res, next) => {
  try {
    const result = collaborationService.getProjectByShareToken(req.params.token)
    if (!result) {
      return res.status(404).json({ error: '分享链接无效或项目未公开' })
    }
    const project = await projectService.getProject(result.projectId)
    res.json(project.toJSON())
  } catch (error) {
    next(AppError.notFound(error.message, { cause: error }))
  }
})

export default router
