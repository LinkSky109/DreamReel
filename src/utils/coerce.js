/** 将输入强制为区间内的整数；非法/越界返回默认值（防资源耗尽/DoS） */
export function clampInt(value, def, min, max) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < min || n > max) return def
  return n
}

/** 可选整数：未提供返回 undefined，非法/越界同样返回 undefined */
export function optionalClampInt(value, min, max) {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined
}

export default clampInt
