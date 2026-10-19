/**
 * 模型成本单价表（版本化、静态、代码内维护）
 *
 * 计费模型（billingModel）——支持「按量 / 套餐 / 免费」三类（a/b/c 需求）：
 * - `metered`：按量计费（inputPer1M / outputPer1M / perImage / perSecond / per1kChars）。
 * - `plan`   ：套餐/订阅制（固定月费 + 包含额度）。**单次调用的边际成本记 0**（额度内），用量照常记录。
 * - `free`   ：零成本（自托管 / 本地 / 测试替身）。
 *
 * 设计要点（见 ai/docs/provider-routing-and-cost-design.md §4.3 / §4.4）：
 * - 单价随厂商频繁调整，放在代码里 + PR 评审比放数据库更可控、可回溯。
 * - 币种统一 CNY（已决策）。外币价按汇率折算并在此标注折算日期。
 * - **绝不猜测价格**：未核实的单价一律写 `null`，由 costEstimator 标记 pricingMissing。
 *
 * 改动单价时：更新 PRICE_TABLE_VERSION，并用真实账单核对。
 *
 * 价格来源与口径（PRICE_TABLE_VERSION=2026-10-18）：
 * - DeepSeek 官方 api-docs.deepseek.com（CNY/百万 tokens）：下表用**空闲时段**价，高峰时段为 2×。
 *   现役模型 deepseek-flash / deepseek-v4-pro；deepseek-chat/deepseek-reasoner 为已退役别名
 *   （官方页注明旧名按 Flash 计价），此处将 deepseek-chat 按 flash 价近似。
 * - OpenAI 官方价（USD/百万 tokens，2026-10），按 **1 USD = 6.69 CNY**（2026-10-16 中间价）折算。
 * - 折算类数值随汇率波动，仅作估算；需精确请以账单为准。
 */

export const PRICE_TABLE_VERSION = '2026-10-18'

export const BILLING_MODELS = Object.freeze(['metered', 'plan', 'free'])
export const DEFAULT_BILLING_MODEL = 'metered'

