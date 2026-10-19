/**
 * 调用指标构造与记录（Phase 0）
 *
 * 提供纯函数 `buildInvocationMetric`（便于单测）与 `recordInvocation`（构造 + 落盘）。
 * 注意：本阶段**不含任何调用点接线**——接线由后续阶段在 executionRouter / 调用方完成。
 */

import { randomUUID } from 'crypto'
import { appendInvocationMetric } from './metricsStore.js'

const MAX_ERROR_LEN = 300

function truncate(value, len) {
  if (typeof value !== 'string') return null
  return value.length > len ? `${value.slice(0, len)}…` : value
}

/**
 * 构造一条规范化的调用指标（字段契约见设计文档 §4.2）。
 * @param {object} partial
 * @returns {object}
 */
export function buildInvocationMetric(partial = {}) {
  const attempt = Number.isFinite(partial.attempt) ? partial.attempt : 1
  return {
    id: partial.id || randomUUID(),
    ts: partial.ts || new Date().toISOString(),
    requestId: partial.requestId ?? null,
    attempt,
    isFallback: partial.isFallback ?? attempt > 1,
    routeRuleId: partial.routeRuleId ?? null,
    scope: partial.scope || 'legacy',

    stage: partial.stage ?? null,
    taskType: partial.taskType ?? null,
    projectId: partial.projectId ?? null,
    userId: partial.userId ?? null,
    novelId: partial.novelId ?? null,

    provider: partial.provider ?? null,
    model: partial.model ?? null,

    success: partial.success ?? false,
    errorClass: partial.errorClass ?? null,
    httpStatus: partial.httpStatus ?? null,
    errorMessage: truncate(partial.errorMessage, MAX_ERROR_LEN),

    latencyMs: Number.isFinite(partial.latencyMs) ? partial.latencyMs : null,
    latencyBreakdownMs: partial.latencyBreakdownMs ?? null,

    unit: partial.unit ?? null,
    unitCount: partial.unitCount ?? null,
    promptTokens: partial.promptTokens ?? null,
    completionTokens: partial.completionTokens ?? null,
    totalTokens: partial.totalTokens ?? null,
    cachedTokens: partial.cachedTokens ?? null,
    cacheHit: partial.cacheHit ?? null,

    currency: partial.currency ?? null,
    billingModel: partial.billingModel ?? null,
    planId: partial.planId ?? null,
    planName: partial.planName ?? null,
    costEstimate: partial.costEstimate ?? null,
    pricingMissing: partial.pricingMissing ?? false,
    priceTableVersion: partial.priceTableVersion ?? null,

    quality: partial.quality ?? null,
  }
}

/**
 * 构造并落盘一条调用指标。
 * @param {object} partial
 * @returns {object} 记录下来的 metric
 */
export function recordInvocation(partial = {}) {
  const metric = buildInvocationMetric(partial)
  appendInvocationMetric(metric)
  return metric
}

export default { buildInvocationMetric, recordInvocation }
