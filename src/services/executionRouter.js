/**
 * 执行级回退（Phase 1）
 *
 * `composeWithFallback(instances, baseMeta)`：
 * - 传入**原始（未包装）provider 实例**数组，按顺序调用；
 * - 每次逻辑调用生成一个 `requestId`，串起该次的所有尝试（attempt / isFallback）；
 * - 每次尝试各自埋点（含失败），可切换的错误（见 shouldSwitch）才继续下一个；
 * - 可选 `baseMeta.deadlineMs`：单次尝试软超时（防主 provider 挂起拖住回退）。
 *
 * 单实例时退化为 `instrumentProvider`（与无回退行为一致）。
 */

import { randomUUID } from 'crypto'
import { instrumentProvider, performCall } from './withMetrics.js'

/** 是否应在失败时切换到下一个 provider */
export function shouldSwitch(error) {
  const msg = String(error?.message || '')
  if (error?.name === 'AbortError' || /timeout|timed out|超时/i.test(msg)) return true
  if (/429|rate ?limit|too many requests/i.test(msg)) return true
  if (/401|403|unauthor|invalid api key/i.test(msg)) return true
  if (/\b5\d\d\b/.test(msg)) return true
  if (/(network|fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|socket|connect)/i.test(msg)) return true
  // 明确的客户端错误（400/422）：请求本身有问题，换谁都一样 → 不切换
  if (/\b(400|422)\b/.test(msg)) return false
  return true // 未知错误默认切换（保守：宁可多试一次）
}

/**
 * @param {object[]} instances 原始 provider 实例，顺序 [primary, fallback1, ...]
 * @param {{stage:string, projectId?:string|null, userId?:string|null, taskType?:string|null, deadlineMs?:number}} baseMeta
 * @param {string[]} [methods] 需要回退包装的方法名（其余属性透传主实例）
 */
export function composeWithFallback(instances, baseMeta = {}, methods = ['generate', 'generateJSON']) {
  if (!Array.isArray(instances) || instances.length === 0) {
    throw new Error('composeWithFallback: instances 不能为空')
  }
  if (instances.length === 1) {
    return instrumentProvider(instances[0], baseMeta)
  }

  const primary = instances[0]
  const call = async (method, args) => {
    const requestId = baseMeta.requestId || randomUUID()
    let lastError
    for (let i = 0; i < instances.length; i++) {
      const meta = { ...baseMeta, requestId, attempt: i + 1, isFallback: i > 0 }
      try {
        return await performCall(instances[i], method, args, meta)
      } catch (error) {
        lastError = error
        if (!shouldSwitch(error)) throw error
      }
    }
    throw lastError
  }

  const overrides = { isComposite: true, fallbackCount: instances.length - 1 }
  for (const m of methods) {
    overrides[m] = (...args) => call(m, args)
  }

  return new Proxy(primary, {
    get(target, prop) {
      if (prop in overrides) return overrides[prop]
      const value = Reflect.get(target, prop)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

export default { shouldSwitch, composeWithFallback }
