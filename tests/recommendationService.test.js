import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { storageService } from '../src/services/storageService.js'
import {
  cosineSimilarity,
  tagOverlapScore,
  computeRecommendationScore,
  getRecommendations,
} from '../src/services/recommendationService.js'
import { User } from '../src/models/user.js'
import { Review } from '../src/models/review.js'

describe('Recommendation Service', () => {
  beforeEach(async () => {
    await storageService.clearAll()
  })

  describe('cosineSimilarity', () => {
    it('returns 1 for identical vectors', () => {
      const a = { story: 8, visual: 8, performance: 8, soundtrack: 8 }
      assert.equal(cosineSimilarity(a, a), 1)
    })

    it('returns 0 for orthogonal vectors', () => {
      const a = { story: 1, visual: 0, performance: 0, soundtrack: 0 }
      const b = { story: 0, visual: 1, performance: 0, soundtrack: 0 }
      assert.equal(cosineSimilarity(a, b), 0)
    })

    it('returns 0 for zero vectors', () => {
      const a = { story: 0, visual: 0, performance: 0, soundtrack: 0 }
      const b = { story: 8, visual: 8, performance: 8, soundtrack: 8 }
      assert.equal(cosineSimilarity(a, b), 0)
    })

    it('works with score properties', () => {
      const a = { storyScore: 8, visualScore: 6, performanceScore: 7, soundtrackScore: 9 }
      const b = { storyScore: 8, visualScore: 6, performanceScore: 7, soundtrackScore: 9 }
      assert.equal(cosineSimilarity(a, b), 1)
    })
  })

  describe('tagOverlapScore', () => {
    it('returns 1 for exact match', () => {
      assert.equal(tagOverlapScore(['sci-fi', 'action'], ['sci-fi', 'action']), 1)
    })

    it('returns 0.5 for half match', () => {
      assert.equal(tagOverlapScore(['sci-fi', 'action'], ['sci-fi', 'drama']), 0.5)
    })

    it('is case insensitive', () => {
      assert.equal(tagOverlapScore(['Sci-Fi'], ['sci-fi']), 1)
    })

    it('returns 0 for no overlap', () => {
      assert.equal(tagOverlapScore(['sci-fi'], ['romance']), 0)
    })
  })

  describe('computeRecommendationScore', () => {
    it('scores higher for matching tags and similar scores', () => {
      const user = new User({ preferenceTags: ['sci-fi', 'action'], scoreStyle: { story: 8, visual: 9, performance: 7, soundtrack: 6 } })
      const reviewMatch = new Review({ storyScore: 8, visualScore: 9, performanceScore: 7, soundtrackScore: 6, movieTags: ['sci-fi', 'action'], likeCount: 10, commentCount: 5, favoriteCount: 2 })
      const reviewMismatch = new Review({ storyScore: 3, visualScore: 4, performanceScore: 5, soundtrackScore: 6, movieTags: ['romance', 'drama'], likeCount: 0, commentCount: 0, favoriteCount: 0 })

      const scoreMatch = computeRecommendationScore(user, reviewMatch)
      const scoreMismatch = computeRecommendationScore(user, reviewMismatch)
      assert.ok(scoreMatch > scoreMismatch)
    })
  })

  describe('getRecommendations', () => {
    it('throws for nonexistent user', async () => {
      await assert.rejects(
        async () => getRecommendations('nonexistent'),
        /User not found/
      )
    })

    it('excludes user own reviews', async () => {
      const user = new User({ id: 'u1', preferenceTags: ['sci-fi'], scoreStyle: { story: 8, visual: 8, performance: 8, soundtrack: 8 } })
      await storageService.createUser(user)

      const ownReview = new Review({ id: 'r1', userId: 'u1', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8, movieTags: ['sci-fi'] })
      const otherReview = new Review({ id: 'r2', userId: 'u2', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8, movieTags: ['sci-fi'] })
      await storageService.createReview(ownReview)
      await storageService.createReview(otherReview)

      const recs = await getRecommendations('u1')
      assert.equal(recs.length, 1)
      assert.equal(recs[0].reviewId, 'r2')
    })

    it('returns highest scored first', async () => {
      const user = new User({ id: 'u1', preferenceTags: ['sci-fi'], scoreStyle: { story: 8, visual: 8, performance: 8, soundtrack: 8 } })
      await storageService.createUser(user)

      const goodMatch = new Review({ id: 'r1', userId: 'u2', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8, movieTags: ['sci-fi'], likeCount: 50 })
      const poorMatch = new Review({ id: 'r2', userId: 'u3', storyScore: 2, visualScore: 2, performanceScore: 2, soundtrackScore: 2, movieTags: ['romance'], likeCount: 0 })
      await storageService.createReview(goodMatch)
      await storageService.createReview(poorMatch)

      const recs = await getRecommendations('u1')
      assert.equal(recs[0].reviewId, 'r1')
      assert.equal(recs[1].reviewId, 'r2')
    })

    it('respects limit parameter', async () => {
      const user = new User({ id: 'u1', preferenceTags: ['sci-fi'], scoreStyle: { story: 8, visual: 8, performance: 8, soundtrack: 8 } })
      await storageService.createUser(user)

      for (let i = 0; i < 5; i++) {
        await storageService.createReview(new Review({ id: `r${i}`, userId: 'u2', storyScore: 8, visualScore: 8, performanceScore: 8, soundtrackScore: 8, movieTags: ['sci-fi'] }))
      }

      const recs = await getRecommendations('u1', 3)
      assert.equal(recs.length, 3)
    })
  })
})

