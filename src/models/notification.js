/**
 * Notification model for user notifications.
 * Wave 2 feature.
 */
export class Notification {
  constructor(data) {
    this.id = data.id || generateId()
    this.userId = data.userId // recipient
    this.type = data.type // reply | like | favorite | system
    this.sourceId = data.sourceId // ID of the triggering entity (comment/like/etc)
    this.sourceType = data.sourceType // comment | review
    this.message = data.message || ''
    this.isRead = data.isRead || false
    this.createdAt = data.createdAt || new Date().toISOString()
    this.readAt = data.readAt || null
  }

  markAsRead() {
    this.isRead = true
    this.readAt = new Date().toISOString()
  }
}

function generateId() {
  return `not_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

