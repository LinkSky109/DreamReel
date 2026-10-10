/**
 * Report model for content moderation.
 * Wave 2 feature.
 */
export class Report {
  constructor(data) {
    this.id = data.id || generateId()
    this.reviewId = data.reviewId
    this.reporterId = data.reporterId
    this.reason = data.reason || ''
    this.status = data.status || 'pending' // pending | approved | rejected
    this.adminId = data.adminId || null
    this.adminNote = data.adminNote || ''
    this.createdAt = data.createdAt || new Date().toISOString()
    this.resolvedAt = data.resolvedAt || null
  }

  resolve(status, adminId, adminNote) {
    this.status = status
    this.adminId = adminId
    this.adminNote = adminNote || ''
    this.resolvedAt = new Date().toISOString()
  }
}

function generateId() {
  return `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

