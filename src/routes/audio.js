import { Router } from 'express'
import { audioService } from '../services/audioService.js'
import { projectService } from '../services/projectService.js'

const router = Router()

/**
 * 获取 BGM 列表
 */
router.get('/bgm', (req, res) => {
  try {
    const { emotion, search } = req.query
    const result = audioService.listBgm({ emotion, search })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取单个 BGM
 */
router.get('/bgm/:id', (req, res) => {
  try {
    const bgm = audioService.getBgm(req.params.id)
    if (!bgm) {
      return res.status(404).json({ error: 'BGM not found' })
    }
    res.json(bgm)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * AI 推荐 BGM
 */
router.post('/bgm/recommend', (req, res) => {
  try {
    const { scriptText } = req.body
    if (!scriptText) {
      return res.status(400).json({ error: 'scriptText is required' })
    }
    const result = audioService.recommendBgm(scriptText)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取音效列表
 */
router.get('/sfx', (req, res) => {
  try {
    const { category, search } = req.query
    const result = audioService.listSfx({ category, search })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取单个音效
 */
router.get('/sfx/:id', (req, res) => {
  try {
    const sfx = audioService.getSfx(req.params.id)
    if (!sfx) {
      return res.status(404).json({ error: 'SFX not found' })
    }
    res.json(sfx)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取音频库统计
 */
router.get('/stats', (req, res) => {
  try {
    const stats = audioService.getStats()
    res.json(stats)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * R33：混音预听（真实文件）
 */
router.post('/preview', async (req, res) => {
  try {
    const { projectId, language, voiceId, speed, duration } = req.body
    if (!projectId) {
      return res.status(400).json({ error: 'projectId is required' })
    }
    const project = await projectService.getProject(projectId)
    const userId = req.user?.id || 'default'
    if ((project.userId || 'default') !== userId) {
      return res.status(404).json({ error: `Project not found: ${projectId}` })
    }
    const result = await audioService.previewMix(project, { language, voiceId, speed, duration })
    res.json(result)
  } catch (error) {
    const status = error.message.startsWith('Project not found') ? 404 : 400
    res.status(status).json({ error: error.message })
  }
})

export default router
