import { Router } from 'express'
import { galleryService } from '../services/galleryService.js'

const router = Router()

// 分类
router.get('/categories', (_req, res) => {
  res.json({ categories: galleryService.getCategories() })
})

// 广场流
router.get('/', async (req, res) => {
  try {
    const result = await galleryService.listGallery({
      category: req.query.category,
      sort: req.query.sort,
    })
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 发布
router.post('/:projectId/publish', async (req, res) => {
  try {
    const project = await galleryService.publish(req.params.projectId, {
      category: req.body.category,
    })
    res.json({ success: true, project })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 下架
router.post('/:projectId/unpublish', async (req, res) => {
  try {
    const r = await galleryService.unpublish(req.params.projectId)
    res.json(r)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 播放
router.post('/:projectId/view', async (req, res) => {
  try {
    const r = await galleryService.recordView(req.params.projectId)
    res.json(r)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 点赞
router.post('/:projectId/like', async (req, res) => {
  try {
    const r = await galleryService.toggleLike(req.params.projectId, req.body.userId || req.user?.id)
    res.json(r)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// R25: 一键复刻广场作品
router.post('/:projectId/remix', async (req, res) => {
  try {
    const result = await galleryService.remix(req.params.projectId, {
      userId: req.body.userId || req.user?.id || 'default',
      newName: req.body.newName,
    })
    res.json({ success: true, ...result })
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

export default router
