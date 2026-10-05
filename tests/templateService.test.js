import { test } from 'node:test'
import assert from 'node:assert/strict'
import { templateService } from '../src/services/templateService.js'

test('templateService: listTemplates should return all templates', () => {
  const templates = templateService.listTemplates()
  assert.ok(templates.length >= 6)
  assert.ok(templates.every((t) => t.id && t.name && t.description))
})

test('templateService: listTemplates should filter by category', () => {
  const commercial = templateService.listTemplates({ category: '商业' })
  assert.ok(commercial.length >= 2)
  assert.ok(commercial.every((t) => t.category === '商业'))
})

test('templateService: listTemplates should search by name', () => {
  const results = templateService.listTemplates({ search: '旅行' })
  assert.ok(results.length >= 1)
  assert.ok(results.some((t) => t.id === 'travel-vlog'))
})

test('templateService: getTemplate should return specific template', () => {
  const template = templateService.getTemplate('product-ad')
  assert.equal(template.id, 'product-ad')
  assert.equal(template.name, '产品广告')
  assert.ok(template.sampleIdeas.length > 0)
})

test('templateService: getTemplate should throw for invalid id', () => {
  assert.throws(() => templateService.getTemplate('nonexistent'))
})

test('templateService: listCategories should return unique categories', () => {
  const categories = templateService.listCategories()
  assert.ok(categories.length >= 4)
  assert.ok(categories.every((c) => c.name && c.count > 0))
})

test('templateService: buildProjectFromTemplate should create valid params', () => {
  const params = templateService.buildProjectFromTemplate('story-short')
  assert.ok(params.name)
  assert.ok(params.idea)
  assert.equal(params.templateId, 'story-short')
  assert.ok(params.targetDuration > 0)
})

test('templateService: buildProjectFromTemplate should respect overrides', () => {
  const params = templateService.buildProjectFromTemplate('knowledge', {
    name: '自定义名称',
    idea: '自定义想法',
    targetDuration: 120,
  })
  assert.equal(params.name, '自定义名称')
  assert.equal(params.idea, '自定义想法')
  assert.equal(params.targetDuration, 120)
})
