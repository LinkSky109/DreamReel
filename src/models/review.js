/**
 * Review model representing a movie review with four-dimension scoring.
 * T17-006 baseline model.
 */
export class Review {
  constructor(data) {
    this.id = data.id || generateId()
    this.userId = data.userId
    this.movieId = data.movieId
    this.title = data.title || ''
    this.content = data.content || ''

    // Four-dimension scoring (T17-006 baseline)
    this.storyScore = clampScore(data.storyScore)
    this.visualScore = clampScore(data.visualScore)
    this.performanceScore = clampScore(data.performanceScore)
    this.soundtrackScore = clampScore(data.soundtrackScore)

    this.overallScore = this._computeOverallScore()

    // Scene-by-scene analysis (T17-006 baseline)
    this.sceneAnalysis = data.sceneAnalysis || []

    // Share card info
    this.shareCard = data.shareCard || null

    // Interaction counters
    this.likeCount = data.likeCount || 0
    this.commentCount = data.commentCount || 0
    this.favoriteCount = data.favoriteCount || 0

    // Timestamps
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || this.createdAt

    // Status
    this.status = data.status || 'published' // published | hidden | deleted
  }

  _computeOverallScore() {
    return Number(
      ((this.storyScore + this.visualScore + this.performanceScore + this.soundtrackScore) / 4).toFixed(1)
    )
  }

  incrementLikes() {
    this.likeCount++
    this.updatedAt = new Date().toISOString()
  }

  decrementLikes() {
    this.likeCount = Math.max(0, this.likeCount - 1)
    this.updatedAt = new Date().toISOString()
  }

  incrementComments() {
    this.commentCount++
    this.updatedAt = new Date().toISOString()
  }

  incrementFavorites() {
    this.favoriteCount++
    this.updatedAt = new Date().toISOString()
  }

  decrementFavorites() {
    this.favoriteCount = Math.max(0, this.favoriteCount - 1)
    this.updatedAt = new Date().toISOString()
  }
}

function generateId() {
  return `rev_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

function clampScore(score) {
  const n = Number(score)
  if (Number.isNaN(n)) return 0
  return Math.max(0, Math.min(10, n))
}

