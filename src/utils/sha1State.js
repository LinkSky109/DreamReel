/**
 * SHA1 增量状态（用于夸克并行分片的 x-oss-hash-ctx）。
 *
 * OSS 的并行分片要求第 2 片起带上「前序字节的 SHA1 中间状态」，
 * 格式为 base64(JSON{hash_type,h0..h4,Nl,Nh,data,num})。
 * Node 的 crypto 不暴露中间状态，所以这里实现 SHA1 压缩函数。
 *
 * 正确性由 tests/sha1State.test.js 用 crypto.createHash('sha1') 对拍：
 * 用本文件算出的状态继续吃完剩余数据（含 padding），必须等于整段 digest。
 */

const rotl = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0

function compress(h, block) {
  const w = new Uint32Array(80)
  for (let i = 0; i < 16; i++) {
    w[i] = (block[i * 4] << 24) | (block[i * 4 + 1] << 16) | (block[i * 4 + 2] << 8) | block[i * 4 + 3]
  }
  for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)

  let [a, b, c, d, e] = h
  for (let i = 0; i < 80; i++) {
    let f
    let k
    if (i < 20) {
      f = (b & c) | (~b & d)
      k = 0x5a827999
    } else if (i < 40) {
      f = b ^ c ^ d
      k = 0x6ed9eba1
    } else if (i < 60) {
      f = (b & c) | (b & d) | (c & d)
      k = 0x8f1bbcdc
    } else {
      f = b ^ c ^ d
      k = 0xca62c1d6
    }
    const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0
    e = d
    d = c
    c = rotl(b, 30)
    b = a
    a = temp
  }
  return [
    (h[0] + a) >>> 0,
    (h[1] + b) >>> 0,
    (h[2] + c) >>> 0,
    (h[3] + d) >>> 0,
    (h[4] + e) >>> 0,
  ]
}

const IV = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]

export function sha1Init() {
  return { h: IV.slice(), bytes: 0, tail: Buffer.alloc(0) }
}

/** 吃入数据，返回新状态（不修改入参） */
export function sha1Update(state, buf) {
  let { h, bytes, tail } = state
  const data = tail.length ? Buffer.concat([tail, buf]) : buf
  bytes += buf.length
  let offset = 0
  while (offset + 64 <= data.length) {
    h = compress(h, data.subarray(offset, offset + 64))
    offset += 64
  }
  tail = data.subarray(offset)
  return { h, bytes, tail: Buffer.from(tail) }
}

/** 序列化为 OSS 的 x-oss-hash-ctx（base64 的紧凑 JSON） */
export function hashContextBase64(state) {
  const [h0, h1, h2, h3, h4] = state.h
  const bits = state.bytes * 8
  const ctx = {
    hash_type: 'sha1',
    h0: String(h0),
    h1: String(h1),
    h2: String(h2),
    h3: String(h3),
    h4: String(h4),
    Nl: String(bits >>> 0),
    Nh: String(Math.floor(bits / 0x100000000)),
    data: state.tail.length ? state.tail.toString('base64') : '',
    num: String(state.tail.length),
  }
  return Buffer.from(JSON.stringify(ctx), 'utf8').toString('base64')
}

/** 仅供测试：从状态继续吃完剩余数据并输出最终 digest（hex）*/
export function sha1Finalize(state) {
  const totalBits = state.bytes * 8
  const tail = state.tail
  const padLen = (tail.length % 64 < 56 ? 56 : 120) - (tail.length % 64)
  const pad = Buffer.alloc(padLen + 8)
  pad[0] = 0x80
  pad.writeUInt32BE(Math.floor(totalBits / 0x100000000), padLen)
  pad.writeUInt32BE(totalBits >>> 0, padLen + 4)
  const { h } = sha1Update({ h: state.h, bytes: state.bytes, tail }, pad)
  return h.map((x) => x.toString(16).padStart(8, '0')).join('')
}
