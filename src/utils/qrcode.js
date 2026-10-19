/**
 * 纯 JS QR 编码器（字节模式，ECC L/M），无外部依赖。
 *
 * 用途：把夸克扫码登录的二维码 URL 渲染到终端，避免把登录 token 交给任何第三方二维码服务。
 * 实现严格对齐 python-qrcode（EXP/LOG 表、RS 分块表、掩码惩罚评分），
 * 由 tests/qrcode.test.js 用参考实现生成的固定矩阵做逐模块对比。
 */

const ERROR_CORRECT = { L: 1, M: 0, Q: 3, H: 2 }

// ---- GF(256) ----
const EXP_TABLE = new Array(256).fill(0)
const LOG_TABLE = new Array(256).fill(0)
for (let i = 0; i < 8; i++) EXP_TABLE[i] = 1 << i
for (let i = 8; i < 256; i++) EXP_TABLE[i] = EXP_TABLE[i - 4] ^ EXP_TABLE[i - 5] ^ EXP_TABLE[i - 6] ^ EXP_TABLE[i - 8]
for (let i = 0; i < 255; i++) LOG_TABLE[EXP_TABLE[i]] = i

const glog = (n) => LOG_TABLE[n]
const gexp = (n) => EXP_TABLE[n % 255]

// [version-1][L,M,Q,H] = [[count,total,data], ...] （来自 python-qrcode RS_BLOCK_TABLE）
const RS_BLOCK_TABLE = [
  [[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9]],
  [[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16]],
  [[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13]],
  [[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9]],
  [[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12]],
  [[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15]],
  [[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14]],
  [[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15]],
  [[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13]],
  [[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]],
  [[4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13]],
  [[2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15]],
  [[4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12]],
  [[3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13]],
  [[5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12, 7, 37, 13]],
  [[5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16]],
  [[1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15]],
  [[5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15]],
  [[3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14]],
  [[3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16]],
  [[4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17]],
  [[2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13]],
  [[4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16]],
  [[6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17]],
  [[8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16]],
  [[10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17]],
  [[8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16]],
  [[3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16]],
  [[7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16]],
  [[5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16]],
  [[13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16]],
  [[17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16]],
  [[17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16]],
  [[13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17]],
  [[12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16]],
  [[6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16]],
  [[17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16]],
  [[4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16]],
  [[20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16]],
  [[19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]],
]

const PATTERN_POSITION_TABLE = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78],
  [6, 30, 56, 82], [6, 30, 58, 86], [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102], [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130], [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142], [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154], [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166], [6, 30, 58, 86, 114, 142, 170],
]

const G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | 1
const G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | 1
const G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1)
const PAD0 = 0xec
const PAD1 = 0x11

function bchDigit(data) {
  let digit = 0
  while (data !== 0) {
    digit++
    data >>>= 1
  }
  return digit
}

function bchTypeInfo(data) {
  let d = data << 10
  while (bchDigit(d) - bchDigit(G15) >= 0) d ^= G15 << (bchDigit(d) - bchDigit(G15))
  return ((data << 10) | d) ^ G15_MASK
}

function bchTypeNumber(data) {
  let d = data << 12
  while (bchDigit(d) - bchDigit(G18) >= 0) d ^= G18 << (bchDigit(d) - bchDigit(G18))
  return (data << 12) | d
}

function rsBlocks(version, errorCorrection) {
  const offset = { 1: 0, 0: 1, 3: 2, 2: 3 }[errorCorrection]
  const spec = RS_BLOCK_TABLE[version - 1][offset]
  const blocks = []
  for (let i = 0; i < spec.length; i += 3) {
    const [count, totalCount, dataCount] = spec.slice(i, i + 3)
    for (let k = 0; k < count; k++) blocks.push({ totalCount, dataCount })
  }
  return blocks
}

const bitLimitTable = [0, 1, 2, 3].map((ec) =>
  [0].concat(
    Array.from({ length: 40 }, (_, i) => {
      const v = i + 1
      return 8 * rsBlocks(v, ec).reduce((sum, b) => sum + b.dataCount, 0)
    })
  )
)

// ---- RS 多项式 ----
function polyMul(a, b) {
  const num = new Array(a.length + b.length - 1).fill(0)
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) num[i + j] ^= gexp(glog(a[i]) + glog(b[j]))
  }
  return num
}

