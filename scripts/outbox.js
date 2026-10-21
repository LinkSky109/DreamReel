#!/usr/bin/env node
/**
 * outbox 运维：
 *   node scripts/outbox.js --stats
 *   node scripts/outbox.js --stats --group        # 同时按 org 分组
 *   node scripts/outbox.js --run-once
 *   node scripts/outbox.js --retry-dead [--org id]
 */
import 'dotenv/config'
import { stats, getOutboxPool } from '../src/services/outboxStore.js'
import { runOutboxOnce } from '../src/workers/outboxWorker.js'

const args = new Set(process.argv.slice(2))
const orgIndex = process.argv.indexOf('--org')
const orgId = orgIndex >= 0 ? process.argv[orgIndex + 1] : null

try {
  if (args.has('--stats')) {
    console.log(await stats({ group: args.has('--group') }))
  } else if (args.has('--run-once')) {
    console.log(await runOutboxOnce({ workerId: 'cli' }))
  } else if (args.has('--retry-dead')) {
    const pool = await getOutboxPool()
    const params = []
    let where = `status = 'dead'`
    if (orgId) {
      params.push(orgId)
      where += ` AND org_id = $1`
    }
    const { rowCount } = await pool.query(
      `UPDATE outbox_events
         SET status = 'pending', attempts = 0, available_at = now(), updated_at = now()
       WHERE ${where}`,
      params
    )
    console.log('retried', rowCount)
  } else {
    console.log('usage: --stats [--group] | --run-once | --retry-dead [--org id]')
  }
} catch (error) {
  console.error('[outbox]', error.message)
  process.exit(1)
} finally {
  const { closeDb } = await import('../src/db/client.js')
  await closeDb().catch(() => {})
}
