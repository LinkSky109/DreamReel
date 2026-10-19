/**
 * 指标聚合与对比（Phase 0）
 *
 * 纯聚合逻辑（可注入 records 单测） + 基于 metricsStore 的查询门面。
 * 供 routes/providerMetrics.js 的三个接口使用：metrics / compare / costs。
 */

import { readInvocationMetrics } from './metricsStore.js'

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function round(n, dp = 6) {
  if (!isNum(n)) return null
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/** 最近秩百分位（p 为 0-100）；空数组返回 null。 */
export function percentile(values, p) {
  const arr = (values || []).filter(isNum)
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const rank = Math.ceil((p / 100) * sorted.length) - 1
  const idx = Math.min(Math.max(rank, 0), sorted.length - 1)
  return sorted[idx]
}

function groupKey(record, groupBy) {
  switch (groupBy) {
    case 'model':
      return `${record.provider ?? '?'}:${record.model ?? '?'}`
    case 'taskType':
      return record.taskType || 'unknown'
    case 'project':
      return record.projectId || 'none'
    case 'user':
      return record.userId || 'none'
    case 'day':
      return String(record.ts || '').slice(0, 10)
    default:
      return record.provider || 'unknown'
  }
}

/** 对一组记录做汇总。 */
export function summarize(records) {
  const items = records || []
  const calls = items.length
  const successes = items.filter((i) => i.success).length
  const latencies = items.map((i) => i.latencyMs).filter(isNum)
  const tokens = items.map((i) => i.totalTokens).filter(isNum)
  const cached = items.map((i) => i.cachedTokens).filter(isNum)
  const prompt = items.map((i) => i.promptTokens).filter(isNum)
  const costs = items.map((i) => i.costEstimate).filter(isNum)

  const sumTokens = tokens.reduce((a, b) => a + b, 0)
  const sumCached = cached.reduce((a, b) => a + b, 0)
  const sumPrompt = prompt.reduce((a, b) => a + b, 0)

  return {
    calls,
    successes,
    successRate: calls ? round(successes / calls, 4) : null,
    fallbackCalls: items.filter((i) => i.isFallback).length,
    p50LatencyMs: percentile(latencies, 50),
    p95LatencyMs: percentile(latencies, 95),
    totalTokens: tokens.length ? sumTokens : null,
    avgTokens: tokens.length ? round(sumTokens / tokens.length, 2) : null,
    cachedTokenRatio: prompt.length && sumPrompt > 0 ? round(sumCached / sumPrompt, 4) : null,
    costEstimate: costs.length ? round(costs.reduce((a, b) => a + b, 0)) : null,
    pricingMissingCalls: items.filter((i) => i.pricingMissing).length,
  }
}

/**
 * 按维度分组汇总。
 * @param {object[]} records
 * @param {'provider'|'model'|'taskType'|'project'|'user'|'day'} [groupBy]
 */
export function aggregate(records, groupBy = 'provider') {
  const groups = new Map()
  for (const r of records || []) {
    const key = groupKey(r, groupBy)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(r)
  }
  return [...groups.entries()]
    .map(([key, items]) => ({
      key,
      groupBy,
      provider: items[0]?.provider ?? null,
      model: items[0]?.model ?? null,
      taskType: items[0]?.taskType ?? null,
      ...summarize(items),
    }))
    .sort((a, b) => b.calls - a.calls)
}

/**
 * 查询并聚合。
 * @param {object} filters 见 metricsStore.readInvocationMetrics
 * @param {{groupBy?:string}} [opts]
 */
export function queryMetrics(filters = {}, opts = {}) {
  const records = readInvocationMetrics(filters)
  const groupBy = opts.groupBy || null
  return {
    totals: summarize(records),
    groups: groupBy ? aggregate(records, groupBy) : [],
    count: records.length,
  }
}

/**
 * 多模型并排对比（同一 stage 下）。
 * @param {{stage?:string, models?:string[], from?:string, to?:string, taskType?:string}} input
 * @returns {object[]}
 */
export function compareModels(input = {}) {
  const { stage, models, from, to, taskType } = input
  const records = readInvocationMetrics({ stage, from, to, taskType })
  const wanted = Array.isArray(models) && models.length ? new Set(models) : null

  const byModel = new Map()
  for (const r of records) {
    const key = `${r.provider ?? '?'}:${r.model ?? '?'}`
    if (wanted && !wanted.has(key)) continue
    if (!byModel.has(key)) byModel.set(key, [])
    byModel.get(key).push(r)
  }
  return [...byModel.entries()]
    .map(([key, items]) => ({
      key,
      provider: items[0]?.provider ?? null,
      model: items[0]?.model ?? null,
      ...summarize(items),
    }))
    .sort((a, b) => b.calls - a.calls)
}

/**
 * 成本汇总（含未录单价提示）。
 */
export function costSummary(filters = {}, opts = {}) {
  const records = readInvocationMetrics(filters)
  return {
    totals: summarize(records),
    groups: opts.groupBy ? aggregate(records, opts.groupBy) : [],
  }
}

export default { percentile, summarize, aggregate, queryMetrics, compareModels, costSummary }