function polyMod(a, b) {
  let num = a.slice()
  while (num.length - b.length >= 0) {
    const ratio = glog(num[0]) - glog(b[0])
    for (let i = 0; i < b.length; i++) num[i] ^= gexp(glog(b[i]) + ratio)
    let offset = 0
    while (offset < num.length && num[offset] === 0) offset++
    num = num.slice(offset)
    if (num.length === 0) break
  }
  return num
}

function createBytes(buffer, blocks) {
  let offset = 0
  let maxDc = 0
  let maxEc = 0
  const dcData = []
  const ecData = []
  for (const block of blocks) {
    const dcCount = block.dataCount
    const ecCount = block.totalCount - dcCount
    maxDc = Math.max(maxDc, dcCount)
    maxEc = Math.max(maxEc, ecCount)
    const dc = []
    for (let i = 0; i < dcCount; i++) dc.push(0xff & buffer.buffer[i + offset])
    offset += dcCount

    let rsPoly = [1]
    for (let i = 0; i < ecCount; i++) rsPoly = polyMul(rsPoly, [1, gexp(i)])
    const rawPoly = dc.concat(new Array(rsPoly.length - 1).fill(0))
    const modPoly = polyMod(rawPoly, rsPoly)
    const ec = new Array(ecCount).fill(0)
    const modOffset = modPoly.length - ecCount
    for (let i = 0; i < ecCount; i++) {
      const idx = i + modOffset
      ec[i] = idx >= 0 ? modPoly[idx] : 0
    }
    dcData.push(dc)
    ecData.push(ec)
  }
  const data = []
  for (let i = 0; i < maxDc; i++) for (const dc of dcData) if (i < dc.length) data.push(dc[i])
  for (let i = 0; i < maxEc; i++) for (const ec of ecData) if (i < ec.length) data.push(ec[i])
  return data
}

class BitBuffer {
  constructor() {
    this.buffer = []
    this.length = 0
  }
  put(num, length) {
    for (let i = 0; i < length; i++) this.putBit(((num >>> (length - i - 1)) & 1) === 1)
  }
  putBit(bit) {
    const bufIndex = this.length >>> 3
    if (this.buffer.length <= bufIndex) this.buffer.push(0)
    if (bit) this.buffer[bufIndex] |= 0x80 >>> (this.length % 8)
    this.length++
  }
}

function createData(version, errorCorrection, bytes) {
  const buffer = new BitBuffer()
  buffer.put(4, 4) // 字节模式
  buffer.put(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) buffer.put(b, 8)

  const blocks = rsBlocks(version, errorCorrection)
  const bitLimit = blocks.reduce((sum, b) => sum + b.dataCount * 8, 0)
  if (buffer.length > bitLimit) throw new Error('二维码数据超出容量')

  for (let i = 0; i < Math.min(bitLimit - buffer.length, 4); i++) buffer.putBit(false)
  if (buffer.length % 8) for (let i = 0; i < 8 - (buffer.length % 8); i++) buffer.putBit(false)
  const bytesToFill = (bitLimit - buffer.length) / 8
  for (let i = 0; i < bytesToFill; i++) buffer.put(i % 2 === 0 ? PAD0 : PAD1, 8)

  return createBytes(buffer, blocks)
}

function maskFunc(pattern) {
  switch (pattern) {
    case 0: return (i, j) => (i + j) % 2 === 0
    case 1: return (i) => i % 2 === 0
    case 2: return (i, j) => j % 3 === 0
    case 3: return (i, j) => (i + j) % 3 === 0
    case 4: return (i, j) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0
    case 5: return (i, j) => ((i * j) % 2) + ((i * j) % 3) === 0
    case 6: return (i, j) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0
    case 7: return (i, j) => (((i * j) % 3) + ((i + j) % 2)) % 2 === 0
    default: throw new Error(`bad mask: ${pattern}`)
  }
}

// ---- 掩码评分（对齐 python-qrcode）----
function lostPointLevel1(modules, n) {
  const container = new Array(n + 1).fill(0)
  for (let row = 0; row < n; row++) {
    let previous = modules[row][0]
    let length = 0
    for (let col = 0; col < n; col++) {
      if (modules[row][col] === previous) length++
      else {
        if (length >= 5) container[length]++
        length = 1
        previous = modules[row][col]
      }
    }
    if (length >= 5) container[length]++
  }
  for (let col = 0; col < n; col++) {
    let previous = modules[0][col]
    let length = 0
    for (let row = 0; row < n; row++) {
      if (modules[row][col] === previous) length++
      else {
        if (length >= 5) container[length]++
        length = 1
        previous = modules[row][col]
      }
    }
    if (length >= 5) container[length]++
  }
  let lost = 0
  for (let len = 5; len <= n; len++) lost += container[len] * (len - 2)
  return lost
}

