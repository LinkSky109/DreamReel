import { Router } from 'express'
import { sceneService } from '../services/sceneService.js'
import { authRequired } from '../middleware/auth.js'

const router = Router()

/**
 * 获取场景列表
 */
router.get('/', (req, res) => {
  try {
    const { category, search } = req.query
    const result = sceneService.listScenes({ category, search })
    res.json(result)
  } catch (error) {
    const status = error.message === '无权操作该场景' ? 403 : 400
    res.status(status).json({ error: error.message })
  }
})

/**
 * 获取单个场景
 */
router.get('/:id', (req, res) => {
  try {
    const scene = sceneService.getScene(req.params.id)
    if (!scene) {
      return res.status(404).json({ error: 'Scene not found' })
    }
    res.json(scene)
  } catch (error) {
    const status = error.message === '无权操作该场景' ? 403 : 400
    res.status(status).json({ error: error.message })
  }
})

/**
 * 创建自定义场景
 */
router.post('/', authRequired, (req, res) => {
  try {
    const scene = sceneService.createCustomScene({ ...req.body, userId: req.user.id })
    res.status(201).json(scene)
  } catch (error) {
    const status = error.message === '无权操作该场景' ? 403 : 400
    res.status(status).json({ error: error.message })
  }
})

/**
 * 更新自定义场景
 */
router.put('/:id', authRequired, (req, res) => {
  try {
    const scene = sceneService.updateCustomScene(req.params.id, req.body, req.user.id)
    res.json(scene)
  } catch (error) {
    const status = error.message === '无权操作该场景' ? 403 : 400
    res.status(status).json({ error: error.message })
  }
})

/**
 * 删除自定义场景
 */
router.delete('/:id', authRequired, (req, res) => {
  try {
    sceneService.deleteCustomScene(req.params.id, req.user.id)
    res.json({ success: true })
  } catch (error) {
    const status = error.message === '无权操作该场景' ? 403 : 400
    res.status(status).json({ error: error.message })
  }
})

/**
 * 获取场景统计
 */
router.get('/stats/info', (req, res) => {
  try {
    res.json(sceneService.getStats())
  } catch (error) {
    const status = error.message === '无权操作该场景' ? 403 : 400
    res.status(status).json({ error: error.message })
  }
})

export default router
