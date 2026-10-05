import { Router } from 'express'
import { projectService } from '../services/projectService.js'
import { videoService } from '../services/videoService.js'
import { openApiAuth, requireScope } from '../middleware/openApiAuth.js'

/**
 * R13：开放 API（/api/open/v1）
 */
const router = Router()

router.use(openApiAuth)

// 创建项目
router.post('/projects', requireScope('project:write'), async (req, res) => {
  try {
    const project = await projectService.createProject({
      name: req.body.name,
      description: req.body.description,
      userId: req.apiKey.userId,
      style: req.body.style,
      targetDuration: req.body.targetDuration,
    })
    res.status(201).json({ id: project.id, name: project.name, status: project.status })
  } catch (e) {
    res.status(400).json({ error: { code: 'create_failed', message: e.message } })
  }
})

// 查询项目
router.get('/projects/:projectId', requireScope('project:read'), async (req, res) => {
  try {
    const p = await projectService.getProject(req.params.projectId)
    res.json({
      id: p.id,
      name: p.name,
      status: p.status,
      shots: (p.shots || []).map((s) => ({
        id: s.id,
        status: s.status,
        hasVideo: !!s.videoUrl,
      })),
    })
  } catch (e) {
    res.status(404).json({ error: { code: 'not_found', message: e.message } })
  }
})

// 生成视频（单镜头或全片）
router.post('/videos/generate', requireScope('video:generate'), async (req, res) => {
  try {
    const { projectId, shotIds } = req.body
    if (!projectId) return res.status(400).json({ error: { code: 'missing_project', message: 'projectId 必填' } })
    const result = await videoService.generateProjectVideos(projectId, shotIds)
    res.status(202).json({
      projectId,
      status: 'accepted',
      generated: result.results?.filter((r) => r.success).length || 0,
      total: result.results?.length || 0,
    })
  } catch (e) {
    res.status(400).json({ error: { code: 'generate_failed', message: e.message } })
  }
})

// Key 自身信息与用量
router.get('/key/info', (req, res) => {
  const k = req.apiKey
  res.json({
    name: k.name,
    scopes: k.scopes,
    callCount: k.callCount,
    lastUsedAt: k.lastUsedAt,
  })
})

export default router
