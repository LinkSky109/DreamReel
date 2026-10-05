import { storageService } from './storageService.js'
import config from '../config/index.js'
import { subscriptionService } from './subscriptionService.js'
import logger from '../utils/logger.js'

/**
 * 额度管理 Service
 * 根据用户订阅计划动态计算额度
 */
export class QuotaService {
  constructor() {
    this.freeQuota = config.quota.free
  }

  /**
   * 获取用户的额度配置（基于订阅计划）
   */
  _getUserQuota(userId) {
    try {
      return subscriptionService.getUserQuota(userId)
    } catch {
      return this.freeQuota
    }
  }

  /**
   * 检查用户是否有足够的视频生成额度
   */
  checkVideoQuota(userId) {
    const quota = this._getUserQuota(userId)
    const usage = storageService.getUsage(userId)
    const used = usage.daily.videoGenerations
    const limit = quota.videoGenerationsPerDay
    const remaining = Math.max(0, limit - used)

    return {
      allowed: remaining > 0,
      remaining,
      limit,
      used,
      reason: remaining > 0 ? null : `今日额度已用完（${limit}次/天），请升级订阅或明日再来`,
    }
  }

  /**
   * 检查配音额度
   */
  checkDubbingQuota(userId, estimatedSeconds = 0) {
    const quota = this._getUserQuota(userId)
    const usage = storageService.getUsage(userId)
    const used = usage.monthly.dubbingSeconds
    const limit = quota.dubbingMinutesPerMonth * 60
    const remaining = Math.max(0, limit - used)

    return {
      allowed: remaining >= estimatedSeconds,
      remaining,
      limit,
      used,
      reason: remaining >= estimatedSeconds ? null : `本月配音额度不足`,
    }
  }

  /**
   * 消耗视频生成额度
   */
  consumeVideoQuota(userId) {
    const check = this.checkVideoQuota(userId)
    if (!check.allowed) {
      throw new Error(check.reason)
    }
    storageService.incrementUsage(userId, 'video', 1)
    logger.info(`Video quota consumed for user ${userId}: ${check.used + 1}/${check.limit}`)
    return { remaining: check.remaining - 1, limit: check.limit }
  }

  /**
   * 消耗配音额度
   */
  consumeDubbingQuota(userId, seconds) {
    const check = this.checkDubbingQuota(userId, seconds)
    if (!check.allowed) {
      throw new Error(check.reason)
    }
    storageService.incrementUsage(userId, 'dubbing', seconds)
    logger.info(`Dubbing quota consumed for user ${userId}: ${seconds}s`)
    return { remaining: check.remaining - seconds, limit: check.limit }
  }

  /**
   * 获取用户额度概览
   */
  getQuotaOverview(userId) {
    const quota = this._getUserQuota(userId)
    const usage = storageService.getUsage(userId)
    const subscription = subscriptionService.getSubscription(userId)

    return {
      video: {
        daily: {
          used: usage.daily.videoGenerations,
          limit: quota.videoGenerationsPerDay,
          remaining: Math.max(0, quota.videoGenerationsPerDay - usage.daily.videoGenerations),
          resetAt: this._getNextDayReset(),
        },
      },
      dubbing: {
        monthly: {
          usedSeconds: usage.monthly.dubbingSeconds,
          limitSeconds: quota.dubbingMinutesPerMonth * 60,
          remainingSeconds: Math.max(0, quota.dubbingMinutesPerMonth * 60 - usage.monthly.dubbingSeconds),
        },
      },
      maxDuration: quota.maxDurationSeconds,
      maxResolution: quota.maxResolution,
      maxCharacters: quota.maxCharacters,
      maxProjects: quota.maxProjects,
      plan: subscription.planId,
      planName: subscriptionService.getPlan(subscription.planId).name,
    }
  }

  _getNextDayReset() {
    const now = new Date()
    const tomorrow = new Date(now)
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(0, 0, 0, 0)
    return tomorrow.toISOString()
  }
}

export const quotaService = new QuotaService()
export default quotaService
