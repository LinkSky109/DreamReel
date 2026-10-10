/**
 * Ranking Service - Hot review leaderboard.
 * Wave 2 Feature 1.
 *
 * Sorting formula: heat = (overallScore * weightScore) + (interactionCount * weightInteraction)
 *                   with time decay factor.
 *
 * Supports daily / weekly / monthly leaderboards.
 */

import { storageService } from './storageService.js'

const WEIGHT_SCORE = 10
const WEIGHT_INTERACTION = 1
const HALF_LIFE_HOURS = {
  daily: 6,
  weekly: 24,
  monthly: 72,
}

/**
 * Compute exponential time decay factor.
 * @param {string} createdAt - ISO timestamp
 * @param {string} period - daily | weekly | monthly
 * @returns {number} decay factor in range (0, 1]
 */
export function computeTimeDecay(createdAt, period = 'weekly') {
  const halfLifeMs = (HALF_LIFE_HOURS[period] || 24) * 60 * 60 * 1000
  const ageMs = Date.now() - new Date(createdAt).getTime()
  if (ageMs <= 0) return 1
  return Math.exp(-ageMs / halfLifeMs)
}

/**
 * Compute heat score for a review.
 * @param {Review} review
 * @param {string} period
 * @returns {number}
 */
export function computeHeat(review, period = 'weekly') {
  const interactionCount = review.likeCount + review.commentCount + review.favoriteCount
  const rawHeat = review.overallScore * WEIGHT_SCORE + interactionCount * WEIGHT_INTERACTION
  const decay = computeTimeDecay(review.createdAt, period)
  return rawHeat * decay
}

/**
 * Get leaderboard for a given period.
 * @param {string} period - daily | weekly | monthly
 * @param {number} limit
 * @returns {Promise<Array<{rank:number, review:object, heat:number}>>}
 */
export async function getLeaderboard(period = 'weekly', limit = 20) {
  const validPeriods = ['daily', 'weekly', 'monthly']
  if (!validPeriods.includes(period)) {
    throw new Error(`Invalid period: ${period}. Must be one of ${validPeriods.join(', ')}`)
  }

  const now = new Date()
  const cutoffDate = new Date(now)

  switch (period) {
  case 'daily':
    cutoffDate.setDate(now.getDate() - 1)
    break
  case 'weekly':
    cutoffDate.setDate(now.getDate() - 7)
    break
  case 'monthly':
    cutoffDate.setMonth(now.getMonth() - 1)
    break
  }

  const allReviews = await storageService.getAllReviews()
  const periodReviews = allReviews.filter(
    (r) => r.status === 'published' && new Date(r.createdAt) >= cutoffDate
  )

  const ranked = periodReviews
    .map((review) => ({
      review,
      heat: computeHeat(review, period),
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, limit)
    .map((item, index) => ({
      rank: index + 1,
      reviewId: item.review.id,
      title: item.review.title,
      userId: item.review.userId,
      overallScore: item.review.overallScore,
      likeCount: item.review.likeCount,
      commentCount: item.review.commentCount,
      favoriteCount: item.review.favoriteCount,
      heat: Number(item.heat.toFixed(2)),
      createdAt: item.review.createdAt,
    }))

  return ranked
}

