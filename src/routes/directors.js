import { Router } from 'express'
import { directorService } from '../services/directorService.js'
import logger from '../utils/logger.js'

const router = Router()

// R29：导演档案广场
// 注意：静态路径 /disable 必须在 /:id 之前注册
router.get('/', (_req, res) => {
  try {
    const result = directorService.listDirectors()
    res.json(result)
  } catch (error) {
    logger.error('List directors failed:', error.message)
    res.status(400).json({ error: error.message })
  }
})

// R29：关闭导演模式（保留导演档案与已生成指导，仅停止 prompt 注入）
// body: { projectId }
router.post('/disable', async (req, res) => {
  try {
    const { projectId } = req.body || {}
    if (!projectId) {
      return res.status(400).json({ error: 'projectId 不能为空' })
    }
    const project = await directorService.disableDirector(projectId)
    return res.json(project)
  } catch (error) {
    if (error.message.startsWith('Project not found')) {
      return res.status(404).json({ error: error.message })
    }
    logger.error('Disable director failed:', error.message)
    return res.status(400).json({ error: error.message })
  }
})

// R29：单个导演档案
router.get('/:id', (req, res) => {
  try {
    const director = directorService.getDirector(req.params.id)
    res.json(director)
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

// R29：为项目应用导演模式
// body: { projectId }
router.post('/:id/apply', async (req, res) => {
  try {
    const { projectId } = req.body || {}
    if (!projectId) {
      return res.status(400).json({ error: 'projectId 不能为空' })
    }
    const result = await directorService.applyDirector(projectId, req.params.id)
    return res.json(result)
  } catch (error) {
    if (
      error.message.startsWith('Director not found') ||
      error.message.startsWith('Project not found')
    ) {
      return res.status(404).json({ error: error.message })
    }
    logger.error('Apply director failed:', error.message)
    return res.status(400).json({ error: error.message })
  }
})

export default router
