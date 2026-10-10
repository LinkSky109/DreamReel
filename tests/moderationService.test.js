import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { storageService } from '../src/services/storageService.js'
import {
  submitReport,
  getPendingReports,
  getReports,
  processReport,
  getReport,
} from '../src/services/moderationService.js'
import { Review } from '../src/models/review.js'

describe('Moderation Service', () => {
  beforeEach(async () => {
    await storageService.clearAll()
  })

  describe('submitReport', () => {
    it('creates a pending report', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)

      const report = await submitReport('r1', 'u2', 'Inappropriate content')
      assert.equal(report.status, 'pending')
      assert.equal(report.reviewId, 'r1')
      assert.equal(report.reporterId, 'u2')
      assert.equal(report.reason, 'Inappropriate content')
    })

    it('throws for nonexistent review', async () => {
      await assert.rejects(
        async () => submitReport('nonexistent', 'u2', 'reason'),
        /Review not found/
      )
    })

    it('throws for duplicate report from same user', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)

      await submitReport('r1', 'u2', 'Inappropriate content')
      await assert.rejects(
        async () => submitReport('r1', 'u2', 'Another reason'),
        /already reported/
      )
    })
  })

  describe('getPendingReports', () => {
    it('returns only pending reports', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)
      await submitReport('r1', 'u2', 'Spam')

      const pending = await getPendingReports()
      assert.equal(pending.length, 1)
      assert.equal(pending[0].status, 'pending')
    })
  })

  describe('getReports', () => {
    it('filters by status', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)
      const report = await submitReport('r1', 'u2', 'Spam')
      await processReport(report.id, 'approved', 'admin1', 'Confirmed spam')

      const approved = await getReports('approved')
      assert.equal(approved.length, 1)

      const pending = await getReports('pending')
      assert.equal(pending.length, 0)
    })
  })

  describe('processReport', () => {
    it('approves report and hides review', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)
      const report = await submitReport('r1', 'u2', 'Spam')

      const resolved = await processReport(report.id, 'approved', 'admin1', 'Confirmed spam')
      assert.equal(resolved.status, 'approved')
      assert.equal(resolved.adminId, 'admin1')
      assert.equal(resolved.adminNote, 'Confirmed spam')
      assert.ok(resolved.resolvedAt)

      const updatedReview = await storageService.getReviewById('r1')
      assert.equal(updatedReview.status, 'hidden')
    })

    it('rejects report without hiding review', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)
      const report = await submitReport('r1', 'u2', 'Spam')

      const resolved = await processReport(report.id, 'rejected', 'admin1', 'Not spam')
      assert.equal(resolved.status, 'rejected')

      const updatedReview = await storageService.getReviewById('r1')
      assert.equal(updatedReview.status, 'published')
    })

    it('throws for invalid decision', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)
      const report = await submitReport('r1', 'u2', 'Spam')

      await assert.rejects(
        async () => processReport(report.id, 'invalid', 'admin1', 'note'),
        /Invalid decision/
      )
    })

    it('throws for already resolved report', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)
      const report = await submitReport('r1', 'u2', 'Spam')
      await processReport(report.id, 'approved', 'admin1', 'note')

      await assert.rejects(
        async () => processReport(report.id, 'rejected', 'admin1', 'note'),
        /already resolved/
      )
    })

    it('throws for nonexistent report', async () => {
      await assert.rejects(
        async () => processReport('nonexistent', 'approved', 'admin1', 'note'),
        /Report not found/
      )
    })
  })

  describe('getReport', () => {
    it('returns report by id', async () => {
      const review = new Review({ id: 'r1', userId: 'u1', title: 'Bad review' })
      await storageService.createReview(review)
      const report = await submitReport('r1', 'u2', 'Spam')

      const found = await getReport(report.id)
      assert.ok(found)
      assert.equal(found.id, report.id)
    })

    it('returns null for nonexistent report', async () => {
      const found = await getReport('nonexistent')
      assert.equal(found, null)
    })
  })
})

