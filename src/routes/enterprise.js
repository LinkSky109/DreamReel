import { Router } from 'express'
import { enterpriseService } from '../services/enterpriseService.js'
import { auditService } from '../services/auditService.js'
import { requirePermission } from '../middleware/authorize.js'
import { PERMISSIONS } from '../security/roles.js'

const router = Router()
const enterpriseOnly = requirePermission(PERMISSIONS.ENTERPRISE_MANAGE)
const auditOnly = requirePermission(PERMISSIONS.AUDIT_READ)

// 管理概览
router.get('/overview', enterpriseOnly, async (_req, res) => {
  res.json(await enterpriseService.overview())
})

// 安全配置
router.get('/config', enterpriseOnly, (_req, res) => {
  res.json(enterpriseService.getConfig())
})

router.put('/config', enterpriseOnly, (req, res) => {
  try {
    const config = enterpriseService.updateConfig(req.body, req.userId)
    res.json(config)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

// 审计日志查询
router.get('/audit', auditOnly, (req, res) => {
  res.json(auditService.list({
    actor: req.query.actor,
    action: req.query.action,
    resourceType: req.query.resourceType,
    result: req.query.result,
    limit: req.query.limit ? parseInt(req.query.limit, 10) : 100,
  }))
})

// 审计动作统计
router.get('/audit/stats', auditOnly, (_req, res) => {
  res.json(auditService.actionStats())
})

// 私有化部署信息
router.get('/deployment', enterpriseOnly, (_req, res) => {
  res.json(enterpriseService.deploymentInfo())
})

export default router
