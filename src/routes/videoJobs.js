import { Router } from 'express'
import { requireProjectAccess } from '../middleware/projectAccess.js'
import { validateBody, validateQuery } from '../middleware/validate.js'
import { videoJobCreateSchema, videoJobListQuerySchema } from '../contracts/video.js'
import { videoJobService } from '../services/videoJobService.js'

/**
 * 视频长任务 API（R3-T3.5），挂载于 /api/video。
 * 契约见 docs/adr/0005-video-job-persistence.md
 */
const router = Router()

// 创建任务（幂等：Idempotency-Key 头）
router.post('/jobs', validateBody(videoJobCreateSchema), async (req, res, next) => {
  try {
    const { projectId, shotIds, styleId } = req.validated.body
    const guard = await requireProjectAccess(req, res, projectId)
    if (!guard) return

    const idempotencyKey = req.get('Idempotency-Key') || null
    const { job, replayed } = await videoJobService.createJob({
      userId: req.userId,
      project: guard.project,
      shotIds,
      styleId,
      idempotencyKey,
    })
    res.status(replayed ? 200 : 202).json({
      jobId: job.id,
      status: job.status,
      total: job.total,
      replayed,
    })
  } catch (error) {
    next(error)
  }
})

// 任务列表
router.get('/jobs', validateQuery(videoJobListQuerySchema), async (req, res, next) => {
  try {
    const { projectId, limit } = req.validated.query
    const guard = await requireProjectAccess(req, res, projectId)
    if (!guard) return
    const items = await videoJobService.listJobs(projectId, { limit })
    res.json({ total: items.length, items })
  } catch (error) {
    next(error)
  }
})

// 任务详情
router.get('/jobs/:jobId', async (req, res, next) => {
  try {
    const job = await videoJobService.getJob(req.params.jobId)
    const guard = await requireProjectAccess(req, res, job.projectId)
    if (!guard) return
    res.json(job)
  } catch (error) {
    next(error)
  }
})

// 取消任务
router.post('/jobs/:jobId/cancel', async (req, res, next) => {
  try {
    const job = await videoJobService.getJob(req.params.jobId)
    const guard = await requireProjectAccess(req, res, job.projectId)
    if (!guard) return
    const updated = await videoJobService.cancelJob(job.id)
    res.json(updated)
  } catch (error) {
    next(error)
  }
})

export default router
