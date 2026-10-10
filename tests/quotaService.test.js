import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quotaService } from '../src/services/quotaService.js'
import { storageService } from '../src/services/storageService.js'

const TEST_USER = 'quota_test_user'

// 清理可能残留的测试额度
if (storageService.data.usage && storageService.data.usage[TEST_USER]) {
  delete storageService.data.usage[TEST_USER]
  storageService.save()
}

test('quotaService: initial quota should be full', () => {
  const result = quotaService.checkVideoQuota(TEST_USER)
  assert.equal(result.allowed, true)
  assert.equal(result.limit, 5)
  assert.equal(result.remaining, 5)
})

test('quotaService: consumeVideoQuota should decrement remaining', () => {
  const before = quotaService.checkVideoQuota(TEST_USER)
  quotaService.consumeVideoQuota(TEST_USER)
  const after = quotaService.checkVideoQuota(TEST_USER)
  assert.equal(after.used, before.used + 1)
  assert.equal(after.remaining, before.remaining - 1)
})

test('quotaService: should block when quota exhausted', () => {
  // 消耗完所有额度
  for (let i = 0; i < 10; i++) {
    try {
      quotaService.consumeVideoQuota(TEST_USER)
    } catch {
      // expected
    }
  }
  const result = quotaService.checkVideoQuota(TEST_USER)
  assert.equal(result.allowed, false)
  assert.equal(result.remaining, 0)
  assert.ok(result.reason)
})

test('quotaService: getQuotaOverview should return full structure', () => {
  const overview = quotaService.getQuotaOverview(TEST_USER)
  assert.ok(overview.video)
  assert.ok(overview.video.daily)
  assert.ok(overview.dubbing)
  assert.ok(overview.dubbing.monthly)
  assert.equal(overview.plan, 'free')
  assert.equal(overview.maxDuration, 5)
  assert.equal(overview.maxResolution, '720p')
})

test('quotaService: dubbing quota check', () => {
  const result = quotaService.checkDubbingQuota(TEST_USER, 10)
  assert.equal(result.allowed, true)
  assert.ok(result.limit > 0)
})

test('quotaService: consumeDubbingQuota should track seconds', () => {
  const before = quotaService.checkDubbingQuota(TEST_USER, 0)
  quotaService.consumeDubbingQuota(TEST_USER, 30)
  const after = quotaService.checkDubbingQuota(TEST_USER, 0)
  assert.equal(after.used, before.used + 30)
})
