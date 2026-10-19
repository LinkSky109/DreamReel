import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'fs'
import {
  appendInvocationMetric,
  readInvocationMetrics,
  listMetricDates,
  cleanupOldMetrics,
  metricsDir,
} from '../src/services/metricsStore.js'
import { buildInvocationMetric, recordInvocation } from '../src/services/metricsRecorder.js'

function resetMetricsDir() {
  fs.rmSync(metricsDir(), { recursive: true, force: true })
}

describe('metricsStore', () => {
  beforeEach(resetMetricsDir)

  it('追加后可读回', () => {
    appendInvocationMetric({ ts: '2026-10-17T10:00:00.000Z', stage: 'text', provider: 'deepseek', success: true })
    const rows = readInvocationMetrics()
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].provider, 'deepseek')
  })

  it('按 stage/provider 过滤', () => {
    appendInvocationMetric({ ts: '2026-10-17T10:00:00.000Z', stage: 'text', provider: 'a' })
    appendInvocationMetric({ ts: '2026-10-17T10:00:01.000Z', stage: 'video', provider: 'b' })
    assert.strictEqual(readInvocationMetrics({ stage: 'text' }).length, 1)
    assert.strictEqual(readInvocationMetrics({ provider: 'b' }).length, 1)
    assert.strictEqual(readInvocationMetrics({ stage: 'text', provider: 'b' }).length, 0)
  })

  it('按日期范围过滤', () => {
    appendInvocationMetric({ ts: '2026-10-01T00:00:00.000Z', provider: 'a' })
    appendInvocationMetric({ ts: '2026-10-17T00:00:00.000Z', provider: 'a' })
    assert.deepStrictEqual(listMetricDates(), ['2026-10-01', '2026-10-17'])
    const inRange = readInvocationMetrics({ from: '2026-10-10', to: '2026-10-31' })
    assert.strictEqual(inRange.length, 1)
  })

  it('缺 ts 或非对象抛错', () => {
    assert.throws(() => appendInvocationMetric(null))
    assert.throws(() => appendInvocationMetric({ provider: 'a' }))
  })

  it('损坏行被跳过，不污染其余指标', () => {
    appendInvocationMetric({ ts: '2026-10-17T00:00:00.000Z', provider: 'a' })
    fs.appendFileSync(`${metricsDir()}/invocations-2026-10-17.jsonl`, '{ broken json\n', 'utf-8')
    appendInvocationMetric({ ts: '2026-10-17T00:00:01.000Z', provider: 'a' })
    assert.strictEqual(readInvocationMetrics().length, 2)
  })

  it('cleanup 删除超过保留期的文件', () => {
    appendInvocationMetric({ ts: '2020-01-01T00:00:00.000Z', provider: 'old' })
    appendInvocationMetric({ ts: '2026-10-17T00:00:00.000Z', provider: 'new' })
    const { removed } = cleanupOldMetrics({ rawRetentionDays: 7, now: new Date('2026-10-17T12:00:00.000Z') })
    assert.deepStrictEqual(removed, ['invocations-2020-01-01.jsonl'])
    assert.strictEqual(readInvocationMetrics().length, 1)
  })
})

describe('metricsRecorder', () => {
  beforeEach(resetMetricsDir)

  it('buildInvocationMetric 填充默认值并推导 isFallback', () => {
    const m = buildInvocationMetric({ stage: 'text', provider: 'a', attempt: 2 })
    assert.strictEqual(m.attempt, 2)
    assert.strictEqual(m.isFallback, true)
    assert.strictEqual(m.success, false)
    assert.strictEqual(m.scope, 'legacy')
    assert.ok(m.id && m.ts)
  })

  it('attempt=1 时 isFallback=false', () => {
    assert.strictEqual(buildInvocationMetric({ attempt: 1 }).isFallback, false)
    assert.strictEqual(buildInvocationMetric({}).isFallback, false)
  })

  it('errorMessage 截断到 300 字符', () => {
    const long = 'x'.repeat(500)
    const m = buildInvocationMetric({ errorMessage: long })
    assert.ok(m.errorMessage.length <= 301)
  })

  it('recordInvocation 落盘并可读回', () => {
    recordInvocation({ stage: 'video', provider: 'comfyui', success: true })
    assert.strictEqual(readInvocationMetrics({ provider: 'comfyui' }).length, 1)
  })
})
