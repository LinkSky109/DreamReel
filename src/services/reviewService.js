import { storageService } from './storageService.js'
import { Review } from '../models/review.js'

/**
 * 影评服务（Wave 2 社区）。
 *
 * 提供影评的创建/浏览/点赞，填补社区此前只能靠种子数据、无写入入口的缺口。
 * 数据落在 storageService.reviews，与 rankingService / recommendationService 共用同一数据源。
 *
 * 注意：storageService 重启后从 JSON 载入的是普通对象（无类方法），因此这里对已持久化
 * 的影评只做字段读写，不依赖模型实例方法。
 */

/**
 * 创建影评
 * @param {object} data { userId, title, movieId?, content?, storyScore?, visualScore?, performanceScore?, soundtrackScore?, movieTags? }
 * @returns {Review}
 */
export function createReview(data = {}) {
  if (!data.userId) throw new Error('userId is required')
  if (!data.title) throw new Error('title is required')
  const review = new Review(data)
  return storageService.createReview(review)
}

/**
 * 列出影评
 * @param {object} opts { userId?, movieId?, status?, limit? }
 * @returns {Array}
 */
export function listReviews({ userId, movieId, status = 'published', limit = 50 } = {}) {
  let items = storageService.getAllReviews()
  if (userId) items = items.filter((r) => r.userId === userId)
  if (movieId) items = items.filter((r) => r.movieId === movieId)
  if (status) items = items.filter((r) => r.status === status)
  items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  return items.slice(0, Math.max(0, limit))
}

/**
 * 获取单条影评
 * @param {string} id
 * @returns {object|null}
 */
export function getReview(id) {
  return storageService.getReviewById(id)
}

/**
 * 点赞影评
 * @param {string} id
 * @returns {object}
 */
export function likeReview(id) {
  const review = storageService.getReviewById(id)
  if (!review) throw new Error(`Review not found: ${id}`)
  review.likeCount = (review.likeCount || 0) + 1
  review.updatedAt = new Date().toISOString()
  return storageService.updateReview(review)
}
