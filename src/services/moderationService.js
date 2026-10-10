/**
 * Moderation Service - Report and review moderation.
 * Wave 2 Feature 4.
 */

import { storageService } from './storageService.js'
import { Report } from '../models/report.js'

/**
 * Submit a report for a review.
 * @param {string} reviewId
 * @param {string} reporterId
 * @param {string} reason
 * @returns {Promise<Report>}
 */
export async function submitReport(reviewId, reporterId, reason) {
  const review = await storageService.getReviewById(reviewId)
  if (!review) {
    throw new Error(`Review not found: ${reviewId}`)
  }

  // Prevent duplicate reports from same user on same review
  const existingReports = await storageService.getReportsByStatus('pending')
  const duplicate = existingReports.find(
    (r) => r.reviewId === reviewId && r.reporterId === reporterId
  )
  if (duplicate) {
    throw new Error('You have already reported this review')
  }

  const report = new Report({
    reviewId,
    reporterId,
    reason,
  })

  return storageService.createReport(report)
}

/**
 * Get pending reports (admin only).
 * @returns {Promise<Array<Report>>}
 */
export async function getPendingReports() {
  return storageService.getReportsByStatus('pending')
}

/**
 * Get all reports with optional filter.
 * @param {string} status - pending | approved | rejected
 * @returns {Promise<Array<Report>>}
 */
export async function getReports(status) {
  return storageService.getReportsByStatus(status)
}

/**
 * Process a report decision.
 * @param {string} reportId
 * @param {string} decision - approved | rejected
 * @param {string} adminId
 * @param {string} adminNote
 * @returns {Promise<Report>}
 */
export async function processReport(reportId, decision, adminId, adminNote) {
  const validDecisions = ['approved', 'rejected']
  if (!validDecisions.includes(decision)) {
    throw new Error(`Invalid decision: ${decision}. Must be approved or rejected`)
  }

  const report = await storageService.getReportById(reportId)
  if (!report) {
    throw new Error(`Report not found: ${reportId}`)
  }

  if (report.status !== 'pending') {
    throw new Error(`Report already resolved: ${report.status}`)
  }

  report.resolve(decision, adminId, adminNote)

  // If approved, hide the review
  if (decision === 'approved') {
    const review = await storageService.getReviewById(report.reviewId)
    if (review) {
      review.status = 'hidden'
      await storageService.updateReview(review)
    }
  }

  return storageService.updateReport(report)
}

/**
 * Get report details.
 * @param {string} reportId
 * @returns {Promise<Report|null>}
 */
export async function getReport(reportId) {
  return storageService.getReportById(reportId)
}

