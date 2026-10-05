import { Router } from 'express'
import { studioService } from '../services/studioService.js'
import logger from '../utils/logger.js'

const router = Router()

// R30：厂牌广场
router.get('/', async (_req, res) => {
  try {
    const result = await studioService.listStudios()
    res.json(result)
  } catch (error) {
    logger.error('List studios failed:', error.message)
    res.status(400).json({ error: error.message })
  }
})

// 创建厂牌
router.post('/', async (req, res) => {
  try {
    const studio = await studioService.createStudio({
      name: req.body.name,
      description: req.body.description,
      logo: req.body.logo,
      stylePositioning: req.body.stylePositioning,
      curatorName: req.body.curatorName,
      ownerId: req.body.ownerId || req.user?.id || 'default',
    })
    res.status(201).json(studio.toJSON())
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// 厂牌详情（聚合作品/剧集）
router.get('/:id', async (req, res) => {
  try {
    const detail = await studioService.getStudioDetail(req.params.id)
    res.json(detail)
  } catch (error) {
    if (error.message.startsWith('Studio not found')) {
      return res.status(404).json({ error: error.message })
    }
    res.status(400).json({ error: error.message })
  }
})

// 更新厂牌
router.put('/:id', async (req, res) => {
  try {
    const studio = await studioService.updateStudio(req.params.id, req.body || {})
    res.json(studio.toJSON())
  } catch (error) {
    if (error.message.startsWith('Studio not found')) {
      return res.status(404).json({ error: error.message })
    }
    res.status(400).json({ error: error.message })
  }
})

// 签约创作者
router.post('/:id/members', async (req, res) => {
  try {
    const studio = await studioService.signMember(req.params.id, {
      userId: req.body.userId,
      name: req.body.name,
      role: req.body.role,
    })
    res.json(studio.toJSON())
  } catch (error) {
    if (error.message.startsWith('Studio not found')) return res.status(404).json({ error: error.message })
    res.status(400).json({ error: error.message })
  }
})

// 移除签约创作者
router.delete('/:id/members/:userId', async (req, res) => {
  try {
    const studio = await studioService.removeMember(req.params.id, req.params.userId)
    res.json(studio.toJSON())
  } catch (error) {
    if (error.message.startsWith('Studio not found')) return res.status(404).json({ error: error.message })
    res.status(400).json({ error: error.message })
  }
})

// 建剧集
router.post('/:id/shows', async (req, res) => {
  try {
    const show = await studioService.createShow(req.params.id, {
      title: req.body.title,
      synopsis: req.body.synopsis,
      coverIcon: req.body.coverIcon,
    })
    res.status(201).json(show)
  } catch (error) {
    if (error.message.startsWith('Studio not found')) return res.status(404).json({ error: error.message })
    res.status(400).json({ error: error.message })
  }
})

// 剧集列表
router.get('/:id/shows', async (req, res) => {
  try {
    const studio = await studioService.getStudio(req.params.id)
    res.json({ total: studio.shows.length, items: studio.shows })
  } catch (error) {
    if (error.message.startsWith('Studio not found')) return res.status(404).json({ error: error.message })
    res.status(400).json({ error: error.message })
  }
})

// 单个剧集
router.get('/:id/shows/:showId', async (req, res) => {
  try {
    const show = await studioService.getShow(req.params.id, req.params.showId)
    res.json(show)
  } catch (error) {
    if (error.message.startsWith('Studio not found') || error.message.startsWith('Show not found')) {
      return res.status(404).json({ error: error.message })
    }
    res.status(400).json({ error: error.message })
  }
})

// 作品归入厂牌
router.post('/:id/projects/:projectId', async (req, res) => {
  try {
    const studio = await studioService.addProject(req.params.id, req.params.projectId)
    res.json(studio.toJSON())
  } catch (error) {
    if (error.message.startsWith('Studio not found') || error.message.startsWith('Project not found')) {
      return res.status(404).json({ error: error.message })
    }
    res.status(400).json({ error: error.message })
  }
})

// 厂牌作品列表
router.get('/:id/projects', async (req, res) => {
  try {
    const works = await studioService.listStudioWorks(req.params.id)
    res.json({ total: works.length, items: works })
  } catch (error) {
    if (error.message.startsWith('Studio not found')) return res.status(404).json({ error: error.message })
    res.status(400).json({ error: error.message })
  }
})

// 作品归入剧集
router.post('/:id/shows/:showId/projects/:projectId', async (req, res) => {
  try {
    const show = await studioService.addProjectToShow(req.params.id, req.params.showId, req.params.projectId)
    res.json(show)
  } catch (error) {
    if (
      error.message.startsWith('Studio not found') ||
      error.message.startsWith('Show not found') ||
      error.message.startsWith('Project not found')
    ) {
      return res.status(404).json({ error: error.message })
    }
    res.status(400).json({ error: error.message })
  }
})

export default router
