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
   * R32：检查图片生成额度
   */
  checkImageQuota(userId, requestedCount = 1) {
    const quota = this._getUserQuota(userId)
    const usage = storageService.getUsage(userId)
    const used = usage.daily.imageGenerations || 0
    const limit = quota.imageGenerationsPerDay ?? 10
    const remaining = Math.max(0, limit - used)

    return {
      allowed: remaining >= requestedCount,
      remaining,
      limit,
      used,
      reason: remaining >= requestedCount ? null : `今日图片生成额度不足（剩余 ${remaining} 张，需要 ${requestedCount} 张）`,
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
   * R32：消耗图片生成额度
   */
  consumeImageQuota(userId, count = 1) {
    const check = this.checkImageQuota(userId, count)
    if (!check.allowed) {
      throw new Error(check.reason)
    }
    storageService.incrementUsage(userId, 'image', count)
    logger.info(`Image quota consumed for user ${userId}: ${count} image(s)`)
    return { remaining: check.remaining - count, limit: check.limit }
  }

  /**
   * R32：生成失败的图片不占用额度
   */
  refundImageQuota(userId, count = 1) {
    if (count <= 0) return this.checkImageQuota(userId, 0)
    const usage = storageService.getUsage(userId)
    usage.daily.imageGenerations = Math.max(0, (usage.daily.imageGenerations || 0) - count)
    storageService.save()
    logger.info(`Image quota refunded for user ${userId}: ${count} image(s)`)
    return this.checkImageQuota(userId, 0)
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
      image: {
        daily: {
          used: usage.daily.imageGenerations || 0,
          limit: quota.imageGenerationsPerDay ?? 10,
          remaining: Math.max(0, (quota.imageGenerationsPerDay ?? 10) - (usage.daily.imageGenerations || 0)),
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
