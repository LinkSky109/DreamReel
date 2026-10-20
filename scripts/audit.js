#!/usr/bin/env node
/**
 * 审计运维：
 *   node scripts/audit.js --verify [orgId]
 */
import 'dotenv/config'
import { verifyAuditChain } from '../src/services/auditLogService.js'

const args = process.argv.slice(2)
const orgId = args.find((a) => !a.startsWith('--')) || 'default'

try {
  if (args.includes('--verify')) {
    const result = await verifyAuditChain(orgId)
    console.log(result)
    if (!result.ok) process.exitCode = 1
  } else {
    console.log('usage: --verify [orgId]')
  }
} catch (error) {
  console.error('[audit]', error.message)
  process.exit(1)
} finally {
  const { closeDb } = await import('../src/db/client.js')
  await closeDb().catch(() => {})
}
