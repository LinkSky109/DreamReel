import { describe, it } from 'node:test'
import assert from 'node:assert'
import { normalizeUsage } from '../src/services/usageNormalizer.js'

describe('usageNormalizer', () => {
  it('非文本阶段按各自单位，不解析 token', () => {
    const video = normalizeUsage('video', null, { unitCount: 5 })
    assert.strictEqual(video.unit, 'second')
    assert.strictEqual(video.unitCount, 5)
    assert.strictEqual(video.totalTokens, null)

    assert.strictEqual(normalizeUsage('image', null, { unitCount: 2 }).unit, 'image')
    assert.strictEqual(normalizeUsage('tts', null, { unitCount: 120 }).unit, 'char')
  })

  it('文本阶段解析 OpenAI 风格字段', () => {
    const u = normalizeUsage('text', { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 })
    assert.strictEqual(u.unit, 'token')
    assert.strictEqual(u.promptTokens, 100)
    assert.strictEqual(u.completionTokens, 40)
    assert.strictEqual(u.totalTokens, 140)
    assert.strictEqual(u.cachedTokens, null)
    assert.strictEqual(u.cacheHit, null)
  })

  it('缺 total_tokens 时由 prompt+completion 推导', () => {
    const u = normalizeUsage('text', { prompt_tokens: 10, completion_tokens: 5 })
    assert.strictEqual(u.totalTokens, 15)
  })

  it('兼容 OpenAI prompt_tokens_details.cached_tokens', () => {
    const u = normalizeUsage('text', {
      prompt_tokens: 100,
      completion_tokens: 10,
      prompt_tokens_details: { cached_tokens: 80 },
    })
    assert.strictEqual(u.cachedTokens, 80)
    assert.strictEqual(u.cacheHit, true)
  })

  it('兼容 DeepSeek prompt_cache_hit_tokens', () => {
    const u = normalizeUsage('text', { prompt_tokens: 100, completion_tokens: 10, prompt_cache_hit_tokens: 0 })
    assert.strictEqual(u.cachedTokens, 0)
    assert.strictEqual(u.cacheHit, false)
  })

  it('非法/缺失数值归为 null，不抛错', () => {
    const u = normalizeUsage('text', { prompt_tokens: 'x', completion_tokens: undefined })
    assert.strictEqual(u.promptTokens, null)
    assert.strictEqual(u.completionTokens, null)
    assert.strictEqual(u.totalTokens, null)

    const empty = normalizeUsage('text')
    assert.strictEqual(empty.totalTokens, null)
    assert.strictEqual(empty.cacheHit, null)
  })
})
