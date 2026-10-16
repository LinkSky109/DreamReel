/**
 * 宽松 JSON 解析：模型输出常包含代码块、前后说明、尾逗号、单引号、智能引号、注释等，
 * 直接 JSON.parse 会失败。这里按"由严到宽"多策略尝试，尽量还原为 JSON。
 */
function repair(s) {
  return s
    .replace(/[\u201c\u201d]/g, '"') // 智能双引号
    .replace(/[\u2018\u2019]/g, "'") // 智能单引号
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1') // 行注释（避免破坏 http://）
    .replace(/\/\*[\s\S]*?\*\//g, '') // 块注释
    .replace(/,\s*([}\]])/g, '$1') // 尾逗号
    .replace(/'/g, '"') // 单引号字符串
}

/**
 * 抢救被截断的 JSON：模型常输出 `{"characters":[{完整},{完整},{半截...`
 * → 提取数组里已完整的对象，返回 { <key>: [完整项…] }
 */
function salvageFirstArray(text) {
  const km = text.match(/"([A-Za-z_][\w]*)"\s*:\s*\[/)
  if (!km) return null
  const key = km[1]
  let i = km.index + km[0].length
  const items = []
  let depth = 0
  let start = -1
  for (; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '{') {
      if (depth === 0) start = i
      depth += 1
    } else if (ch === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        try {
          items.push(JSON.parse(repair(text.slice(start, i + 1))))
        } catch {
          try {
            items.push(JSON.parse(text.slice(start, i + 1)))
          } catch {
            /* 跳过半截项 */
          }
        }
        start = -1
      }
    } else if (ch === ']' && depth === 0) {
      break
    }
  }
  return items.length ? { [key]: items } : null
}

export function parseJsonLoose(text) {
  if (typeof text !== 'string') throw new Error('not a string')
  const attempts = []
  let s = text.trim()

  const cb = s.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (cb) s = cb[1].trim()
  attempts.push(s)

  // 从第一个 { 或 [ 开始，到最后 } 或 ] 结束
  const start = s.search(/[[{]/)
  const t = start > 0 ? s.slice(start) : s
  if (start > 0) attempts.push(t)
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'))
  if (end >= 0) attempts.push(t.slice(0, end + 1))

  for (const base of [...attempts]) attempts.push(repair(base))

  for (const a of attempts) {
    try {
      return JSON.parse(a)
    } catch {
      /* 尝试下一种 */
    }
  }

  // 最后：抢救被截断的数组
  for (const base of [t, repair(t), s]) {
    const salvaged = salvageFirstArray(base)
    if (salvaged) return salvaged
  }

  throw new Error('unable to parse JSON from model output')
}

export default parseJsonLoose
