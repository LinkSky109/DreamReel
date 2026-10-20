#!/usr/bin/env node
/**
 * outbox 运维：
 *   node scripts/outbox.js --stats
 *   node scripts/outbox.js --run-once
 *   node scripts/outbox.js --retry-dead
 */
import 'dotenv/config'
import { stats, getOutboxPool } from '../src/services/outboxStore.js'
import { runOutboxOnce } from '../src/workers/outboxWorker.js'

const args = new Set(process.argv.slice(2))

try {
  if (args.has('--stats')) {
    console.log(await stats())
  } else if (args.has('--run-once')) {
    console.log(await runOutboxOnce({ workerId: 'cli' }))
  } else if (args.has('--retry-dead')) {
    const pool = await getOutboxPool()
    const { rowCount } = await pool.query(
      `UPDATE outbox_events
         SET status = 'pending', attempts = 0, available_at = now(), updated_at = now()
       WHERE status = 'dead'`
    )
    console.log('retried', rowCount)
  } else {
    console.log('usage: --stats | --run-once | --retry-dead')
  }
} catch (error) {
  console.error('[outbox]', error.message)
  process.exit(1)
} finally {
  const { closeDb } = await import('../src/db/client.js')
  await closeDb().catch(() => {})
}
