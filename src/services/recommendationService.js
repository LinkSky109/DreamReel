/**
 * Recommendation Service - Personalized review recommendations.
 * Wave 2 Feature 3.
 *
 * Algorithm:
 * 1. Tag overlap: count matching preference tags between user and review movie
 * 2. Score style similarity: cosine similarity between user's historical score vector
 *    and review's score vector.
 * 3. Exclude user's own reviews.
 * 4. Exclude already interacted reviews (optional).
 */

import { storageService } from './storageService.js'

/**
 * Compute cosine similarity between two 4-dim score vectors.
 * @param {object} a - { story, visual, performance, soundtrack }
 * @param {object} b - { story, visual, performance, soundtrack }
 * @returns {number} similarity in [0, 1]
 */
export function cosineSimilarity(a, b) {
  const vecA = [a.story ?? a.storyScore ?? 0, a.visual ?? a.visualScore ?? 0, a.performance ?? a.performanceScore ?? 0, a.soundtrack ?? a.soundtrackScore ?? 0]
  const vecB = [b.story ?? b.storyScore ?? 0, b.visual ?? b.visualScore ?? 0, b.performance ?? b.performanceScore ?? 0, b.soundtrack ?? b.soundtrackScore ?? 0]

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < 4; i++) {
    dot += vecA[i] * vecB[i]
    normA += vecA[i] * vecA[i]
    normB += vecB[i] * vecB[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Compute tag overlap score.
 * @param {string[]} userTags
 * @param {string[]} reviewTags
 * @returns {number}
 */
export function tagOverlapScore(userTags, reviewTags) {
  if (!userTags.length || !reviewTags.length) return 0
  const setA = new Set(userTags.map((t) => t.toLowerCase()))
  const matches = reviewTags.filter((t) => setA.has(t.toLowerCase()))
  return matches.length / Math.max(userTags.length, reviewTags.length)
}

/**
 * Compute recommendation score for a review.
 * @param {User} user
 * @param {Review} review
 * @param {object} weights
 * @returns {number}
 */
export function computeRecommendationScore(user, review, weights = {}) {
  const wTag = weights.tag ?? 0.4
  const wScore = weights.score ?? 0.4
  const wPopularity = weights.popularity ?? 0.2

  const tagScore = tagOverlapScore(user.preferenceTags, review.movieTags || [])
  const styleSim = cosineSimilarity(user.scoreStyle, review)
  const popularity = Math.min(1, (review.likeCount + review.commentCount + review.favoriteCount) / 100)

  return tagScore * wTag + styleSim * wScore + popularity * wPopularity
}

/**
 * Get personalized recommendations for a user.
 * @param {string} userId
 * @param {number} limit
 * @returns {Promise<Array<{review:object, score:number}>>}
 */
export async function getRecommendations(userId, limit = 10) {
  const user = await storageService.getUserById(userId)
  if (!user) {
    throw new Error(`User not found: ${userId}`)
  }

  const allReviews = await storageService.getAllReviews()
  const candidates = allReviews.filter(
    (r) => r.status === 'published' && r.userId !== userId
  )

  const scored = candidates.map((review) => ({
    review,
    score: computeRecommendationScore(user, review),
  }))

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, limit).map((item) => ({
    reviewId: item.review.id,
    title: item.review.title,
    userId: item.review.userId,
    overallScore: item.review.overallScore,
    likeCount: item.review.likeCount,
    commentCount: item.review.commentCount,
    score: Number(item.score.toFixed(4)),
  }))
}

