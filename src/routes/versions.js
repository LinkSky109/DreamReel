import { Router } from 'express'
import { versionService } from '../services/versionService.js'
import { projectService } from '../services/projectService.js'

const router = Router()

/**
 * 获取项目版本列表
 * GET /api/projects/:projectId/versions
 */
router.get('/:projectId/versions', async (req, res) => {
  try {
    const { limit, offset } = req.query
    const result = versionService.getVersions(req.params.projectId, {
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
    })
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 手动保存版本
 * POST /api/projects/:projectId/versions
 */
router.post('/:projectId/versions', async (req, res) => {
  try {
    await projectService.getProject(req.params.projectId) // 验证项目存在
    const { label, description } = req.body
    const version = await versionService.saveVersion(req.params.projectId, {
      label,
      description,
      auto: false,
    })
    res.status(201).json(version)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 获取版本详情
 * GET /api/projects/:projectId/versions/:versionId
 */
router.get('/:projectId/versions/:versionId', (req, res) => {
  try {
    const version = versionService.getVersion(req.params.projectId, req.params.versionId)
    res.json(version)
  } catch (error) {
    res.status(404).json({ error: error.message })
  }
})

/**
 * 回滚到指定版本
 * POST /api/projects/:projectId/versions/:versionId/rollback
 */
router.post('/:projectId/versions/:versionId/rollback', async (req, res) => {
  try {
    const result = await versionService.rollback(req.params.projectId, req.params.versionId)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 删除版本
 * DELETE /api/projects/:projectId/versions/:versionId
 */
router.delete('/:projectId/versions/:versionId', (req, res) => {
  try {
    versionService.deleteVersion(req.params.projectId, req.params.versionId)
    res.json({ success: true })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 对比两个版本
 * GET /api/projects/:projectId/versions/compare?from=v1&to=v2
 */
router.get('/:projectId/versions/compare', (req, res) => {
  try {
    const { from, to } = req.query
    if (!from || !to) {
      return res.status(400).json({ error: '需要指定 from 和 to 版本 ID' })
    }
    const result = versionService.compareVersions(req.params.projectId, from, to)
    res.json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
