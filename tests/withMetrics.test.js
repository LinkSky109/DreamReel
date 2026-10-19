import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import { instrumentProvider, recordOutcome } from '../src/services/withMetrics.js'
import { readInvocationMetrics, metricsDir } from '../src/services/metricsStore.js'

class FakeLLM {
  constructor() {
    this.name = 'mock'
    this.model = 'mock'
  }
  async generate() {
    return { content: '{"a":1}', usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }
  }
  async generateJSON(p) {
    const r = await this.generate(p)
    return { data: JSON.parse(r.content), raw: r.content, usage: r.usage }
  }
}

describe('withMetrics.instrumentProvider', () => {
  beforeEach(() => fs.rmSync(metricsDir(), { recursive: true, force: true }))

  it('文本调用记录一条指标（含 token）', async () => {
    const p = instrumentProvider(new FakeLLM(), { stage: 'text', projectId: 'proj1', userId: 'u1' })
    await p.generateJSON({ userPrompt: 'x' })
    const rows = readInvocationMetrics({ stage: 'text' })
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].provider, 'mock')
    assert.strictEqual(rows[0].success, true)
    assert.strictEqual(rows[0].totalTokens, 15)
    assert.strictEqual(rows[0].projectId, 'proj1')
    assert.ok(rows[0].latencyMs >= 0)
  })

  it('不重复计数：generateJSON 内部调用 generate 只记一次', async () => {
    const p = instrumentProvider(new FakeLLM(), { stage: 'text' })
    await p.generateJSON({ userPrompt: 'x' }) // 内部会 this.generate
    assert.strictEqual(readInvocationMetrics({ stage: 'text' }).length, 1)
  })

  it('失败记录 success=false 且带 errorClass', async () => {
    const bad = {
      name: 'mock',
      model: 'mock',
      async generateJSON() {
        throw new Error('connect ECONNREFUSED 127.0.0.1')
      },
    }
    const p = instrumentProvider(bad, { stage: 'text' })
    await assert.rejects(() => p.generateJSON({}))
    const rows = readInvocationMetrics({ stage: 'text' })
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].success, false)
    assert.strictEqual(rows[0].errorClass, 'network')
  })

  it('非生成方法（getTaskStatus 等）不被记录', async () => {
    const p = instrumentProvider(
      { name: 'x', model: 'm', isConfigured() { return true } },
      { stage: 'video' }
    )
    assert.strictEqual(p.isConfigured(), true)
    assert.strictEqual(readInvocationMetrics().length, 0)
  })
})

describe('withMetrics.recordOutcome', () => {
  beforeEach(() => fs.rmSync(metricsDir(), { recursive: true, force: true }))

  it('video 终态记录一条指标', () => {
    recordOutcome(
      { stage: 'video', taskType: 'shot.video', provider: 'seedance', model: 'seedance-2.5', projectId: 'p', userId: 'u' },
      { success: true, latencyMs: 4200, ctx: { durationSeconds: 5 } }
    )
    const rows = readInvocationMetrics({ stage: 'video' })
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].provider, 'seedance')
    assert.strictEqual(rows[0].unit, 'second')
    assert.strictEqual(rows[0].unitCount, 5)
  })
})
