import fs from 'fs'
import path from 'path'
import zlib from 'zlib'

/**
 * QR 矩阵 → 图片（本地生成，不依赖任何在线二维码服务）。
 *
 * 为什么自己画：二维码内容就是夸克登录 token，交给第三方图片服务等于把登录态泄露出去。
 * - toSVG：纯文本，浏览器可直接打开、可任意缩放
 * - toPNG：自带 PNG 编码（灰度 8bit + zlib），生成可扫描的点阵图
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crcBuf])
}

/**
 * 生成 PNG（灰度，每个模块 scale×scale 像素，四周留 border 个模块静默区）。
 * @param {boolean[][]} modules
 * @param {{scale?:number, border?:number}} [opts]
 * @returns {Buffer}
 */
export function toPNG(modules, { scale = 8, border = 4 } = {}) {
  const count = modules.length
  const size = (count + border * 2) * scale
  const stride = size + 1 // 每行前缀 1 字节 filter(0)
  const raw = Buffer.alloc(stride * size, 0xff) // 默认白底

  for (let y = 0; y < size; y++) {
    const rowStart = y * stride
    raw[rowStart] = 0 // filter: None
    const my = Math.floor(y / scale) - border
    if (my < 0 || my >= count) continue // 静默区保持白
    for (let x = 0; x < size; x++) {
      const mx = Math.floor(x / scale) - border
      if (mx < 0 || mx >= count) continue
      if (modules[my][mx]) raw[rowStart + 1 + x] = 0x00 // 黑
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 0 // color type: grayscale
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * 生成 SVG。
 * @param {boolean[][]} modules
 * @param {{scale?:number, border?:number, dark?:string, light?:string}} [opts]
 * @returns {string}
 */
export function toSVG(modules, { scale = 8, border = 4, dark = '#000000', light = '#ffffff' } = {}) {
  const count = modules.length
  const size = (count + border * 2) * scale
  const rects = []
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (!modules[r][c]) continue
      rects.push(`<rect x="${(c + border) * scale}" y="${(r + border) * scale}" width="${scale}" height="${scale}"/>`)
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">`,
    `<rect width="${size}" height="${size}" fill="${light}"/>`,
    `<g fill="${dark}">`,
    rects.join(''),
    '</g>',
    '</svg>',
  ].join('')
}

/** 写 PNG（目录自动创建），返回路径 */
export function writeQrPng(modules, file, opts) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, toPNG(modules, opts))
  return file
}

/** 写 SVG（目录自动创建），返回路径 */
export function writeQrSvg(modules, file, opts) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, toSVG(modules, opts))
  return file
}
