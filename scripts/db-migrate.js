#!/usr/bin/env node
/**
 * 数据库迁移 CLI：
 *   node scripts/db-migrate.js            # 执行挂起的迁移
 *   node scripts/db-migrate.js --dry-run  # 只列出将执行的迁移
 *   node scripts/db-migrate.js --status   # 查看已应用/待执行
 */
import 'dotenv/config'
import { migrate, status } from '../src/db/migrate.js'

const args = new Set(process.argv.slice(2))

try {
  if (args.has('--status')) {
    const result = await status()
    console.log('applied:', result.applied.map((x) => x.version).join(', ') || '(none)')
    console.log('pending:', result.pending.join(', ') || '(none)')
  } else {
    const dryRun = args.has('--dry-run')
    const result = await migrate({ dryRun })
    if (dryRun) {
      console.log('dry-run, would apply:', result.pending.join(', ') || '(none)')
    } else {
      console.log('applied:', result.applied.join(', ') || '(none)')
    }
  }
} catch (error) {
  console.error('[db:migrate]', error.message)
  process.exit(1)
}