export const PRICING_TABLE = Object.freeze({
  version: PRICE_TABLE_VERSION,
  currency: 'CNY',

  llm: Object.freeze({
    // 免费档（自托管/本地/测试替身）
    'mock:*': Object.freeze({ billingModel: 'free', inputPer1M: 0, outputPer1M: 0, cachedInputPer1M: 0 }),
    'opencode:*': Object.freeze({ billingModel: 'free', inputPer1M: 0, outputPer1M: 0, cachedInputPer1M: 0 }),
    // DeepSeek 官方（CNY，**下表为空闲价**；高峰时段 ×2，见 peakMultiplier）
    // inputPer1M=缓存未命中，cachedInputPer1M=缓存命中
    'deepseek:deepseek-flash': Object.freeze({ billingModel: 'metered', inputPer1M: 1, outputPer1M: 4, cachedInputPer1M: 0.02, peakMultiplier: 2 }),
    'deepseek:deepseek-v4-pro': Object.freeze({ billingModel: 'metered', inputPer1M: 4.5, outputPer1M: 13.5, cachedInputPer1M: 0.15, peakMultiplier: 2 }),
    // 退役别名（2026-07-24）：按官方说明近似为 flash 价
    'deepseek:deepseek-chat': Object.freeze({ billingModel: 'metered', inputPer1M: 1, outputPer1M: 4, cachedInputPer1M: 0.02, peakMultiplier: 2, note: 'retired alias ≈ flash' }),
    'deepseek:deepseek-reasoner': Object.freeze({ billingModel: 'metered', inputPer1M: null, outputPer1M: null, cachedInputPer1M: null, note: 'retired; 未核实' }),
    // 经 LiteLLM 网关暴露的模型（成本按底层模型折价，与 deepseek-flash 一致）
    'litellm:deepseek-flash': Object.freeze({ billingModel: 'metered', inputPer1M: 1, outputPer1M: 4, cachedInputPer1M: 0.02, peakMultiplier: 2 }),
    // OpenAI（USD 价 × 6.69 折 CNY）
    'openai:gpt-4o': Object.freeze({ billingModel: 'metered', inputPer1M: 16.725, outputPer1M: 66.9, cachedInputPer1M: 8.3625 }),
    'openai:gpt-4o-mini': Object.freeze({ billingModel: 'metered', inputPer1M: 1.0035, outputPer1M: 4.014, cachedInputPer1M: 0.5018 }),
    // 套餐制示例（火山方舟 Agent Plan 等）：月费 + 包含额度
    'volcengine:*': Object.freeze({
      billingModel: 'plan',
      planName: '火山方舟 Agent Plan',
      monthlyFeeCNY: null, // 待核实
      includedUnit: 'token',
      includedUnits: null, // 待核实：套餐包含 token 额度
      overflow: Object.freeze({ inputPer1M: null, outputPer1M: null }),
    }),
  }),

  image: Object.freeze({
    'mock:*': Object.freeze({ billingModel: 'free', perImage: 0 }),
    // 真实 OpenAI Images（按量，价待核实）
    'openai:*': Object.freeze({ billingModel: 'metered', perImage: null }),
    // 火山方舟 Agent Plan 端点上的 Seedream（套餐制；从 /api/plan 端点推断）
    'openai:doubao-seedream-5.0-pro': Object.freeze({
      billingModel: 'plan',
      planName: '火山方舟 Agent Plan',
      includedUnit: 'image',
      includedUnits: null,
      note: 'inferred from /api/plan endpoint',
    }),
  }),

  video: Object.freeze({
    'mock:*': Object.freeze({ billingModel: 'free', perSecond: 0 }),
    'comfyui:*': Object.freeze({ billingModel: 'free', perSecond: 0 }), // 自托管：仅耗电/算力
    'runway:*': Object.freeze({ billingModel: 'metered', perSecond: null }),
    'pika:*': Object.freeze({ billingModel: 'metered', perSecond: null }),
    // 火山方舟 Agent Plan 端点上的 Seedance（套餐制；从 /api/plan 端点推断）
    'seedance:doubao-seedance-2.5': Object.freeze({
      billingModel: 'plan',
      planName: '火山方舟 Agent Plan',
      includedUnit: 'second',
      includedUnits: null,
      note: 'inferred from /api/plan endpoint',
    }),
    'seedance:*': Object.freeze({ billingModel: 'metered', perSecond: null }),
    'minimax:*': Object.freeze({ billingModel: 'metered', perSecond: null }),
    'wan:*': Object.freeze({ billingModel: 'metered', perSecond: null }),
  }),

  tts: Object.freeze({
    'mock:*': Object.freeze({ billingModel: 'free', per1kChars: 0 }),
    'elevenlabs:*': Object.freeze({ billingModel: 'metered', per1kChars: null }),
    // 火山豆包语音（seed-tts-2.0）：含在 Agent Plan 内 → 套餐制，边际成本 0
    'volc:*': Object.freeze({ billingModel: 'plan', planName: '火山方舟 Agent Plan', includedUnit: 'char', includedUnits: null }),
  }),
})

/**
 * 查单价/计费条目：先精确匹配 `provider:model`，再退化为 `provider:*`，未命中返回 null。
 * @param {'llm'|'image'|'video'|'tts'} stage
 * @param {string} provider
 * @param {string|null} model
 * @param {object} [table]
 * @returns {object|null}
 */
export function lookupPrice(stage, provider, model, table = PRICING_TABLE) {
  const bucket = table?.[stage]
  if (!bucket || !provider) return null
  if (model) {
    const exact = bucket[`${provider}:${model}`]
    if (exact) return exact
  }
  return bucket[`${provider}:*`] || null
}

/** 取条目的计费模型（缺省为 metered，向后兼容）。 */
export function billingModelOf(entry) {
  return entry?.billingModel || DEFAULT_BILLING_MODEL
}

/**
 * 是否 DeepSeek 高峰时段（北京时间 周一至周五 9:00–12:00、14:00–18:00）。
 * 高峰价 = 空闲价 × peakMultiplier（2）。
 * 注：未排除中国法定节假日（无静态日历），节假日会被算作高峰（偏保守/略高估）。
 * @param {Date|number|string} [date]
 */
export function isDeepseekPeakTime(date = new Date()) {
  const t = date instanceof Date ? date : new Date(date)
  const bj = new Date(t.getTime() + 8 * 3600 * 1000) // 平移到北京时间，用 UTC 取值
  const day = bj.getUTCDay() // 0=周日 … 6=周六
  const mins = bj.getUTCHours() * 60 + bj.getUTCMinutes()
  const isWeekday = day >= 1 && day <= 5
  const inMorning = mins >= 9 * 60 && mins < 12 * 60
  const inAfternoon = mins >= 14 * 60 && mins < 18 * 60
  return isWeekday && (inMorning || inAfternoon)
}

export default PRICING_TABLE
