import config from '../config/index.js'
import logger from '../utils/logger.js'
import { claimBatch, markDone, markFailed, resetStale, getOutboxPool } from '../services/outboxStore.js'

/**
 * outbox worker：claim → apply → mark。
 * 事件应用必须幂等；失败按指数退避重试，超过上限进入 dead。
 *
 * 小说域已改为直接写 PostgreSQL，不再产生 outbox 事件；
 * 这里只保留通用/其它域事件的分发点。
 */
export async function applyEvent(_pool, event) {
  throw new Error(`未知操作：${event.kind}/${event.op}`)
}

export async function runOutboxOnce({ limit = config.outbox.batchSize, workerId = 'outbox-worker' } = {}) {
  await resetStale()
  const events = await claimBatch(limit, workerId)
  if (!events.length) return { claimed: 0, ok: 0, failed: 0 }
  const pool = await getOutboxPool()
  let ok = 0
  let failed = 0
  for (const event of events) {
    try {
      await applyEvent(pool, event)
      await markDone(event.id)
      ok += 1
    } catch (error) {
      failed += 1
      const result = await markFailed(event.id, error.message)
      logger.warn('[outbox] 事件处理失败', {
        id: event.id,
        kind: event.kind,
        op: event.op,
        attempts: result.attempts,
        status: result.status,
        message: error.message,
      })
    }
  }
  return { claimed: events.length, ok, failed }
}

export function startOutboxWorker({ intervalMs = config.outbox.intervalMs, limit = config.outbox.batchSize } = {}) {
  let running = false
  let stopped = false
  const tick = async () => {
    if (running || stopped) return
    running = true
    try {
      const result = await runOutboxOnce({ limit })
      if (result.claimed) logger.info('[outbox] batch', result)
    } catch (error) {
      logger.warn('[outbox] worker tick 失败', { message: error.message })
    } finally {
      running = false
    }
  }
  const timer = setInterval(tick, intervalMs)
  timer.unref?.()
  void tick()
  return {
    stop() {
      stopped = true
      clearInterval(timer)
    },
  }
}
