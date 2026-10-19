/**
 * 批量出图控制（进程内）。
 *
 * 用于「设定图集 / 本季资产」等长时间批量任务：
 * - 客户端分批调用，服务端在每张图开始前检查取消标志；
 * - 取消后不再启动新的生成，正在生成的少量任务会自然结束；
 * - 新的批量任务需显式 reset（客户端首次调用传 reset=true）。
 */
const runs = new Map()

export function beginRun(novelId, meta = {}) {
  const run = {
    novelId,
    cancelled: false,
    running: true,
    startedAt: new Date().toISOString(),
    cancelledAt: null,
    lastError: null,
    ...meta,
  }
  runs.set(novelId, run)
  return run
}

export function cancelRun(novelId) {
  const run = runs.get(novelId) || { novelId, startedAt: null }
  run.cancelled = true
  run.running = false
  run.cancelledAt = new Date().toISOString()
  runs.set(novelId, run)
  return run
}

export function isCancelled(novelId) {
  const run = runs.get(novelId)
  return Boolean(run && run.cancelled)
}

export function finishRun(novelId, { ok = 0, failed = 0 } = {}) {
  const run = runs.get(novelId)
  if (!run) return null
  run.running = false
  run.ok = ok
  run.failed = failed
  run.finishedAt = new Date().toISOString()
  return run
}

export function getRunStatus(novelId) {
  return runs.get(novelId) || { novelId, cancelled: false, running: false, startedAt: null }
}

export default { beginRun, cancelRun, isCancelled, finishRun, getRunStatus }
