import { test } from 'node:test'
import assert from 'node:assert/strict'
import { styleService } from '../src/services/styleService.js'

test('styleService: listStyles should return all presets', () => {
  const styles = styleService.listStyles()
  assert.ok(styles.length >= 10)
  assert.ok(styles.every((s) => s.id && s.name && s.description))
})

test('styleService: listStyles should search by name', () => {
  const results = styleService.listStyles({ search: '诺兰' })
  assert.ok(results.length >= 1)
  assert.ok(results.some((s) => s.id === 'nolan'))
})

test('styleService: listStyles should search by director', () => {
  const results = styleService.listStyles({ search: 'Wes Anderson' })
  assert.ok(results.length >= 1)
  assert.ok(results.some((s) => s.id === 'wes-anderson'))
})

test('styleService: getStyle should return specific style', () => {
  const style = styleService.getStyle('nolan')
  assert.equal(style.id, 'nolan')
  assert.equal(style.name, '诺兰风格')
  assert.ok(style.promptModifier.length > 0)
})

test('styleService: getStyle should throw for invalid id', () => {
  assert.throws(() => styleService.getStyle('nonexistent'))
})

test('styleService: applyStyleToPrompt should append modifier', () => {
  const result = styleService.applyStyleToPrompt('a cat walking', 'nolan')
  assert.ok(result.includes('a cat walking'))
  assert.ok(result.includes('Christopher Nolan'))
  assert.ok(result.length > 'a cat walking'.length)
})

test('styleService: applyStyleToPrompt with none should return original', () => {
  const original = 'a cat walking'
  const result = styleService.applyStyleToPrompt(original, 'none')
  assert.equal(result, original)
})

test('styleService: applyStyleToPrompt with invalid id should return original', () => {
  const original = 'a cat walking'
  const result = styleService.applyStyleToPrompt(original, 'invalid-style')
  assert.equal(result, original)
})

test('styleService: getStyleSummary should return characteristics', () => {
  const summary = styleService.getStyleSummary('blade-runner')
  assert.equal(summary.id, 'blade-runner')
  assert.ok(summary.characteristics.cinematography)
  assert.ok(summary.characteristics.colorGrading)
  assert.ok(summary.characteristics.composition)
  assert.ok(summary.characteristics.lighting)
})

test('styleService: every style should have promptModifier or be none', () => {
  const styles = styleService.listStyles()
  for (const style of styles) {
    if (style.id !== 'none') {
      assert.ok(style.promptModifier.length > 0, `${style.id} should have promptModifier`)
    }
  }
})
