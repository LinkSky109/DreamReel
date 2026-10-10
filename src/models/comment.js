/**
 * Comment model for review comments.
 * T17-006 baseline model.
 */
export class Comment {
  constructor(data) {
    this.id = data.id || generateId()
    this.reviewId = data.reviewId
    this.userId = data.userId
    this.parentId = data.parentId || null // null = top-level comment
    this.content = data.content || ''
    this.likeCount = data.likeCount || 0
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || this.createdAt
    this.status = data.status || 'published'
  }
}

function generateId() {
  return `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

