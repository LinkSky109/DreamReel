/**
 * 成本折算（Phase 0）
 *
 * 按各 stage 的「真实计费单位」把用量折算成金额，而不是一律用 token。
 * - text : input/output token（缓存命中部分按 cachedInputPer1M）
 * - image: 张（perImage 可为数字，或按尺寸的映射）
 * - video: 秒（perSecond × 时长）
 * - tts  : 千字符（per1kChars × 字符数 / 1000）
 *
 * 返回语义：
 * - `pricingMissing=true`：单价表里没有该 provider:model 的条目（**没价**）。
 * - `costEstimate=null` 且 `pricingMissing=false`：有价格但**用量缺失/单价字段为 null**，算不出来。
 * - 金额统一 CNY，冗余 priceTableVersion 便于日后重算历史成本。
 */

import { PRICING_TABLE, lookupPrice, billingModelOf, DEFAULT_BILLING_MODEL, isDeepseekPeakTime } from '../config/modelPricing.js'

const MICRO = 1e6

// 内部 stage 名 → 单价表桶名（文本阶段的桶沿用 'llm'，与设计文档 §4.3 一致）
const PRICING_BUCKET = { text: 'llm', image: 'image', video: 'video', tts: 'tts' }

function bucketFor(stage) {
  return PRICING_BUCKET[stage] || stage
}

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function round(n, dp = 6) {
  if (!isNum(n)) return null
  const f = 10 ** dp
  return Math.round(n * f) / f
}

function textCost(price, usage) {
  if (!isNum(price.inputPer1M) || !isNum(price.outputPer1M)) return null
  const promptTokens = usage?.promptTokens
  const completionTokens = usage?.completionTokens
  if (!isNum(promptTokens) && !isNum(completionTokens)) return null

  const cachedTokens = isNum(usage?.cachedTokens) ? usage.cachedTokens : 0
  const billableInput = isNum(promptTokens) ? Math.max(0, promptTokens - cachedTokens) : 0
  const cachedRate = isNum(price.cachedInputPer1M) ? price.cachedInputPer1M : price.inputPer1M

  const cost =
    (billableInput / MICRO) * price.inputPer1M +
    (cachedTokens / MICRO) * cachedRate +
    ((isNum(completionTokens) ? completionTokens : 0) / MICRO) * price.outputPer1M
  return round(cost)
}

function imageCost(price, ctx) {
  const count = isNum(ctx?.unitCount) ? ctx.unitCount : 1
  const per = price.perImage
  if (isNum(per)) return round(per * count)
  if (per && typeof per === 'object') {
    const size = ctx?.size
    const unit = isNum(per[size]) ? per[size] : isNum(per.default) ? per.default : null
    return unit === null ? null : round(unit * count)
  }
  return null
}

function videoCost(price, usage, ctx) {
  const perSecond = price.perSecond
  if (!isNum(perSecond)) return null
  const seconds = isNum(ctx?.durationSeconds) ? ctx.durationSeconds : usage?.unitCount
  if (!isNum(seconds)) return null
  return round(perSecond * seconds)
}

function ttsCost(price, usage, ctx) {
  const per1k = price.per1kChars
  if (!isNum(per1k)) return null
  const chars = isNum(ctx?.charCount) ? ctx.charCount : usage?.unitCount
  if (!isNum(chars)) return null
  return round((per1k * chars) / 1000)
}

/**
 * @param {'text'|'image'|'video'|'tts'} stage
 * @param {{provider:string, model?:string|null, usage?:object|null, ctx?:object, table?:object}} input
 * @returns {{costEstimate:number|null, pricingMissing:boolean, currency:string|null, priceTableVersion:string|null, billingModel:string, planName:string|null}}
 */
export function estimateCost(stage, input = {}) {
  const { provider, model = null, usage = null, ctx = {}, table = PRICING_TABLE } = input
  const meta = {
    currency: table?.currency ?? null,
    priceTableVersion: table?.version ?? null,
  }

  const price = lookupPrice(bucketFor(stage), provider, model, table)
  if (!price) {
    return {
      ...meta,
      costEstimate: null,
      pricingMissing: true,
      billingModel: DEFAULT_BILLING_MODEL,
      planName: null,
    }
  }

  const billingModel = billingModelOf(price)

  // 套餐/免费：单次调用边际成本记 0；用量仍由调用方记录。
  if (billingModel === 'free') {
    return { ...meta, costEstimate: 0, pricingMissing: false, billingModel, planName: price.planName ?? null }
  }
  if (billingModel === 'plan') {
    return { ...meta, costEstimate: 0, pricingMissing: false, billingModel, planName: price.planName ?? null }
  }

  // metered：按各 stage 真实计费单位折算
  let cost = null
  if (stage === 'text') cost = textCost(price, usage)
  else if (stage === 'image') cost = imageCost(price, ctx)
  else if (stage === 'video') cost = videoCost(price, usage, ctx)
  else if (stage === 'tts') cost = ttsCost(price, usage, ctx)

  // 分时价（DeepSeek）：高峰时段 ×peakMultiplier（默认以当前时间判定；可传 ctx.at 覆盖）
  if (isNum(cost) && isNum(price.peakMultiplier)) {
    const at = ctx?.at ?? Date.now()
    if (isDeepseekPeakTime(at)) cost = round(cost * price.peakMultiplier)
  }

  return { ...meta, costEstimate: cost, pricingMissing: false, billingModel, planName: price.planName ?? null }
}

export default estimateCost
