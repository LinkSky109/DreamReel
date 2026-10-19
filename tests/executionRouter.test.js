import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert'
import fs from 'node:fs'
import { shouldSwitch, composeWithFallback } from '../src/services/executionRouter.js'
import { readInvocationMetrics, metricsDir } from '../src/services/metricsStore.js'

function rawLLM(name, behavior) {
  return {
    name,
    model: `${name}-m`,
    async generateJSON() {
      if (behavior === 'ok') return { data: {}, raw: '{}', usage: { total_tokens: 1 } }
      if (behavior === 'hang') return new Promise(() => {})
      throw new Error(behavior)
    },
  }
}

describe('executionRouter.shouldSwitch', () => {
  it('超时/5xx/限流/401/网络 → 切换', () => {
    assert.strictEqual(shouldSwitch(new Error('request timeout')), true)
    assert.strictEqual(shouldSwitch(new Error('API error 503')), true)
    assert.strictEqual(shouldSwitch(new Error('429 rate limit')), true)
    assert.strictEqual(shouldSwitch(new Error('401 unauthorized')), true)
    assert.strictEqual(shouldSwitch(new Error('connect ECONNREFUSED')), true)
  })
  it('客户端 400 → 不切换', () => {
    assert.strictEqual(shouldSwitch(new Error('ComfyUI /prompt 400: bad')), false)
  })
})

describe('executionRouter.composeWithFallback', () => {
  beforeEach(() => fs.rmSync(metricsDir(), { recursive: true, force: true }))

  it('单实例退化为 instrumentProvider（调用即记录）', async () => {
    const c = composeWithFallback([rawLLM('a', 'ok')], { stage: 'text' })
    await c.generateJSON({})
    assert.strictEqual(readInvocationMetrics().length, 1)
  })

  it('主成功 → 不触发回退，仅一条指标', async () => {
    const c = composeWithFallback([rawLLM('a', 'ok'), rawLLM('b', 'ok')], { stage: 'text' })
    const r = await c.generateJSON({})
    assert.ok(r)
    assert.strictEqual(readInvocationMetrics().length, 1)
  })

  it('主失败(可切换) → 回退成功；两条指标共享 requestId', async () => {
    const c = composeWithFallback([rawLLM('a', 'timeout'), rawLLM('b', 'ok')], { stage: 'text' })
    await c.generateJSON({})
    const rows = readInvocationMetrics().sort((x, y) => x.attempt - y.attempt)
    assert.strictEqual(rows.length, 2)
    assert.strictEqual(rows[0].provider, 'a')
    assert.strictEqual(rows[0].success, false)
    assert.strictEqual(rows[1].provider, 'b')
    assert.strictEqual(rows[1].success, true)
    assert.strictEqual(rows[1].isFallback, true)
    assert.ok(rows[0].requestId && rows[0].requestId === rows[1].requestId)
  })

  it('主失败(不可切换 400) → 直接抛出，不调回退', async () => {
    const c = composeWithFallback([rawLLM('a', 'error 400 bad request'), rawLLM('b', 'ok')], { stage: 'text' })
    await assert.rejects(() => c.generateJSON({}), /400/)
    const rows = readInvocationMetrics()
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].provider, 'a')
  })

  it('全部失败 → 抛最后一次错误（两次都记录）', async () => {
    const c = composeWithFallback([rawLLM('a', 'timeout'), rawLLM('b', '503 server')], { stage: 'text' })
    await assert.rejects(() => c.generateJSON({}), /503/)
    assert.strictEqual(readInvocationMetrics().length, 2)
  })

  it('deadline：主挂起 → 软超时切换（errorClass=timeout）', async () => {
    const c = composeWithFallback([rawLLM('a', 'hang'), rawLLM('b', 'ok')], { stage: 'text', deadlineMs: 30 })
    const r = await c.generateJSON({})
    assert.ok(r)
    const rows = readInvocationMetrics().sort((x, y) => x.attempt - y.attempt)
    assert.strictEqual(rows.length, 2)
    assert.strictEqual(rows[0].success, false)
    assert.strictEqual(rows[0].errorClass, 'timeout')
    assert.strictEqual(rows[1].success, true)
  })

  it('泛化方法：generateImage 回退 + 其它方法透传主实例', async () => {
    const a = {
      name: 'a',
      model: 'a',
      supportsRef() {
        return true
      },
      async generateImage() {
        throw new Error('503 upstream')
      },
    }
    const b = { name: 'b', model: 'b', async generateImage() { return { filePath: 'x.png' } } }
    const c = composeWithFallback([a, b], { stage: 'image' }, ['generateImage'])
    const r = await c.generateImage({})
    assert.strictEqual(r.filePath, 'x.png')
    assert.strictEqual(c.supportsRef(), true) // 非包装方法经 Proxy 透传
    assert.strictEqual(readInvocationMetrics({ stage: 'image' }).length, 2)
  })
})
