import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { storageService } from '../src/services/storageService.js'
import { getLeaderboard, computeHeat, computeTimeDecay } from '../src/services/rankingService.js'
import { Review } from '../src/models/review.js'

describe('Ranking Service', () => {
  beforeEach(async () => {
    await storageService.clearAll()
  })

  describe('computeTimeDecay', () => {
    it('returns 1 for fresh content', () => {
      const now = new Date().toISOString()
      assert.equal(computeTimeDecay(now, 'daily'), 1)
    })

    it('decays older content', () => {
      const old = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
      const decay = computeTimeDecay(old, 'daily')
      assert.ok(decay < 1 && decay > 0)
    })

    it('uses different half-lives per period', () => {
      const old = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString()
      const dailyDecay = computeTimeDecay(old, 'daily')
      const weeklyDecay = computeTimeDecay(old, 'weekly')
      assert.ok(dailyDecay < weeklyDecay, 'daily should decay faster than weekly')
    })
  })

  describe('computeHeat', () => {
    it('computes heat based on score and interactions', () => {
      const review = new Review({
        storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8,
        likeCount: 10, commentCount: 5, favoriteCount: 2,
        createdAt: new Date().toISOString(),
      })
      const heat = computeHeat(review, 'weekly')
      assert.ok(heat > 0)
    })

    it('applies time decay', () => {
      const fresh = new Review({
        storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8,
        likeCount: 10, commentCount: 5, favoriteCount: 2,
        createdAt: new Date().toISOString(),
      })
      const stale = new Review({
        storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8,
        likeCount: 10, commentCount: 5, favoriteCount: 2,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      })
      assert.ok(computeHeat(fresh, 'weekly') > computeHeat(stale, 'weekly'))
    })
  })

  describe('getLeaderboard', () => {
    it('returns empty array when no reviews exist', async () => {
      const result = await getLeaderboard('weekly')
      assert.equal(result.length, 0)
    })

    it('returns sorted leaderboard', async () => {
      const now = Date.now()
      const r1 = new Review({
        id: 'r1', storyScore: 10, visualScore: 10, performanceScore: 10, soundtrackScore: 10,
        likeCount: 100, commentCount: 50, favoriteCount: 30,
        createdAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      })
      const r2 = new Review({
        id: 'r2', storyScore: 5, visualScore: 5, performanceScore: 5, soundtrackScore: 5,
        likeCount: 1, commentCount: 0, favoriteCount: 0,
        createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      })
      await storageService.createReview(r1)
      await storageService.createReview(r2)

      const result = await getLeaderboard('weekly', 10)
      assert.equal(result.length, 2)
      assert.equal(result[0].rank, 1)
      assert.equal(result[0].reviewId, 'r1')
      assert.equal(result[1].reviewId, 'r2')
      assert.ok(result[0].heat > result[1].heat)
    })

    it('filters by period cutoff', async () => {
      const now = Date.now()
      const fresh = new Review({
        id: 'fresh', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8,
        likeCount: 10, commentCount: 5, favoriteCount: 2,
        createdAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      })
      const stale = new Review({
        id: 'stale', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8,
        likeCount: 10, commentCount: 5, favoriteCount: 2,
        createdAt: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
      })
      await storageService.createReview(fresh)
      await storageService.createReview(stale)

      const daily = await getLeaderboard('daily')
      assert.equal(daily.length, 1)
      assert.equal(daily[0].reviewId, 'fresh')

      const monthly = await getLeaderboard('monthly')
      assert.equal(monthly.length, 2)
    })

    it('excludes hidden/deleted reviews', async () => {
      const r1 = new Review({
        id: 'r1', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8,
        likeCount: 10, commentCount: 5, favoriteCount: 2,
        status: 'hidden',
        createdAt: new Date().toISOString(),
      })
      await storageService.createReview(r1)
      const result = await getLeaderboard('weekly')
      assert.equal(result.length, 0)
    })

    it('rejects invalid period', async () => {
      await assert.rejects(
        async () => getLeaderboard('yearly'),
        /Invalid period/
      )
    })
  })
})

