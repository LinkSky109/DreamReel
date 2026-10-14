import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import logger from '../utils/logger.js'

const DATA_DIR = path.resolve(config.storage.path, 'data')
const DATA_FILE = path.join(DATA_DIR, 'db.json')

// 确保目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

/**
 * 简单 JSON 文件持久化层
 * - 内存中维护完整数据快照
 * - 写入时异步落盘（debounce）
 * - 启动时自动加载
 * - 原子写入（tmp + rename）
 */
class StorageService {
  constructor() {
    this.data = {
      projects: {},
      users: {},
      usage: {},
      meta: { version: 1, createdAt: new Date().toISOString() },
    }
    this.saveTimer = null
    this.saveDelay = 500 // ms debounce
    this.load()
  }

  /**
   * 从磁盘加载数据
   */
  load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8')
        const parsed = JSON.parse(raw)
        this.data = { ...this.data, ...parsed }
        // 规范化：projects/users/usage 必须为以 id 为键的对象（兼容历史数组格式）
        this.data.projects = this._normalizeKeyed(this.data.projects)
        this.data.users = this._normalizeKeyed(this.data.users)
        this.data.usage = this._normalizeKeyed(this.data.usage)
        this.data.teams = this._normalizeKeyed(this.data.teams)
        // R30：剧场厂牌
        this.data.studios = this._normalizeKeyed(this.data.studios)
        // R32：图片生成资产
        this.data.imageAssets = this._normalizeKeyed(this.data.imageAssets)
        const projectCount = Object.keys(this.data.projects).length
        logger.info(`Storage loaded: ${projectCount} projects from ${DATA_FILE}`)
      } else {
        logger.info('No existing data file, starting fresh')
      }
    } catch (error) {
      logger.error('Failed to load storage data:', error.message)
      logger.info('Starting with empty data (old file will be backed up)')
      // 备份损坏的文件
      if (fs.existsSync(DATA_FILE)) {
        const backupPath = `${DATA_FILE}.corrupt_${Date.now()}`
        fs.renameSync(DATA_FILE, backupPath)
        logger.info(`Corrupted file backed up to ${backupPath}`)
      }
    }
  }

  /**
   * 将数组/对象统一规范化为以 id 为键的对象
   */
  _normalizeKeyed(value) {
    if (!value) return {}
    if (Array.isArray(value)) {
      const map = {}
      for (const item of value) {
        if (item && item.id) map[item.id] = item
      }
      return map
    }
    return value
  }

  /**
   * 保存到磁盘（debounced）
   */
  save() {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this._flush()
    }, this.saveDelay)
  }

  /**
   * 立即写入磁盘（原子写入）
   */
  _flush() {
    try {
      const tmpFile = `${DATA_FILE}.tmp`
      fs.writeFileSync(tmpFile, JSON.stringify(this.data, null, 2), 'utf-8')
      fs.renameSync(tmpFile, DATA_FILE)
      logger.debug(`Storage flushed: ${Object.keys(this.data.projects).length} projects`)
    } catch (error) {
      logger.error('Failed to flush storage:', error.message)
    }
  }
  /**
   * Clear all data (for testing).
   */
  clearAll() {
    this.data = {
      projects: {},
      users: {},
      usage: {},
      teams: {},
      studios: {},
      imageAssets: {},
      reviews: {},
      comments: {},
      notifications: {},
      reports: {},
      novelProjects: {},
      novelChunks: {},
      novelCharacters: {},
      novelCharacterStates: {},
      seriesSeasons: {},
      seriesEpisodes: {},
      novelWorldEntities: {},
      characterSets: {},
      worldSets: {},
      meta: { version: 1, createdAt: new Date().toISOString() },
    }
    this.save()
  }

  // ============ Generic collections ============

  get(key) {
    return this.data[key] || null
  }

  set(key, value) {
    this.data[key] = value
    this.save()
  }

  // ============ Projects ============

  getProject(projectId) {
    return this.data.projects[projectId] || null
  }

  saveProject(project) {
    this.data.projects[project.id] = project
    this.save()
  }

  deleteProject(projectId) {
    delete this.data.projects[projectId]
    this.save()
  }

  listProjects(filters = {}) {
    let list = Object.values(this.data.projects)
    if (filters.userId) {
      list = list.filter((p) => p.userId === filters.userId)
    }
    return list
  }

  // ============ Users & Usage ============

  getUser(userId) {
    if (!this.data.users[userId]) {
      this.data.users[userId] = {
        id: userId,
        createdAt: new Date().toISOString(),
        plan: 'free',
      }
      this.save()
    }
    return this.data.users[userId]
  }

  getUsage(userId) {
    const today = new Date().toISOString().slice(0, 10)
    const month = today.slice(0, 7)
    if (!this.data.usage[userId]) {
      this.data.usage[userId] = {}
    }
    if (!this.data.usage[userId][today]) {
      this.data.usage[userId][today] = { videoGenerations: 0, imageGenerations: 0 }
    }
    if (this.data.usage[userId][today].imageGenerations === undefined) {
      this.data.usage[userId][today].imageGenerations = 0
    }
    if (!this.data.usage[userId][month]) {
      this.data.usage[userId][month] = { dubbingSeconds: 0 }
    }
    return {
      daily: this.data.usage[userId][today],
      monthly: this.data.usage[userId][month],
      date: today,
      month,
    }
  }

  incrementUsage(userId, type, amount = 1) {
    const usage = this.getUsage(userId)
    if (type === 'video') {
      usage.daily.videoGenerations += amount
    } else if (type === 'image') {
      usage.daily.imageGenerations += amount
    } else if (type === 'dubbing') {
      usage.monthly.dubbingSeconds += amount
    }
    this.save()
    return usage
  }

  /**
   * 清理过期的用量记录（保留最近 30 天）
   */
  cleanupOldUsage() {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    for (const userId of Object.keys(this.data.usage)) {
      for (const date of Object.keys(this.data.usage[userId])) {
        if (date < cutoff && !date.includes('-') === false) {
          // 保留 YYYY-MM 格式的月度记录
          if (date.length === 10 && date < cutoff) {
            delete this.data.usage[userId][date]
          }
        }
      }
    }
    this.save()
  }

  // ============ Users (explicit CRUD for community features) ============

  createUser(user) {
    this.data.users[user.id] = user
    this.save()
    return user
  }

  getUserById(userId) {
    return this.data.users[userId] || null
  }

  // ============ Reviews ============

  createReview(review) {
    if (!this.data.reviews) this.data.reviews = {}
    this.data.reviews[review.id] = review
    this.save()
    return review
  }

  getReviewById(reviewId) {
    if (!this.data.reviews) return null
    return this.data.reviews[reviewId] || null
  }

  getAllReviews() {
    if (!this.data.reviews) return []
    return Object.values(this.data.reviews)
  }

  updateReview(review) {
    if (!this.data.reviews) this.data.reviews = {}
    this.data.reviews[review.id] = review
    this.save()
    return review
  }

  // ============ Reports ============

  createReport(report) {
    if (!this.data.reports) this.data.reports = {}
    this.data.reports[report.id] = report
    this.save()
    return report
  }

  getReportById(reportId) {
    if (!this.data.reports) return null
    return this.data.reports[reportId] || null
  }

  getReportsByStatus(status) {
    if (!this.data.reports) return []
    return Object.values(this.data.reports).filter((r) => r.status === status)
  }

  getAllReports() {
    if (!this.data.reports) return []
    return Object.values(this.data.reports)
  }

  updateReport(report) {
    if (!this.data.reports) this.data.reports = {}
    this.data.reports[report.id] = report
    this.save()
    return report
  }

  // ============ Community notifications ============

  createNotification(notification) {
    if (!this.data.notifications) this.data.notifications = {}
    this.data.notifications[notification.id] = notification
    this.save()
    return notification
  }

  getNotificationById(id) {
    if (!this.data.notifications) return null
    return this.data.notifications[id] || null
  }

  getNotificationsByUser(userId) {
    if (!this.data.notifications) return []
    return Object.values(this.data.notifications).filter((n) => n.userId === userId)
  }

  updateNotification(notification) {
    if (!this.data.notifications) this.data.notifications = {}
    this.data.notifications[notification.id] = notification
    this.save()
    return notification
  }

  // ============ Novel series（小说→剧集） ============

  createNovelProject(project) {
    if (!this.data.novelProjects) this.data.novelProjects = {}
    this.data.novelProjects[project.id] = project
    this.save()
    return project
  }

  getNovelProject(id) {
    if (!this.data.novelProjects) return null
    return this.data.novelProjects[id] || null
  }

  listNovelProjects() {
    if (!this.data.novelProjects) return []
    return Object.values(this.data.novelProjects)
  }

  updateNovelProject(project) {
    if (!this.data.novelProjects) this.data.novelProjects = {}
    this.data.novelProjects[project.id] = project
    this.save()
    return project
  }

  createNovelChunk(chunk) {
    if (!this.data.novelChunks) this.data.novelChunks = {}
    this.data.novelChunks[chunk.id] = chunk
    this.save()
    return chunk
  }

  getNovelChunk(id) {
    if (!this.data.novelChunks) return null
    return this.data.novelChunks[id] || null
  }

  listNovelChunks(novelId) {
    if (!this.data.novelChunks) return []
    return Object.values(this.data.novelChunks).filter((c) => c.novelId === novelId)
  }

  createNovelCharacter(character) {
    if (!this.data.novelCharacters) this.data.novelCharacters = {}
    this.data.novelCharacters[character.id] = character
    this.save()
    return character
  }

  getNovelCharacter(id) {
    if (!this.data.novelCharacters) return null
    return this.data.novelCharacters[id] || null
  }

  listNovelCharacters(novelId) {
    if (!this.data.novelCharacters) return []
    return Object.values(this.data.novelCharacters).filter((c) => c.novelId === novelId)
  }

  updateNovelCharacter(character) {
    if (!this.data.novelCharacters) this.data.novelCharacters = {}
    this.data.novelCharacters[character.id] = character
    this.save()
    return character
  }

  createNovelCharacterState(state) {
    if (!this.data.novelCharacterStates) this.data.novelCharacterStates = {}
    this.data.novelCharacterStates[state.id] = state
    this.save()
    return state
  }

  listNovelCharacterStates(novelId, characterId) {
    if (!this.data.novelCharacterStates) return []
    return Object.values(this.data.novelCharacterStates).filter(
      (s) => s.novelId === novelId && (!characterId || s.characterId === characterId)
    )
  }

  // ============ Seasons / Episodes（分季分集） ============

  createSeason(season) {
    if (!this.data.seriesSeasons) this.data.seriesSeasons = {}
    this.data.seriesSeasons[season.id] = season
    this.save()
    return season
  }

  listSeasons(novelId) {
    if (!this.data.seriesSeasons) return []
    return Object.values(this.data.seriesSeasons).filter((s) => s.novelId === novelId)
  }

  getSeason(id) {
    if (!this.data.seriesSeasons) return null
    return this.data.seriesSeasons[id] || null
  }

  createEpisode(episode) {
    if (!this.data.seriesEpisodes) this.data.seriesEpisodes = {}
    this.data.seriesEpisodes[episode.id] = episode
    this.save()
    return episode
  }

  listEpisodes(novelId, seasonId) {
    if (!this.data.seriesEpisodes) return []
    return Object.values(this.data.seriesEpisodes).filter(
      (e) => e.novelId === novelId && (!seasonId || e.seasonId === seasonId)
    )
  }

  getEpisode(id) {
    if (!this.data.seriesEpisodes) return null
    return this.data.seriesEpisodes[id] || null
  }

  updateEpisode(episode) {
    if (!this.data.seriesEpisodes) this.data.seriesEpisodes = {}
    this.data.seriesEpisodes[episode.id] = episode
    this.save()
    return episode
  }

  // ============ Worldbuilding（世界观实体） ============

  createWorldEntity(entity) {
    if (!this.data.novelWorldEntities) this.data.novelWorldEntities = {}
    this.data.novelWorldEntities[entity.id] = entity
    this.save()
    return entity
  }

  getWorldEntity(id) {
    if (!this.data.novelWorldEntities) return null
    return this.data.novelWorldEntities[id] || null
  }

  listWorldEntities(novelId) {
    if (!this.data.novelWorldEntities) return []
    return Object.values(this.data.novelWorldEntities).filter((e) => e.novelId === novelId)
  }

  updateWorldEntity(entity) {
    if (!this.data.novelWorldEntities) this.data.novelWorldEntities = {}
    this.data.novelWorldEntities[entity.id] = entity
    this.save()
    return entity
  }

  // ============ 备选集合（角色/世界观多次生成） ============

  createCharacterSet(set) {
    if (!this.data.characterSets) this.data.characterSets = {}
    this.data.characterSets[set.id] = set
    this.save()
    return set
  }

  getCharacterSet(id) {
    if (!this.data.characterSets) return null
    return this.data.characterSets[id] || null
  }

  createWorldSet(set) {
    if (!this.data.worldSets) this.data.worldSets = {}
    this.data.worldSets[set.id] = set
    this.save()
    return set
  }

  getWorldSet(id) {
    if (!this.data.worldSets) return null
    return this.data.worldSets[id] || null
  }
}

export const storageService = new StorageService()
export default storageService
