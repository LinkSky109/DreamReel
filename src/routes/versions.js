import { Router } from 'express'
import { AppError } from '../utils/appError.js'
import { versionService } from '../services/versionService.js'
import { requireProjectOwnership } from '../middleware/projectAccess.js'

const router = Router()

/**
 * 获取项目版本列表
 * GET /api/projects/:projectId/versions
 */
router.get('/:projectId/versions', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { limit, offset } = req.query
    const result = versionService.getVersions(req.params.projectId, {
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    })
    res.json(result)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

/**
 * 手动保存版本
 * POST /api/projects/:projectId/versions
 */
router.post('/:projectId/versions', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { label, description } = req.body
    const version = await versionService.saveVersion(req.params.projectId, {
      label,
      description,
      auto: false,
    })
    res.status(201).json(version)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

/**
 * 对比两个版本
 * GET /api/projects/:projectId/versions/compare?from=v1&to=v2
 */
router.get('/:projectId/versions/compare', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const { from, to } = req.query
    if (!from || !to) {
      return res.status(400).json({ error: '需要指定 from 和 to 版本 ID' })
    }
    const result = versionService.compareVersions(req.params.projectId, from, to)
    res.json(result)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

/**
 * 获取版本详情
 * GET /api/projects/:projectId/versions/:versionId
 */
router.get('/:projectId/versions/:versionId', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const version = versionService.getVersion(req.params.projectId, req.params.versionId)
    res.json(version)
  } catch (error) {
    next(AppError.notFound(error.message, { cause: error }))
  }
})

/**
 * 回滚到指定版本
 * POST /api/projects/:projectId/versions/:versionId/rollback
 */
router.post('/:projectId/versions/:versionId/rollback', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    const result = await versionService.rollback(req.params.projectId, req.params.versionId)
    res.json(result)
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

/**
 * 删除版本
 * DELETE /api/projects/:projectId/versions/:versionId
 */
router.delete('/:projectId/versions/:versionId', async (req, res, next) => {
  try {
    const guard = await requireProjectOwnership(req, res)
    if (!guard) return
    versionService.deleteVersion(req.params.projectId, req.params.versionId)
    res.json({ success: true })
  } catch (error) {
    next(AppError.badRequest(error.message, { cause: error }))
  }
})

export default router
