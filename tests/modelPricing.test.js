import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  PRICING_TABLE,
  PRICE_TABLE_VERSION,
  lookupPrice,
  billingModelOf,
  isDeepseekPeakTime,
} from '../src/config/modelPricing.js'

describe('modelPricing', () => {
  it('currency 统一为 CNY', () => {
    assert.strictEqual(PRICING_TABLE.currency, 'CNY')
    assert.strictEqual(PRICING_TABLE.version, PRICE_TABLE_VERSION)
  })

  it('精确匹配 provider:model', () => {
    const p = lookupPrice('llm', 'openai', 'gpt-4o')
    assert.ok(p)
    assert.strictEqual(p.billingModel, 'metered')
    assert.ok(typeof p.inputPer1M === 'number' && p.inputPer1M > 0)
  })

  it('精确未命中时退化为 provider:*', () => {
    const p = lookupPrice('video', 'comfyui', 'whatever-template')
    assert.strictEqual(p.perSecond, 0)
    assert.strictEqual(p.billingModel, 'free')
  })

  it('未命中的 provider 返回 null', () => {
    assert.strictEqual(lookupPrice('llm', 'nonexistent', 'x'), null)
  })

  it('未知 stage 返回 null', () => {
    assert.strictEqual(lookupPrice('unknown', 'openai', 'gpt-4o'), null)
  })

  it('自托管/测试替身单价为 0', () => {
    assert.strictEqual(lookupPrice('llm', 'mock', 'mock').inputPer1M, 0)
    assert.strictEqual(lookupPrice('llm', 'opencode', 'x').inputPer1M, 0)
    assert.strictEqual(lookupPrice('video', 'comfyui', 'x').perSecond, 0)
  })

  it('计费模型：metered / plan / free', () => {
    assert.strictEqual(billingModelOf(lookupPrice('llm', 'openai', 'gpt-4o')), 'metered')
    assert.strictEqual(billingModelOf(lookupPrice('llm', 'volcengine', 'doubao-pro')), 'plan')
    assert.strictEqual(billingModelOf(lookupPrice('llm', 'mock', 'mock')), 'free')
  })

  it('billingModelOf 缺省为 metered（向后兼容）', () => {
    assert.strictEqual(billingModelOf({ inputPer1M: 1 }), 'metered')
    assert.strictEqual(billingModelOf(null), 'metered')
  })

  it('套餐条目带套餐元数据', () => {
    const p = lookupPrice('llm', 'volcengine', null)
    assert.strictEqual(p.billingModel, 'plan')
    assert.strictEqual(p.planName, '火山方舟 Agent Plan')
    assert.strictEqual(p.includedUnit, 'token')
  })

  it('isDeepseekPeakTime：北京时间工作日 9-12 / 14-18 为高峰', () => {
    // 2026-10-19 是周一；北京时间 = UTC+8
    assert.strictEqual(isDeepseekPeakTime(new Date('2026-10-19T02:00:00Z')), true) // 北京 10:00
    assert.strictEqual(isDeepseekPeakTime(new Date('2026-10-19T07:00:00Z')), true) // 北京 15:00
    assert.strictEqual(isDeepseekPeakTime(new Date('2026-10-19T05:00:00Z')), false) // 北京 13:00（午休）
    assert.strictEqual(isDeepseekPeakTime(new Date('2026-10-19T00:00:00Z')), false) // 北京 08:00
    assert.strictEqual(isDeepseekPeakTime(new Date('2026-10-17T02:00:00Z')), false) // 周六
  })
})
