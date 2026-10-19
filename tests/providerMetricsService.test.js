import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import {
  percentile,
  summarize,
  aggregate,
  queryMetrics,
  compareModels,
  costSummary,
} from '../src/services/providerMetricsService.js'
import { appendInvocationMetric, metricsDir } from '../src/services/metricsStore.js'

function rec(over = {}) {
  return {
    ts: '2026-10-17T10:00:00.000Z',
    success: true,
    isFallback: false,
    latencyMs: 100,
    provider: 'a',
    model: 'm',
    stage: 'text',
    ...over,
  }
}

describe('providerMetricsService - 纯函数', () => {
  it('percentile 最近秩', () => {
    assert.strictEqual(percentile([1, 2, 3, 4, 5], 50), 3)
    assert.strictEqual(percentile([1, 2, 3, 4, 5], 95), 5)
    assert.strictEqual(percentile([], 50), null)
    assert.strictEqual(percentile([10], 50), 10)
  })

  it('summarize 计算成功率/延迟分位/token/成本', () => {
    const s = summarize([
      rec({ latencyMs: 100, totalTokens: 100, promptTokens: 100, cachedTokens: 40, costEstimate: 1 }),
      rec({ latencyMs: 300, success: false, totalTokens: 300, promptTokens: 300, cachedTokens: 0, costEstimate: null, pricingMissing: true }),
      rec({ latencyMs: 200, isFallback: true, totalTokens: 200, promptTokens: 200, cachedTokens: 60, costEstimate: 2 }),
    ])
    assert.strictEqual(s.calls, 3)
    assert.strictEqual(s.successRate, 0.6667)
    assert.strictEqual(s.fallbackCalls, 1)
    assert.strictEqual(s.p50LatencyMs, 200)
    assert.strictEqual(s.p95LatencyMs, 300)
    assert.strictEqual(s.totalTokens, 600)
    assert.strictEqual(s.avgTokens, 200)
    // cached 100 / prompt 600
    assert.strictEqual(s.cachedTokenRatio, 0.1667)
    assert.strictEqual(s.costEstimate, 3)
    assert.strictEqual(s.pricingMissingCalls, 1)
  })

  it('aggregate 按 provider/model/day 分组', () => {
    const records = [
      rec({ provider: 'a', model: 'm1', ts: '2026-10-17T00:00:00.000Z' }),
      rec({ provider: 'a', model: 'm1', ts: '2026-10-17T01:00:00.000Z' }),
      rec({ provider: 'b', model: 'm2', ts: '2026-10-16T00:00:00.000Z' }),
    ]
    assert.strictEqual(aggregate(records, 'provider').length, 2)
    assert.strictEqual(aggregate(records, 'model')[0].key, 'a:m1')
    assert.strictEqual(aggregate(records, 'model')[0].calls, 2)
    const byDay = aggregate(records, 'day')
    assert.strictEqual(byDay.length, 2)
  })
})

describe('providerMetricsService - 查询门面', () => {
  beforeEach(() => fs.rmSync(metricsDir(), { recursive: true, force: true }))

  it('queryMetrics 返回 totals 与分组', () => {
    appendInvocationMetric(rec({ provider: 'a', model: 'm1', latencyMs: 100, success: true }))
    appendInvocationMetric(rec({ provider: 'b', model: 'm2', latencyMs: 500, success: false }))
    const out = queryMetrics({ stage: 'text' }, { groupBy: 'provider' })
    assert.strictEqual(out.count, 2)
    assert.strictEqual(out.totals.calls, 2)
    assert.strictEqual(out.groups.length, 2)
  })

  it('compareModels 按 provider:model 并排', () => {
    appendInvocationMetric(rec({ provider: 'a', model: 'm1', success: true }))
    appendInvocationMetric(rec({ provider: 'a', model: 'm1', success: true }))
    appendInvocationMetric(rec({ provider: 'b', model: 'm2', success: false }))
    const rows = compareModels({ stage: 'text' })
    assert.strictEqual(rows[0].key, 'a:m1')
    assert.strictEqual(rows[0].calls, 2)
    assert.strictEqual(rows[0].successRate, 1)
  })

  it('compareModels 可按 models 白名单过滤', () => {
    appendInvocationMetric(rec({ provider: 'a', model: 'm1' }))
    appendInvocationMetric(rec({ provider: 'b', model: 'm2' }))
    const rows = compareModels({ stage: 'text', models: ['b:m2'] })
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].key, 'b:m2')
  })

  it('costSummary 汇总成本并暴露未录单价计数', () => {
    appendInvocationMetric(rec({ costEstimate: 1.5, pricingMissing: false }))
    appendInvocationMetric(rec({ costEstimate: null, pricingMissing: true }))
    const out = costSummary({}, { groupBy: 'provider' })
    assert.strictEqual(out.totals.costEstimate, 1.5)
    assert.strictEqual(out.totals.pricingMissingCalls, 1)
  })
})
