import { Router } from 'express'
import { posterService } from '../services/posterService.js'
import { trailerService } from '../services/trailerService.js'
import { projectService } from '../services/projectService.js'

const router = Router()

// R16：海报版式与风格选项
router.get('/poster/options', (_req, res) => {
  res.json({ formats: posterService.getFormats(), styles: posterService.getStyles() })
})

// R16：生成海报
router.post('/poster/generate', async (req, res) => {
  try {
    const { projectId, format, style } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId is required' })
    const project = await projectService.getProject(projectId)
    const poster = await posterService.generatePoster({ project, format, style })
    res.json({ success: true, poster })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

// R15：生成预告片
router.post('/trailer/generate', async (req, res) => {
  try {
    const { projectId, targetDuration } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId is required' })
    const project = await projectService.getProject(projectId)
    const trailer = await trailerService.generateTrailer({
      project,
      targetDuration: targetDuration || 20,
    })
    res.json(trailer)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
