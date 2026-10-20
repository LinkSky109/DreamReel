import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const candidates = [
  resolve(process.cwd(), '../public/css/style.css'),
  resolve(process.cwd(), 'public/css/style.css'),
]
const cssPath = candidates.find((candidate) => existsSync(candidate))
if (!cssPath) throw new Error('public/css/style.css not found')
const css = readFileSync(cssPath, 'utf8')

function token(name: string): string {
  const matches = [...css.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`, 'g'))]
  if (!matches.length) throw new Error(`token not found: ${name}`)
  return matches[matches.length - 1][1]
}

function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const linear = rgb.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a)
  const l2 = luminance(b)
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
}

describe('light theme contrast tokens', () => {
  it('主色文字在白色与浅蓝底上达到 AA', () => {
    expect(contrast(token('accent'), token('bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('accent'), token('accent-soft'))).toBeGreaterThanOrEqual(4.5)
  })

  it('正文与辅助文字达到 AA', () => {
    expect(contrast(token('fg'), token('bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('muted'), token('bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('meta'), token('bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('状态色文字达到 AA', () => {
    expect(contrast(token('success'), token('bg'))).toBeGreaterThanOrEqual(4.5)
    expect(contrast(token('danger'), token('bg'))).toBeGreaterThanOrEqual(4.5)
  })
})
