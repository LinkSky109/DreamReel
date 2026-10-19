import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { encodeQr, renderTerminal, matrixToString } from '../src/utils/qrcode.js'
import { QR_FIXTURES } from './qrcode.fixtures.js'

/**
 * QR 编码器对齐验证：fixtures 由 python-qrcode（参考实现，字节模式）生成，
 * 逐模块比对，确保矩阵（含版本选择与最佳掩码选择）完全一致。
 */
describe('QR 编码器（对齐 python-qrcode 参考实现）', () => {
  it('短文本（v1, ECC M）矩阵逐模块一致', () => {
    const got = matrixToString(encodeQr('HELLO', { ec: 'M' }).modules)
    assert.equal(got, QR_FIXTURES.hello_m)
  })

  it('夸克扫码 URL（长文本）矩阵逐模块一致', () => {
    const url = 'https://su.quark.cn/4_eMHBJ?token=sta326333eeq7tej104td3iwpwnz63il&client_id=532&ssb=weblogin'
    const qr = encodeQr(url, { ec: 'M' })
    assert.equal(matrixToString(qr.modules), QR_FIXTURES.url_m)
    assert.equal(qr.size, QR_FIXTURES.url_m.split('\n').length)
  })

  it('终端渲染：尺寸与静默区正确', () => {
    const qr = encodeQr('HELLO', { ec: 'M' })
    const lines = renderTerminal(qr.modules, { border: 2 }).split('\n')
    assert.equal(lines.length, qr.size + 4)
    assert.equal(lines[0].length, (qr.size + 4) * 2)
    // 首行应为全静默区
    assert.equal(lines[0], '  '.repeat(qr.size + 4))
  })

  it('超出容量时报错而非静默产出坏码', () => {
    assert.throws(() => encodeQr('x'.repeat(5000), { ec: 'H' }), /容量/)
  })
})
