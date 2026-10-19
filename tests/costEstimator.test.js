import { describe, it } from 'node:test'
import assert from 'node:assert'
import { estimateCost } from '../src/services/costEstimator.js'

const table = {
  version: 'test-v1',
  currency: 'CNY',
  llm: { 'p:m': { inputPer1M: 1, outputPer1M: 2, cachedInputPer1M: 0.5 } },
  image: { 'p:*': { perImage: 0.5 } },
  video: { 'p:*': { perSecond: 2 } },
  tts: { 'p:*': { per1kChars: 3 } },
}

describe('costEstimator', () => {
  it('单价缺失时 pricingMissing=true 且 cost=null', () => {
    const r = estimateCost('llm', { provider: 'ghost', model: 'x', usage: { totalTokens: 100 } })
    assert.strictEqual(r.pricingMissing, true)
    assert.strictEqual(r.costEstimate, null)
  })

  it('文本：按 input/output 单价折算', () => {
    const r = estimateCost('text', {
      provider: 'p',
      model: 'm',
      usage: { promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 0 },
      table,
    })
    // 1*1 + 1*2 = 3
    assert.strictEqual(r.costEstimate, 3)
    assert.strictEqual(r.pricingMissing, false)
    assert.strictEqual(r.currency, 'CNY')
    assert.strictEqual(r.priceTableVersion, 'test-v1')
  })

  it('文本：缓存命中部分按 cachedInputPer1M 计', () => {
    const r = estimateCost('text', {
      provider: 'p',
      model: 'm',
      usage: { promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 1_000_000 },
      table,
    })
    // billableInput=0; cached 1e6*0.5=0.5; output 1e6*2=2 → 2.5
    assert.strictEqual(r.costEstimate, 2.5)
  })

  it('文本：单价为 null（未核实）时算不出→cost=null 且 pricingMissing=false', () => {
    const r = estimateCost('text', {
      provider: 'deepseek',
      model: 'deepseek-reasoner',
      usage: { promptTokens: 100, completionTokens: 100 },
    })
    assert.strictEqual(r.costEstimate, null)
    assert.strictEqual(r.pricingMissing, false)
  })

  it('文本：OpenAI 已录单价 → 能算出成本（CNY）', () => {
    const r = estimateCost('text', {
      provider: 'openai',
      model: 'gpt-4o-mini',
      usage: { promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 0 },
    })
    // 1.0035 + 4.014 = 5.0175
    assert.strictEqual(r.costEstimate, 5.0175)
    assert.strictEqual(r.currency, 'CNY')
    assert.strictEqual(r.pricingMissing, false)
  })

  it('DeepSeek 分时价：空闲 5 / 高峰 ×2 = 10', () => {
    const usage = { promptTokens: 1_000_000, completionTokens: 1_000_000, cachedTokens: 0 }
    const off = estimateCost('text', { provider: 'deepseek', model: 'deepseek-flash', usage, ctx: { at: new Date('2026-10-19T13:00:00Z') } }) // 北京 21:00
    const peak = estimateCost('text', { provider: 'deepseek', model: 'deepseek-flash', usage, ctx: { at: new Date('2026-10-19T02:00:00Z') } }) // 北京 10:00
    assert.strictEqual(off.costEstimate, 5)
    assert.strictEqual(peak.costEstimate, 10)
  })

  it('图片：按张数折算', () => {
    const r = estimateCost('image', { provider: 'p', model: 'x', ctx: { unitCount: 2 }, table })
    assert.strictEqual(r.costEstimate, 1) // 0.5*2
  })

  it('视频：按秒数折算', () => {
    const r = estimateCost('video', { provider: 'p', model: 'x', ctx: { durationSeconds: 5 }, table })
    assert.strictEqual(r.costEstimate, 10) // 2*5
  })

  it('视频：真实供应商单价未核实→pricingMissing false 但 cost=null', () => {
    const r = estimateCost('video', { provider: 'seedance', model: 'seedance-2.5', ctx: { durationSeconds: 5 } })
    assert.strictEqual(r.costEstimate, null)
    assert.strictEqual(r.pricingMissing, false)
  })

  it('语音：按千字符折算', () => {
    const r = estimateCost('tts', { provider: 'p', model: 'x', ctx: { charCount: 2000 }, table })
    assert.strictEqual(r.costEstimate, 6) // 3 * 2000/1000
  })

  it('自托管视频成本为 0', () => {
    const r = estimateCost('video', { provider: 'comfyui', model: 't2v', ctx: { durationSeconds: 5 } })
    assert.strictEqual(r.costEstimate, 0)
    assert.strictEqual(r.pricingMissing, false)
  })

  it('billingModel：metered', () => {
    const r = estimateCost('text', { provider: 'p', model: 'm', usage: { promptTokens: 1, completionTokens: 1 }, table })
    assert.strictEqual(r.billingModel, 'metered')
  })

  it('billingModel：free（自托管）', () => {
    const r = estimateCost('text', { provider: 'mock', model: 'mock', usage: { totalTokens: 10 } })
    assert.strictEqual(r.billingModel, 'free')
    assert.strictEqual(r.costEstimate, 0)
  })

  it('billingModel：plan（套餐）——边际成本 0 且带套餐名', () => {
    const r = estimateCost('text', { provider: 'volcengine', model: 'doubao-pro', usage: { totalTokens: 5000 } })
    assert.strictEqual(r.billingModel, 'plan')
    assert.strictEqual(r.costEstimate, 0)
    assert.strictEqual(r.pricingMissing, false)
    assert.strictEqual(r.planName, '火山方舟 Agent Plan')
  })

  it('未知供应商仍 pricingMissing=true', () => {
    const r = estimateCost('text', { provider: 'ghost', model: 'x', usage: { totalTokens: 1 } })
    assert.strictEqual(r.pricingMissing, true)
    assert.strictEqual(r.billingModel, 'metered')
  })

  it('火山 plan 端点：Seedream 图片=套餐(0)', () => {
    const r = estimateCost('image', { provider: 'openai', model: 'doubao-seedream-5.0-pro', ctx: { unitCount: 1 } })
    assert.strictEqual(r.billingModel, 'plan')
    assert.strictEqual(r.costEstimate, 0)
    assert.strictEqual(r.pricingMissing, false)
  })

  it('火山 plan 端点：Seedance 视频=套餐(0)', () => {
    const r = estimateCost('video', { provider: 'seedance', model: 'doubao-seedance-2.5', ctx: { durationSeconds: 5 } })
    assert.strictEqual(r.billingModel, 'plan')
    assert.strictEqual(r.costEstimate, 0)
  })

  it('火山 TTS（Agent Plan）：套餐 → cost=0', () => {
    const r = estimateCost('tts', { provider: 'volc', model: null, ctx: { charCount: 100 } })
    assert.strictEqual(r.pricingMissing, false)
    assert.strictEqual(r.billingModel, 'plan')
    assert.strictEqual(r.costEstimate, 0)
  })
})
