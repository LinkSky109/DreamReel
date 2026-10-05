import { Router } from 'express'
import { enterpriseService } from '../services/enterpriseService.js'
import { auditService } from '../services/auditService.js'

const router = Router()

// 管理概览
router.get('/overview', async (_req, res) => {
  res.json(await enterpriseService.overview())
})

// 安全配置
router.get('/config', (_req, res) => {
  res.json(enterpriseService.getConfig())
})

router.put('/config', (req, res) => {
  try {
    const config = enterpriseService.updateConfig(req.body, req.user?.id || 'admin')
    res.json(config)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 审计日志查询
router.get('/audit', (req, res) => {
  res.json(auditService.list({
    actor: req.query.actor,
    action: req.query.action,
    resourceType: req.query.resourceType,
    result: req.query.result,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
  }))
})

// 审计动作统计
router.get('/audit/stats', (_req, res) => {
  res.json(auditService.actionStats())
})

// 私有化部署信息
router.get('/deployment', (_req, res) => {
  res.json(enterpriseService.deploymentInfo())
})

export default router
