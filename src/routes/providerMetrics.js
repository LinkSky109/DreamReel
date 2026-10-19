/**
 * Provider 指标 / 对比 / 成本 接口（Phase 0）
 *
 * ⚠️ 本文件为**新增路由，尚未挂载**。挂载（需改 src/server.js，属「现有代码」改动）留待用户确认后执行：
 *   import providerMetricsRouter from './routes/providerMetrics.js'
 *   app.use('/api/providers', providerMetricsRouter)
 *
 * 挂载后在 /api/providers 下提供：
 *   GET /metrics  ?stage&provider&model&taskType&projectId&userId&from&to&groupBy
 *   GET /compare  ?stage&models=a:b,c:d&from&to&taskType
 *   GET /costs    ?from&to&groupBy
 */

import { Router } from 'express'
import { queryMetrics, compareModels, costSummary } from '../services/providerMetricsService.js'

const router = Router()

function parseModels(raw) {
  if (!raw || typeof raw !== 'string') return null
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.length ? list : null
}

/** 指标聚合：按 stage/provider/model/taskType/project/day 分组 */
router.get('/metrics', (req, res) => {
  try {
    const { stage, provider, model, taskType, projectId, userId, from, to, groupBy } = req.query
    const filters = { stage, provider, model, taskType, projectId, userId, from, to }
    const result = queryMetrics(filters, { groupBy })
    res.json({ range: { from: from || null, to: to || null }, ...result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/** 多模型并排对比 */
router.get('/compare', (req, res) => {
  try {
    const { stage, models, from, to, taskType } = req.query
    const rows = compareModels({ stage, models: parseModels(models), from, to, taskType })
    res.json({ stage: stage || null, models: rows })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/** 成本汇总 */
router.get('/costs', (req, res) => {
  try {
    const { from, to, stage, provider, model, taskType, projectId, userId, groupBy } = req.query
    const filters = { stage, provider, model, taskType, projectId, userId, from, to }
    const result = costSummary(filters, { groupBy })
    res.json({ range: { from: from || null, to: to || null }, ...result })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
