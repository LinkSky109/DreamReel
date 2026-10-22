import { after } from 'node:test'
import { closeDb } from '../../src/db/client.js'

/**
 * 测试文件用 PG 收尾：关闭连接池。
 * 不关闭时 pg 的 idleTimeout（30s）会让测试进程多存活半分钟。
 */
after(async () => {
  await closeDb().catch(() => {})
})
