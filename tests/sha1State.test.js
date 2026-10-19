import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import { sha1Init, sha1Update, sha1Finalize, hashContextBase64 } from '../src/utils/sha1State.js'

function sha1(buf) {
  return crypto.createHash('sha1').update(buf).digest('hex')
}

describe('SHA1 增量状态（x-oss-hash-ctx）', () => {
  it('空数据与标准空串一致', () => {
    assert.equal(sha1Finalize(sha1Init()), sha1(Buffer.alloc(0)))
  })

  it('整 64 字节块前缀：继续吃完剩余部分等于整段 digest', () => {
    for (const prefixLen of [64, 128, 4 * 1024 * 1024]) {
      const data = crypto.randomBytes(prefixLen + 12345)
      let st = sha1Init()
      st = sha1Update(st, data.subarray(0, prefixLen))
      st = sha1Update(st, data.subarray(prefixLen))
      assert.equal(sha1Finalize(st), sha1(data), `prefixLen=${prefixLen}`)
    }
  })

  it('分多次喂入（含非 64 对齐尾部）仍一致', () => {
    const data = crypto.randomBytes(200000)
    let st = sha1Init()
    for (let i = 0; i < data.length; i += 7777) st = sha1Update(st, data.subarray(i, i + 7777))
    assert.equal(sha1Finalize(st), sha1(data))
  })

  it('hash ctx：base64 JSON 字段完整、h 为无符号、Nl 为比特数', () => {
    const data = crypto.randomBytes(4 * 1024 * 1024)
    const st = sha1Update(sha1Init(), data)
    const ctx = JSON.parse(Buffer.from(hashContextBase64(st), 'base64').toString('utf8'))
    assert.equal(ctx.hash_type, 'sha1')
    for (const k of ['h0', 'h1', 'h2', 'h3', 'h4']) {
      const v = Number(ctx[k])
      assert.ok(v >= 0 && v <= 0xffffffff, `${k} 应在 uint32 范围`)
    }
    assert.equal(Number(ctx.Nl), data.length * 8)
    assert.equal(ctx.Nh, '0')
    assert.equal(ctx.num, '0')
    assert.equal(ctx.data, '')
  })
})
