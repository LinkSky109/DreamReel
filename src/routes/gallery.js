import { Router } from 'express'
import { AppError } from '../utils/appError.js'
import { galleryService } from '../services/galleryService.js'
import { validateBody } from '../middleware/validate.js'
import { requireProjectOwnership } from '../middleware/projectAccess.js'
import { galleryPublishSchema, galleryRemixSchema, galleryLikeSchema } from '../contracts/gallery.js'

const router = Router()

// 分类
router.get('/categories', (_req, res) => {
  res.json({ categories: galleryService.getCategories() })
})

// 广场流
router.get('/', async (req, res, next) => {
  try {
    const result = await galleryService.listGallery({
      category: req.query.category,
      sort: req.query.sort,
    })
    res.json(result)
  } catch (e) {
    next(AppError.badRequest(e.message, { cause: e }))
  }
})

// 发布
router.post('/:projectId/publish', validateBody(galleryPublishSchema), async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const project = await galleryService.publish(req.params.projectId, {
      category: req.validated.body.category,
    })
    res.json({ success: true, project })
  } catch (e) {
    next(AppError.badRequest(e.message, { cause: e }))
  }
})

// 下架
router.post('/:projectId/unpublish', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const r = await galleryService.unpublish(req.params.projectId)
    res.json(r)
  } catch (e) {
    next(AppError.badRequest(e.message, { cause: e }))
  }
})

// 播放
router.post('/:projectId/view', async (req, res, next) => {
  try {
    const r = await galleryService.recordView(req.params.projectId)
    res.json(r)
  } catch (e) {
    next(AppError.badRequest(e.message, { cause: e }))
  }
})

// 点赞
router.post('/:projectId/like', validateBody(galleryLikeSchema), async (req, res, next) => {
  try {
    const r = await galleryService.toggleLike(req.params.projectId, req.userId)
    res.json(r)
  } catch (e) {
    next(AppError.badRequest(e.message, { cause: e }))
  }
})

// R25: 一键复刻广场作品
router.post('/:projectId/remix', validateBody(galleryRemixSchema), async (req, res, next) => {
  try {
    const result = await galleryService.remix(req.params.projectId, {
      userId: req.userId,
      newName: req.validated.body.newName,
    })
    res.json({ success: true, ...result })
  } catch (e) {
    next(AppError.badRequest(e.message, { cause: e }))
  }
})

export default router
