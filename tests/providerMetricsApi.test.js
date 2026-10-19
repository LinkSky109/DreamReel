/**
 * providerMetrics 路由测试：把「尚未挂载」的新路由挂到测试用 express 实例上验证契约。
 * 不触碰 src/server.js。
 */

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import express from 'express'
import request from 'supertest'
import providerMetricsRouter from '../src/routes/providerMetrics.js'
import { appendInvocationMetric, metricsDir } from '../src/services/metricsStore.js'

function buildApp() {
  const app = express()
  app.use('/api/providers', providerMetricsRouter)
  return app
}

describe('providerMetrics API', () => {
  beforeEach(() => fs.rmSync(metricsDir(), { recursive: true, force: true }))

  it('GET /metrics 返回 range + totals + groups', async () => {
    appendInvocationMetric({
      ts: '2026-10-17T10:00:00.000Z',
      stage: 'text',
      provider: 'deepseek',
      model: 'deepseek-chat',
      success: true,
      latencyMs: 1200,
    })
    const res = await request(buildApp()).get('/api/providers/metrics?stage=text&groupBy=provider')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.totals.calls, 1)
    assert.strictEqual(res.body.groups[0].key, 'deepseek')
  })

  it('GET /compare 解析 models 查询参数', async () => {
    appendInvocationMetric({ ts: '2026-10-17T10:00:00.000Z', stage: 'text', provider: 'a', model: 'm1', success: true })
    appendInvocationMetric({ ts: '2026-10-17T10:00:01.000Z', stage: 'text', provider: 'b', model: 'm2', success: false })
    const res = await request(buildApp()).get('/api/providers/compare?stage=text&models=a:m1,b:m2')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.models.length, 2)
  })

  it('GET /costs 返回成本汇总', async () => {
    appendInvocationMetric({ ts: '2026-10-17T10:00:00.000Z', provider: 'a', costEstimate: 2, pricingMissing: false })
    const res = await request(buildApp()).get('/api/providers/costs')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.totals.costEstimate, 2)
  })

  it('空数据时返回 0 计数而非报错', async () => {
    const res = await request(buildApp()).get('/api/providers/metrics')
    assert.strictEqual(res.status, 200)
    assert.strictEqual(res.body.totals.calls, 0)
  })
})
