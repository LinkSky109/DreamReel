/**
 * 用量口径归一（Phase 0）
 *
 * 把各家 provider 返回值里形态不一的 usage 归一成统一字段，供 costEstimator 与指标使用。
 * 不同 stage 的计费单位不同：text=token、image=张、video=秒、tts=字符。
 *
 * 缓存字段兼容（待真实响应核验，见设计文档 §7.2 / §12.3）：
 * - OpenAI: usage.prompt_tokens_details.cached_tokens
 * - DeepSeek: usage.prompt_cache_hit_tokens
 */

const STAGE_UNITS = Object.freeze({
  text: 'token',
  image: 'image',
  video: 'second',
  tts: 'char',
})

/** 仅接受有限数值，其余（含 null/undefined/NaN/字符串）归为 null */
function num(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * @param {'text'|'image'|'video'|'tts'} stage
 * @param {object|null} rawUsage provider 返回的原始 usage
 * @param {{unitCount?: number}} [ctx] 非文本阶段的计量（张数/秒数/字符数）
 * @returns {{
 *   unit: string, unitCount: number|null,
 *   promptTokens: number|null, completionTokens: number|null,
 *   totalTokens: number|null, cachedTokens: number|null, cacheHit: boolean|null
 * }}
 */
export function normalizeUsage(stage, rawUsage = null, ctx = {}) {
  if (stage !== 'text') {
    return {
      unit: STAGE_UNITS[stage] || 'call',
      unitCount: num(ctx?.unitCount),
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      cachedTokens: null,
      cacheHit: null,
    }
  }

  const u = rawUsage || {}
  const promptTokens = num(u.prompt_tokens) ?? num(u.inputTokens) ?? num(u.promptTokens)
  const completionTokens = num(u.completion_tokens) ?? num(u.outputTokens) ?? num(u.completionTokens)

  let totalTokens = num(u.total_tokens) ?? num(u.totalTokens)
  if (totalTokens === null && promptTokens !== null && completionTokens !== null) {
    totalTokens = promptTokens + completionTokens
  }

  const cachedTokens =
    num(u.prompt_tokens_details?.cached_tokens) ?? num(u.prompt_cache_hit_tokens) ?? null
  const cacheHit = cachedTokens === null ? null : cachedTokens > 0

  return {
    unit: 'token',
    unitCount: totalTokens,
    promptTokens,
    completionTokens,
    totalTokens,
    cachedTokens,
    cacheHit,
  }
}

export { STAGE_UNITS }
export default normalizeUsage