function lostPointLevel2(modules, n) {
  let lost = 0
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const c = modules[row][col]
      if (c === modules[row][col + 1] && c === modules[row + 1][col] && c === modules[row + 1][col + 1]) lost += 3
    }
  }
  return lost
}

function lostPointLevel3(modules, n) {
  let lost = 0
  for (let row = 0; row < n; row++) {
    const r = modules[row]
    for (let col = 0; col <= n - 11; col++) {
      if (
        !r[col + 1] && r[col + 4] && !r[col + 5] && r[col + 6] && !r[col + 9] &&
        ((r[col] && r[col + 2] && r[col + 3] && !r[col + 7] && !r[col + 8] && !r[col + 10]) ||
          (!r[col] && !r[col + 2] && !r[col + 3] && r[col + 7] && r[col + 8] && r[col + 10]))
      ) {
        lost += 40
      }
    }
  }
  for (let col = 0; col < n; col++) {
    for (let row = 0; row <= n - 11; row++) {
      if (
        !modules[row + 1][col] && modules[row + 4][col] && !modules[row + 5][col] &&
        modules[row + 6][col] && !modules[row + 9][col] &&
        ((modules[row][col] && modules[row + 2][col] && modules[row + 3][col] && !modules[row + 7][col] && !modules[row + 8][col] && !modules[row + 10][col]) ||
          (!modules[row][col] && !modules[row + 2][col] && !modules[row + 3][col] && modules[row + 7][col] && modules[row + 8][col] && modules[row + 10][col]))
      ) {
        lost += 40
      }
    }
  }
  return lost
}

function lostPointLevel4(modules, n) {
  let dark = 0
  for (const row of modules) for (const v of row) if (v) dark++
  const percent = dark / (n * n)
  return Math.trunc(Math.abs(percent * 100 - 50) / 5) * 10
}

function lostPoint(modules) {
  const n = modules.length
  return lostPointLevel1(modules, n) + lostPointLevel2(modules, n) + lostPointLevel3(modules, n) + lostPointLevel4(modules, n)
}

// ---- 矩阵构建 ----
function setupPositionProbe(modules, row, col) {
  const n = modules.length
  for (let r = -1; r <= 7; r++) {
    if (row + r <= -1 || n <= row + r) continue
    for (let c = -1; c <= 7; c++) {
      if (col + c <= -1 || n <= col + c) continue
      const dark = (r >= 0 && r <= 6 && (c === 0 || c === 6)) ||
        (c >= 0 && c <= 6 && (r === 0 || r === 6)) ||
        (r >= 2 && r <= 4 && c >= 2 && c <= 4)
      modules[row + r][col + c] = dark
    }
  }
}

function setupTiming(modules) {
  const n = modules.length
  for (let r = 8; r < n - 8; r++) if (modules[r][6] === null) modules[r][6] = r % 2 === 0
  for (let c = 8; c < n - 8; c++) if (modules[6][c] === null) modules[6][c] = c % 2 === 0
}

function setupAdjust(modules, version) {
  const pos = PATTERN_POSITION_TABLE[version - 1]
  for (const row of pos) {
    for (const col of pos) {
      if (modules[row][col] !== null) continue
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          modules[row + r][col + c] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)
        }
      }
    }
  }
}

function setupTypeInfo(modules, test, maskPattern, errorCorrection) {
  const n = modules.length
  const data = (errorCorrection << 3) | maskPattern
  const bits = bchTypeInfo(data)
  for (let i = 0; i < 15; i++) {
    const mod = !test && ((bits >> i) & 1) === 1
    if (i < 6) modules[i][8] = mod
    else if (i < 8) modules[i + 1][8] = mod
    else modules[n - 15 + i][8] = mod
  }
  for (let i = 0; i < 15; i++) {
    const mod = !test && ((bits >> i) & 1) === 1
    if (i < 8) modules[8][n - i - 1] = mod
    else if (i < 9) modules[8][15 - i - 1 + 1] = mod
    else modules[8][15 - i - 1] = mod
  }
  modules[n - 8][8] = !test
}

