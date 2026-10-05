import { Router } from 'express'
import { titleSequenceService } from '../services/titleSequenceService.js'
import logger from '../utils/logger.js'

const router = Router()

// R28：创意片头模板列表
router.get('/', (_req, res) => {
  try {
    const templates = titleSequenceService.listTemplates()
    res.json({ total: templates.length, items: templates })
  } catch (error) {
    logger.error('List title templates failed:', error.message)
    res.status(400).json({ error: error.message })
  }
})

// R28：按模板生成片头视频
// body: { projectId, title, subtitle }
router.post('/:id/generate', async (req, res) => {
  try {
    const { projectId, title, subtitle } = req.body || {}
    if (!title || typeof title !== 'string' || !title.trim()) {
      return res.status(400).json({ error: 'title 不能为空' })
    }

    const result = await titleSequenceService.generateTitleSequence({
      templateId: req.params.id,
      projectId,
      title,
      subtitle,
    })

    logger.info(`Title sequence generated for template ${req.params.id}: ${result.videoUrl}`)
    return res.status(201).json(result)
  } catch (error) {
    if (error.message.startsWith('Title template not found')) {
      return res.status(404).json({ error: error.message })
    }
    logger.error('Generate title sequence failed:', error.message)
    return res.status(400).json({ error: error.message })
  }
})

export default router
