import config from '../config/index.js'
import logger from '../utils/logger.js'
import { claimBatch, markDone, markFailed, resetStale, getOutboxPool } from '../services/outboxStore.js'
import { applyNovelUpsert, applyNovelDelete } from '../services/novelWriteSync.js'
import {
  applyChildUpsert,
  applyChildDelete,
  applyChildDeleteByNovel,
  applyChildDeleteStates,
} from '../services/novelChildWriteSync.js'

/**
 * outbox worker：claim → apply → mark。
 * 事件应用必须幂等；失败按指数退避重试，超过上限进入 dead。
 */
export async function applyEvent(pool, event) {
  const orgId = event.org_id
  const payload = event.payload || {}
  if (event.kind === 'novel') {
    if (event.op === 'upsert') return applyNovelUpsert(pool, payload, orgId)
    if (event.op === 'delete') return applyNovelDelete(pool, payload.id, orgId)
    throw new Error(`未知 novel 操作：${event.op}`)
  }
  if (event.op === 'upsert') return applyChildUpsert(pool, event.kind, payload, orgId)
  if (event.op === 'delete') return applyChildDelete(pool, event.kind, payload.id, orgId)
  if (event.op === 'deleteByNovel') return applyChildDeleteByNovel(pool, event.kind, payload.novelId, orgId)
  if (event.op === 'deleteStates') {
    return applyChildDeleteStates(pool, payload.novelId, orgId, payload.characterId, payload.episodeNo)
  }
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
