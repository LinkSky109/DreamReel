import { storageService } from './storageService.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

/**
 * 订阅服务
 * 管理用户订阅计划、额度计算、升级降级
 */
export class SubscriptionService {
  constructor() {
    if (!storageService.data.subscriptions) storageService.data.subscriptions = {}
  }

  /**
   * 获取所有订阅计划
   */
  getPlans() {
    return Object.values(config.subscription.plans)
  }

  /**
   * 获取指定计划详情
   */
  getPlan(planId) {
    return config.subscription.plans[planId] || config.subscription.plans.free
  }

  /**
   * 获取用户订阅信息
   */
  getSubscription(userId) {
    return (
      storageService.data.subscriptions[userId] || {
        userId,
        planId: 'free',
        status: 'active',
        currentPeriodStart: new Date().toISOString(),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      }
    )
  }

  /**
   * 获取用户当前计划的额度配置
   */
  getUserQuota(userId) {
    const subscription = this.getSubscription(userId)
    const plan = this.getPlan(subscription.planId)
    return plan.features
  }

  /**
   * 订阅/升级计划
   * @param {string} userId - 用户 ID
   * @param {string} planId - 计划 ID
   * @param {string} billingCycle - 'monthly' | 'yearly'
   * @param {Object} paymentInfo - 模拟支付信息
   */
  subscribe(userId, planId, billingCycle = 'monthly', paymentInfo = {}) {
    const plan = this.getPlan(planId)
    if (!plan || planId === 'free') {
      throw new Error('无效的订阅计划')
    }

    // 模拟支付处理
    const paymentResult = this._processPayment({
      userId,
      plan,
      billingCycle,
      amount: billingCycle === 'yearly' ? plan.priceYearly : plan.priceMonthly,
      paymentInfo,
    })

    if (!paymentResult.success) {
      throw new Error(paymentResult.error || '支付失败')
    }

    const now = new Date()
    const periodEnd = new Date(now)
    if (billingCycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1)
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1)
    }

    const subscription = {
      userId,
      planId,
      status: 'active',
      billingCycle,
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
      lastPayment: {
        amount: paymentResult.amount,
        currency: 'CNY',
        transactionId: paymentResult.transactionId,
        paidAt: now.toISOString(),
      },
    }

    storageService.data.subscriptions[userId] = subscription
    storageService.save()

    logger.info(`User ${userId} subscribed to ${planId} (${billingCycle})`)
    return {
      subscription,
      plan,
      payment: paymentResult,
    }
  }

  /**
   * 取消订阅（在当前周期结束时生效）
   */
  cancelSubscription(userId) {
    const subscription = this.getSubscription(userId)
    if (subscription.planId === 'free') {
      throw new Error('当前为免费版，无需取消')
    }

    subscription.cancelAtPeriodEnd = true
    storageService.data.subscriptions[userId] = subscription
    storageService.save()

    logger.info(`User ${userId} cancelled subscription`)
    return subscription
  }

  /**
   * 恢复订阅
   */
  reactivateSubscription(userId) {
    const subscription = this.getSubscription(userId)
    if (subscription.planId === 'free') {
      throw new Error('当前为免费版')
    }

    subscription.cancelAtPeriodEnd = false
    storageService.data.subscriptions[userId] = subscription
    storageService.save()

    return subscription
  }

  /**
   * 降级到免费版
   */
  downgradeToFree(userId) {
    storageService.data.subscriptions[userId] = {
      userId,
      planId: 'free',
      status: 'active',
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    }
    storageService.save()
    logger.info(`User ${userId} downgraded to free`)
    return this.getSubscription(userId)
  }

  /**
   * 检查订阅是否过期
   */
  isSubscriptionActive(userId) {
    const subscription = this.getSubscription(userId)
    if (subscription.planId === 'free') return true
    if (!subscription.currentPeriodEnd) return true
    return new Date(subscription.currentPeriodEnd) > new Date()
  }

  /**
   * 获取用户可用功能列表
   */
  getUserFeatures(userId) {
    const quota = this.getUserQuota(userId)
    const subscription = this.getSubscription(userId)
    return {
      plan: this.getPlan(subscription.planId),
      subscription,
      quota,
      isActive: this.isSubscriptionActive(userId),
    }
  }

  /**
   * 模拟支付处理
   * 实际接入 Stripe 时替换此方法
   */
  _processPayment({ userId, plan, billingCycle, amount, paymentInfo }) {
    // 模拟支付延迟
    const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`

    // 简单的卡号验证（模拟）
    if (paymentInfo.cardNumber) {
      const cardNum = paymentInfo.cardNumber.replace(/\s/g, '')
      if (cardNum.length < 16) {
        return { success: false, error: '卡号格式不正确' }
      }
    }

    return {
      success: true,
      transactionId,
      amount,
      currency: 'CNY',
      method: paymentInfo.method || 'card',
      processedAt: new Date().toISOString(),
    }
  }
}

export const subscriptionService = new SubscriptionService()
export default subscriptionService
