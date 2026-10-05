import { Router } from 'express'
import { editPlanService } from '../services/editPlanService.js'

const router = Router()

function sendError(res, error) {
  res.status(error.statusCode || 400).json({ error: error.message })
}

router.get('/profiles', (_req, res) => {
  res.json({ items: editPlanService.listProfiles() })
})

router.post('/generate', async (req, res) => {
  try {
    const { projectId, profile, targetDuration, bgmId } = req.body
    if (!projectId) return res.status(400).json({ error: 'projectId 不能为空' })
    const plan = await editPlanService.generatePlan(
      projectId,
      { profile, targetDuration, bgmId },
      req.user?.id || 'default'
    )
    res.status(201).json(plan)
  } catch (error) {
    sendError(res, error)
  }
})

router.get('/:projectId', async (req, res) => {
  try {
    const plan = await editPlanService.getPlan(req.params.projectId, req.user?.id || 'default')
    if (!plan) return res.status(404).json({ error: '尚未生成剪辑方案' })
    res.json(plan)
  } catch (error) {
    sendError(res, error)
  }
})

router.delete('/:projectId', async (req, res) => {
  try {
    res.json(await editPlanService.clearPlan(req.params.projectId, req.user?.id || 'default'))
  } catch (error) {
    sendError(res, error)
  }
})

router.post('/:projectId/render', async (req, res) => {
  try {
    const result = await editPlanService.renderPlan(req.params.projectId, req.user?.id || 'default')
    res.json(result)
  } catch (error) {
    sendError(res, error)
  }
})

router.get('/:projectId/transition-support', async (req, res) => {
  try {
    res.json({ xfade: await editPlanService.supportsXfade() })
  } catch (error) {
    sendError(res, error)
  }
})

export default router
