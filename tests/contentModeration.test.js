import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  contentModerationService,
  MODERATION_LEVEL,
  MODERATION_CATEGORY,
} from '../src/services/contentModerationService.js'

test('内容审核 - 正常内容通过', () => {
  const result = contentModerationService.moderate('一个温馨的家庭故事，讲述亲情与成长')
  assert.equal(result.passed, true)
  assert.equal(result.level, MODERATION_LEVEL.PASS)
  assert.equal(result.categories.length, 0)
})

test('内容审核 - 暴力内容触发警告', () => {
  const result = contentModerationService.moderate('一场血腥的战斗场面，充满暴力和杀戮')
  assert.equal(result.passed, true) // 警告级别仍可通过
  assert.equal(result.level, MODERATION_LEVEL.WARNING)
  assert.ok(result.categories.includes(MODERATION_CATEGORY.VIOLENCE))
  assert.ok(result.matchedKeywords.length > 0)
})

test('内容审核 - 色情内容被拒绝', () => {
  const result = contentModerationService.moderate('包含裸体和色情内容的描述')
  assert.equal(result.passed, false)
  assert.equal(result.level, MODERATION_LEVEL.REJECT)
  assert.ok(result.categories.includes(MODERATION_CATEGORY.SEXUAL))
})

test('内容审核 - 仇恨言论被拒绝', () => {
  const result = contentModerationService.moderate('包含纳粹和种族歧视的仇恨言论')
  assert.equal(result.passed, false)
  assert.equal(result.level, MODERATION_LEVEL.REJECT)
})

test('内容审核 - 违法内容被拒绝', () => {
  const result = contentModerationService.moderate('教你如何制作炸弹和制造毒品')
  assert.equal(result.passed, false)
  assert.equal(result.level, MODERATION_LEVEL.REJECT)
})

test('内容审核 - 自残内容触发警告', () => {
  const result = contentModerationService.moderate('描述自杀和自残的场景')
  assert.equal(result.passed, true)
  assert.equal(result.level, MODERATION_LEVEL.WARNING)
})

test('内容审核 - 毒品内容触发警告', () => {
  const result = contentModerationService.moderate('展示吸毒和注射毒品的画面')
  assert.equal(result.passed, true)
  assert.equal(result.level, MODERATION_LEVEL.WARNING)
})

test('内容审核 - 空内容自动通过', () => {
  const result = contentModerationService.moderate('')
  assert.equal(result.passed, true)
  assert.equal(result.level, MODERATION_LEVEL.PASS)
})

test('内容审核 - 非字符串输入自动通过', () => {
  const result = contentModerationService.moderate(null)
  assert.equal(result.passed, true)
})

test('内容审核 - 英文关键词检测', () => {
  const result = contentModerationService.moderate('This contains porn and nude content')
  assert.equal(result.passed, false)
  assert.equal(result.level, MODERATION_LEVEL.REJECT)
})

test('内容审核 - 多类别同时触发取最高级别', () => {
  const result = contentModerationService.moderate('包含色情裸体和暴力血腥的内容')
  assert.equal(result.passed, false) // 色情是 REJECT，最高级别
  assert.equal(result.level, MODERATION_LEVEL.REJECT)
  assert.ok(result.categories.includes(MODERATION_CATEGORY.SEXUAL))
  assert.ok(result.categories.includes(MODERATION_CATEGORY.VIOLENCE))
})

test('内容审核 - 批量审核', () => {
  const results = contentModerationService.moderateBatch([
    '正常的家庭故事',
    '暴力血腥场面',
    '色情裸体内容',
  ])
  assert.equal(results.overall, MODERATION_LEVEL.REJECT)
  assert.equal(results.passed, false)
  assert.equal(results.rejectedCount, 1)
  assert.equal(results.warningCount, 1)
  assert.equal(results.results.length, 3)
})

test('内容审核 - 审核统计', () => {
  // 先执行一些审核
  contentModerationService.moderate('正常内容')
  contentModerationService.moderate('暴力内容')
  contentModerationService.moderate('色情内容')

  const stats = contentModerationService.getStats()
  assert.ok(stats.total > 0)
  assert.ok(stats.passed > 0)
  assert.ok(stats.rejected > 0)
  assert.ok(typeof stats.passRate === 'number')
})

test('内容审核 - 审核日志记录', () => {
  const before = contentModerationService.getAuditLog(100).length
  contentModerationService.moderate('测试日志记录', { userId: 'test-user', context: 'test' })
  const after = contentModerationService.getAuditLog(100).length
  assert.equal(after, before + 1)
})

test('内容审核 - 类别标签中文', () => {
  const result = contentModerationService.moderate('暴力血腥场面')
  assert.ok(result.categoryLabels.includes('暴力内容'))
})
