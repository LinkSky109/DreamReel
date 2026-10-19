/**
 * 调用指标埋点（Phase 0 接入层）
 *
 * `instrumentProvider(provider, meta)`：用 Proxy 包装 provider 的公开生成方法，
 * 自动记录调用指标（耗时/用量/成本/成败）。用于 LLM / 图片 / TTS 三个阶段的工厂。
 *
 * 关键设计：
 * - **不重复计数**：内部方法（如 generateJSON → this.generate）以原始对象为 this 调用，
 *   不经过 Proxy，故只记最外层一次；另有 depth 兜底。
 * - **best-effort**：记录失败只告警，绝不影响业务调用。
 * - stage 用内部名：text / image / video / tts（与 costEstimator 对齐）。
 */

import { recordInvocation } from './metricsRecorder.js'
import { normalizeUsage } from './usageNormalizer.js'
import { estimateCost } from './costEstimator.js'
import logger from '../utils/logger.js'

const INSTRUMENTED = ['generate', 'generateJSON', 'generateImage', 'synthesize']

/** 从入参推断计量（图片=张数；TTS=字符数） */
function deriveCtx(stage, args) {
  const a = args?.[0] || {}
  if (stage === 'tts') return { unitCount: typeof a.text === 'string' ? a.text.length : null }
  if (stage === 'image') return { unitCount: Number.isFinite(a.n) ? a.n : 1 }
  return {}
}

function classify(error) {
  const msg = String(error?.message || '')
  if (error?.name === 'AbortError' || /timeout|timed out/i.test(msg)) return 'timeout'
  if (/429|rate limit/i.test(msg)) return 'rate_limit'
  if (/401|403|unauthor/i.test(msg)) return 'auth'
  if (/\b5\d\d\b/.test(msg)) return 'server'
  if (/parse|JSON/i.test(msg)) return 'parse'
  if (/(network|fetch failed|ECONN|ENOTFOUND|socket)/i.test(msg)) return 'network'
  return 'unknown'
}

function safeRecord(meta, provider, result, latencyMs, success, error) {
  try {
    const stage = meta.stage
    const providerName = meta.provider || provider?.name || null
    const model = meta.model || provider?.model || null
    const ctx = { at: Date.now(), ...deriveCtx(stage, meta._args) }
    const usage = normalizeUsage(stage, result?.usage || null, ctx)
    const cost = estimateCost(stage, { provider: providerName, model, usage, ctx })
    recordInvocation({
      stage,
      taskType: meta.taskType ?? null,
      provider: providerName,
      model,
      requestId: meta.requestId ?? null,
      attempt: Number.isFinite(meta.attempt) ? meta.attempt : 1,
      isFallback: meta.isFallback ?? (Number.isFinite(meta.attempt) ? meta.attempt > 1 : false),
      projectId: meta.projectId ?? null,
      userId: meta.userId ?? null,
      success,
      errorClass: success ? null : classify(error),
      errorMessage: success ? null : error?.message,
      latencyMs,
      ...usage,
      ...cost,
    })
  } catch (e) {
    logger.warn(`指标记录失败（忽略，不影响调用）: ${e.message}`)
  }
}

/**
 * 包装 provider，自动埋点。
 * @param {object} provider
 * @param {{stage:string, provider?:string, model?:string, taskType?:string, projectId?:string|null, userId?:string|null}} meta
 */
export function instrumentProvider(provider, meta = {}) {
  if (!provider || typeof provider !== 'object') return provider
  let depth = 0
  return new Proxy(provider, {
    get(target, prop, receiver) {
      const orig = Reflect.get(target, prop, receiver)
      if (typeof orig !== 'function' || !INSTRUMENTED.includes(prop)) return orig
      return async function (...args) {
        const top = depth === 0
        depth += 1
        const started = Date.now()
        try {
          const res = await orig.apply(target, args) // 以原始对象为 this → 内部调用不再经过 Proxy
          if (top) safeRecord({ ...meta, _args: args }, target, res, Date.now() - started, true, null)
          return res
        } catch (err) {
          if (top) safeRecord({ ...meta, _args: args }, target, null, Date.now() - started, false, err)
          throw err
        } finally {
          depth -= 1
        }
      }
    },
  })
}

/**
 * 记录一次「非生成方法」的调用结果（如 video 阶段由 service 在终态调用）。
 * @param {{stage:string, provider:string, model?:string, taskType?:string, projectId?:string|null, userId?:string|null}} meta
 * @param {{success:boolean, latencyMs:number, error?:string|null, errorClass?:string|null, ctx?:object}} outcome
 */
export function recordOutcome(meta, outcome = {}) {
  try {
    const stage = meta.stage
    const ctx = { at: Date.now(), ...(outcome.ctx || {}) }
    // normalizeUsage 用 unitCount；costEstimator 用各阶段专属字段（video=durationSeconds, tts=charCount）
    const usageCtx = { unitCount: ctx.unitCount ?? ctx.durationSeconds ?? ctx.charCount ?? null }
    const usage = normalizeUsage(stage, null, usageCtx)
    const cost = estimateCost(stage, { provider: meta.provider, model: meta.model, usage, ctx })
    recordInvocation({
      stage,
      taskType: meta.taskType ?? null,
      provider: meta.provider,
      model: meta.model ?? null,
      projectId: meta.projectId ?? null,
      userId: meta.userId ?? null,
      success: outcome.success,
      errorClass: outcome.success ? null : outcome.errorClass ?? null,
      errorMessage: outcome.success ? null : outcome.error ?? null,
      latencyMs: outcome.latencyMs ?? null,
      ...usage,
      ...cost,
    })
  } catch (e) {
    logger.warn(`指标记录失败（忽略）: ${e.message}`)
  }
}

/**
 * 执行一次带埋点的 provider 调用（记录成功/失败）。
 * 供执行级回退链按 attempt / requestId 逐次记录。
 * @param {object} provider 原始（未包装）provider
 * @param {string} method 方法名
 * @param {any[]} args
 * @param {object} meta 含 stage/attempt/isFallback/requestId/deadlineMs 等
 */
export async function performCall(provider, method, args, meta = {}) {
  const started = Date.now()
  const invoke = () => provider[method](...args)
  try {
    let res
    if (Number.isFinite(meta.deadlineMs) && meta.deadlineMs > 0) {
      res = await raceTimeout(invoke(), meta.deadlineMs, method)
    } else {
      res = await invoke()
    }
    safeRecord({ ...meta, _args: args }, provider, res, Date.now() - started, true, null)
    return res
  } catch (error) {
    safeRecord({ ...meta, _args: args }, provider, null, Date.now() - started, false, error)
    throw error
  }
}

/** 软 deadline：超时即失败（底层请求可能仍在跑，视为放弃） */
function raceTimeout(promise, ms, label) {
  promise.catch(() => {}) // 吞掉迟到 rejection，避免 unhandledRejection
  let timer
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} attempt timeout after ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export default { instrumentProvider, recordOutcome, performCall }