function setupTypeNumber(modules, test, version) {
  const n = modules.length
  const bits = bchTypeNumber(version)
  for (let i = 0; i < 18; i++) modules[Math.floor(i / 3)][(i % 3) + n - 8 - 3] = !test && ((bits >> i) & 1) === 1
  for (let i = 0; i < 18; i++) modules[(i % 3) + n - 8 - 3][Math.floor(i / 3)] = !test && ((bits >> i) & 1) === 1
}

function mapData(modules, data, maskPattern) {
  const n = modules.length
  let inc = -1
  let row = n - 1
  let bitIndex = 7
  let byteIndex = 0
  const mask = maskFunc(maskPattern)
  for (let start = n - 1; start > 0; start -= 2) {
    let col = start
    if (col <= 6) col -= 1
    for (;;) {
      for (const c of [col, col - 1]) {
        if (modules[row][c] === null) {
          let dark = false
          if (byteIndex < data.length) dark = ((data[byteIndex] >>> bitIndex) & 1) === 1
          if (mask(row, c)) dark = !dark
          modules[row][c] = dark
          bitIndex -= 1
          if (bitIndex === -1) {
            byteIndex += 1
            bitIndex = 7
          }
        }
      }
      row += inc
      if (row < 0 || n <= row) {
        row -= inc
        inc = -inc
        break
      }
    }
  }
}

function makeImpl(version, errorCorrection, data, test, maskPattern) {
  const n = version * 4 + 17
  const modules = Array.from({ length: n }, () => new Array(n).fill(null))
  setupPositionProbe(modules, 0, 0)
  setupPositionProbe(modules, n - 7, 0)
  setupPositionProbe(modules, 0, n - 7)
  setupAdjust(modules, version)
  setupTiming(modules)
  setupTypeInfo(modules, test, maskPattern, errorCorrection)
  if (version >= 7) setupTypeNumber(modules, test, version)
  mapData(modules, data, maskPattern)
  return modules
}

function bestFit(dataLen, errorCorrection, { min = 1, max = 40 } = {}) {
  for (let v = min; v <= max; v++) {
    if (dataLen <= bitLimitTable[errorCorrection][v]) return v
  }
  throw new Error('数据超出二维码容量（40 版仍装不下）')
}

/**
 * 生成二维码矩阵。
 * @param {string} text
 * @param {{ec?: 'L'|'M'|'Q'|'H', version?: number, mask?: number}} [opts]
 * @returns {{size:number, modules:boolean[][], version:number, mask:number}}
 */
export function encodeQr(text, { ec = 'M', version, mask } = {}) {
  const errorCorrection = ERROR_CORRECT[ec]
  if (errorCorrection === undefined) throw new Error(`未知纠错等级：${ec}`)
  const bytes = Buffer.from(String(text), 'utf8')
  const payloadBits = 4 + (8 * bytes.length) + 4
  const chosen = version || bestFit(payloadBits, errorCorrection)
  const data = createData(chosen, errorCorrection, bytes)

  if (mask !== undefined && mask !== null) {
    return { size: chosen * 4 + 17, modules: makeImpl(chosen, errorCorrection, data, false, mask), version: chosen, mask }
  }

  let best = 0
  let minLost = 0
  for (let i = 0; i < 8; i++) {
    const modules = makeImpl(chosen, errorCorrection, data, true, i)
    const lost = lostPoint(modules)
    if (i === 0 || minLost > lost) {
      minLost = lost
      best = i
    }
  }
  return { size: chosen * 4 + 17, modules: makeImpl(chosen, errorCorrection, data, false, best), version: chosen, mask: best }
}

/** 渲染为终端文本（两个字符宽 = 一个模块；quiet zone 默认 2 模块）*/
export function renderTerminal(modules, { border = 2, dark = '██', light = '  ' } = {}) {
  const n = modules.length
  const width = n + border * 2
  const blank = light.repeat(width)
  const lines = []
  for (let i = 0; i < border; i++) lines.push(blank)
  for (let r = 0; r < n; r++) {
    let line = light.repeat(border)
    for (let c = 0; c < n; c++) line += modules[r][c] ? dark : light
    line += light.repeat(border)
    lines.push(line)
  }
  for (let i = 0; i < border; i++) lines.push(blank)
  return lines.join('\n')
}

/** 矩阵 → 紧凑的 '0'/'1' 字符串（测试用）*/
export function matrixToString(modules) {
  return modules.map((row) => row.map((v) => (v ? '1' : '0')).join('')).join('\n')
}
