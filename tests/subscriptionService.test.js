import { test } from 'node:test'
import assert from 'node:assert/strict'
import { subscriptionService } from '../src/services/subscriptionService.js'
import { storageService } from '../src/services/storageService.js'

const TEST_USER = 'sub_test_user'

// 清理可能残留的测试订阅
if (storageService.data.subscriptions && storageService.data.subscriptions[TEST_USER]) {
  delete storageService.data.subscriptions[TEST_USER]
  storageService.save()
}

test('subscriptionService: getPlans should return all 4 plans', () => {
  const plans = subscriptionService.getPlans()
  assert.equal(plans.length, 4)
  const planIds = plans.map((p) => p.id)
  assert.deepEqual(planIds.sort(), ['basic', 'enterprise', 'free', 'pro'].sort())
})

test('subscriptionService: getPlan should return plan by id', () => {
  const plan = subscriptionService.getPlan('pro')
  assert.equal(plan.name, '专业版')
  assert.equal(plan.priceMonthly, 99)
})

test('subscriptionService: getPlan should return free for invalid id', () => {
  const plan = subscriptionService.getPlan('nonexistent')
  assert.equal(plan.id, 'free')
})

test('subscriptionService: getSubscription should return free for new user', () => {
  const sub = subscriptionService.getSubscription('new_user_123')
  assert.equal(sub.planId, 'free')
  assert.equal(sub.status, 'active')
})

test('subscriptionService: getUserQuota should return free quota by default', () => {
  const quota = subscriptionService.getUserQuota('new_user_456')
  assert.equal(quota.videoGenerationsPerDay, 5)
  assert.equal(quota.maxDurationSeconds, 5)
})

test('subscriptionService: subscribe should upgrade user plan', () => {
  const result = subscriptionService.subscribe(TEST_USER, 'pro', 'monthly', {
    cardNumber: '4242424242424242',
  })
  assert.equal(result.subscription.planId, 'pro')
  assert.equal(result.subscription.status, 'active')
  assert.ok(result.payment.transactionId)
  assert.equal(result.payment.amount, 99)
})

test('subscriptionService: getUserQuota should return pro quota after subscription', () => {
  const quota = subscriptionService.getUserQuota(TEST_USER)
  assert.equal(quota.videoGenerationsPerDay, 200)
  assert.equal(quota.maxDurationSeconds, 15)
  assert.equal(quota.maxResolution, '4k')
})

test('subscriptionService: subscribe should reject free plan', () => {
  assert.throws(() => {
    subscriptionService.subscribe(TEST_USER, 'free', 'monthly')
  }, /无效的订阅计划/)
})

test('subscriptionService: subscribe yearly should charge yearly price', () => {
  const result = subscriptionService.subscribe('sub_yearly_test', 'basic', 'yearly', {
    cardNumber: '4242424242424242',
  })
  assert.equal(result.payment.amount, 290)
  // 清理
  delete storageService.data.subscriptions['sub_yearly_test']
  storageService.save()
})

test('subscriptionService: cancelSubscription should mark cancelAtPeriodEnd', () => {
  const sub = subscriptionService.cancelSubscription(TEST_USER)
  assert.equal(sub.cancelAtPeriodEnd, true)
})

test('subscriptionService: reactivateSubscription should cancel the cancellation', () => {
  const sub = subscriptionService.reactivateSubscription(TEST_USER)
  assert.equal(sub.cancelAtPeriodEnd, false)
})

test('subscriptionService: downgradeToFree should set plan to free', () => {
  const sub = subscriptionService.downgradeToFree(TEST_USER)
  assert.equal(sub.planId, 'free')
})

test('subscriptionService: getUserFeatures should return complete feature set', () => {
  const features = subscriptionService.getUserFeatures(TEST_USER)
  assert.ok(features.plan)
  assert.ok(features.subscription)
  assert.ok(features.quota)
  assert.equal(features.isActive, true)
})

test('subscriptionService: isSubscriptionActive should return true for active', () => {
  assert.equal(subscriptionService.isSubscriptionActive(TEST_USER), true)
})
