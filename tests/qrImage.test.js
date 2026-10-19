import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { inflateSync } from 'node:zlib'
import { encodeQr } from '../src/utils/qrcode.js'
import { toPNG, toSVG, writeQrPng, writeQrSvg } from '../src/utils/qrImage.js'

describe('QR 图片输出（本地生成，PNG/SVG）', () => {
  const qr = encodeQr('HELLO', { ec: 'M' })

  it('PNG：签名/IHDR 合法，尺寸 = (模块数 + 静默区) × scale', () => {
    const scale = 8
    const border = 4
    const buf = toPNG(qr.modules, { scale, border })
    assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR')
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    const expected = (qr.size + border * 2) * scale
    assert.equal(width, expected)
    assert.equal(height, expected)
    assert.equal(buf[24], 8, 'bit depth')
    assert.equal(buf[25], 0, 'grayscale')
    assert.ok(buf.includes(Buffer.from('IEND', 'ascii')))
  })

  it('PNG：像素级校验——取每个模块中心点，应与矩阵一致', () => {
    const scale = 3
    const border = 2
    const buf = toPNG(qr.modules, { scale, border })
    // 解压 IDAT 前需跳过 chunk 头；这里用 zlib.inflateSync 还原扫描线
    const idatStart = buf.indexOf(Buffer.from('IDAT', 'ascii')) + 4
    const idatLen = buf.readUInt32BE(idatStart - 8)
    const raw = inflateSync(buf.subarray(idatStart, idatStart + idatLen))
    const size = (qr.size + border * 2) * scale
    const stride = size + 1
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        const cx = (c + border) * scale + Math.floor(scale / 2)
        const cy = (r + border) * scale + Math.floor(scale / 2)
        const px = raw[cy * stride + 1 + cx]
        const dark = px === 0
        assert.equal(dark, qr.modules[r][c], `模块(${r},${c}) 像素不符`)
      }
    }
  })

  it('SVG：包含正确画布尺寸与黑色模块数', () => {
    const svg = toSVG(qr.modules, { scale: 4, border: 4 })
    const size = (qr.size + 8) * 4
    assert.match(svg, new RegExp(`width="${size}" height="${size}"`))
    const darkCount = qr.modules.flat().filter(Boolean).length
    assert.equal((svg.match(/<rect /g) || []).length, darkCount + 1) // +1 背景
  })

  it('写文件：自动建目录并落盘', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dr-qr-img-'))
    const png = writeQrPng(qr.modules, path.join(dir, 'nested', 'qr.png'))
    const svg = writeQrSvg(qr.modules, path.join(dir, 'qr.svg'))
    assert.ok(fs.statSync(png).size > 100)
    assert.ok(fs.readFileSync(svg, 'utf-8').startsWith('<svg'))
  })
})
