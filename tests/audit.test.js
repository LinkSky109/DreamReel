import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { writeAudit, verifyAuditChain } from '../src/services/auditLogService.js'
import { getPool, closeDb } from '../src/db/client.js'

const DATABASE_URL = process.env.DATABASE_URL

describe('审计日志哈希链', { skip: !DATABASE_URL && '未配置 DATABASE_URL' }, () => {
  const orgId = `org_audit_${Date.now()}`

  after(async () => {
    await getPool().query('DELETE FROM audit_logs WHERE org_id = $1', [orgId])
    await closeDb()
  })

  it('写入后可校验，篡改后能定位', async () => {
    for (let i = 0; i < 3; i += 1) {
      const r = await writeAudit({
        orgId,
        actorId: 'u1',
        action: `POST /api/test/${i}`,
        resourceType: 'test',
        resourceId: String(i),
        requestId: `req-${i}`,
        metadata: { i },
      })
      assert.equal(r.ok, true)
    }
    const ok = await verifyAuditChain(orgId)
    assert.equal(ok.ok, true)
    assert.equal(ok.count, 3)

    await getPool().query(
      "UPDATE audit_logs SET action = 'TAMPERED' WHERE org_id = $1 AND resource_id = '1'",
      [orgId]
    )
    const broken = await verifyAuditChain(orgId)
    assert.equal(broken.ok, false)
    assert.ok(broken.brokenAt)
  })
})
