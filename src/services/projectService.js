import { Project} from '../models/project.js'
import { Character } from '../models/character.js'
import { Scene } from '../models/scene.js'
import { Shot } from '../models/shot.js'
import { storageService } from './storageService.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import fs from 'fs'
import path from 'path'

const STORAGE_DIR = path.resolve(config.storage.path)

/**
 * 将纯 JSON 对象还原为 Model 实例
 */
function hydrateProject(data) {
  if (!data) return null

  const project = new Project({
    id: data.id,
    name: data.name,
    description: data.description,
    coverUrl: data.coverUrl,
    status: data.status,
    targetDuration: data.targetDuration,
    style: data.style,
    platform: data.platform,
    script: data.script,
    tags: data.tags,
    isFavorite: data.isFavorite,
    isArchived: data.isArchived,
    userId: data.userId,
    audioConfig: data.audioConfig,
    subtitleStyle: data.subtitleStyle,
    dialogueAssignments: data.dialogueAssignments,
    visualStyle: data.visualStyle,
    isPublished: data.isPublished,
    publishedAt: data.publishedAt,
    likeCount: data.likeCount,
    viewCount: data.viewCount,
    galleryCategory: data.galleryCategory,
    challengeId: data.challengeId,
    teamId: data.teamId,
    providerPreferences: data.providerPreferences,
    // R29：导演模式；R30：所属厂牌
    directorMode: data.directorMode,
    studioId: data.studioId,
    editPlan: data.editPlan,
    lastAccessedAt: data.lastAccessedAt,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  })

  // 还原角色
  project.characters = (data.characters || []).map(
    (c) =>
      new Character({
        id: c.id,
        name: c.name,
        description: c.description,
        referenceImages: c.referenceImages,
        featureVector: c.featureVector,
        projectId: c.projectId,
        // R26 修复：还原造型室字段，避免服务重启后造型丢失
        wardrobe: c.wardrobe,
        makeup: c.makeup,
        styling: c.styling,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })
  )

  // 还原场景
  project.scenes = (data.scenes || []).map(
    (s) =>
      new Scene({
        id: s.id,
        name: s.name,
        description: s.description,
        referenceImages: s.referenceImages,
        environmentType: s.environmentType,
        projectId: s.projectId,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })
  )

  // 还原镜头
  project.shots = (data.shots || []).map(
    (s) =>
      new Shot({
        id: s.id,
        projectId: s.projectId,
        index: s.index,
        shotType: s.shotType,
        description: s.description,
        dialogue: s.dialogue,
        narration: s.narration,
        duration: s.duration,
        cameraMovement: s.cameraMovement,
        characterIds: s.characterIds,
        sceneId: s.sceneId,
        referenceImages: s.referenceImages,
        videoUrl: s.videoUrl,
        status: s.status,
        consistencyScore: s.consistencyScore,
        prompt: s.prompt,
        model: s.model,
        errorMessage: s.errorMessage,
        locked: s.locked || false,
        versions: s.versions || [],
        characterActions: s.characterActions || {},
        directorGuidance: s.directorGuidance || '',
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })
  )

  return project
}

/**
 * 项目管理 Service
 * 内存运行 + JSON 文件持久化
 */
export class ProjectService {
  constructor() {
    this.projects = new Map()
    this.recycleBin = new Map() // id -> { project, deletedAt, deletedBy }
    this.maxRecycleBinItems = 100
    this._loadFromStorage()
  }

  _loadFromStorage() {
    const allProjects = storageService.listProjects()
    for (const data of allProjects) {
      const project = hydrateProject(data)
      if (project) {
        this.projects.set(project.id, project)
      }
    }
    logger.info(`ProjectService loaded ${this.projects.size} projects from storage`)
  }

  _persist(project) {
    storageService.saveProject(project.toJSON())
  }

  /**
   * 创建项目
   */
  async createProject({ name, description, targetDuration, style, platform, tags, isFavorite, isArchived, userId }) {
    try {
      const project = new Project({
        name,
        description,
        targetDuration,
        style,
        platform,
        tags,
        isFavorite,
        isArchived,
        userId: userId || 'default',
      })
      this.projects.set(project.id, project)
      this._persist(project)
      logger.info(`Project created: ${project.id} - ${project.name}`)
      return project
    } catch (error) {
      logger.error('Failed to create project:', error.message)
      throw error
    }
  }

  /**
   * 获取项目
   */
  async getProject(projectId) {
    const project = this.projects.get(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }
    return project
  }

  /**
   * 记录项目访问
   */
  async recordAccess(projectId) {
    const project = await this.getProject(projectId)
    project.recordAccess()
    this._persist(project)
    return project.lastAccessedAt
  }

  /**
   * 获取最近访问的项目
   */
  async getRecentProjects(userId, limit = 5) {
    const result = await this.listProjects({
      userId,
      sort: 'lastAccessedAt',
      limit,
      archived: 'active',
    })
    return result.items.filter((p) => p.lastAccessedAt)
  }

  /**
   * 更新项目
   */
  async updateProject(projectId, updates) {
    const project = await this.getProject(projectId)
    const allowedFields = [
      'name',
      'coverUrl',
      'status',
      'targetDuration',
      'style',
      'platform',
      'script',
      'shots',
      'characters',
      'scenes',
      'templateId',
      'lastAnalysis',
      'tags',
      'audioConfig',
      'subtitleStyle',
      'dialogueAssignments',
      'visualStyle',
      'isPublished',
      'publishedAt',
      'likeCount',
      'viewCount',
      'galleryCategory',
      'challengeId',
      'teamId',
      'directorMode',
      'studioId',
      'providerPreferences',
    ]
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        project[field] = updates[field]
      }
    }
    project.updatedAt = new Date().toISOString()
    this._persist(project)
    return project
  }

  /**
   * R34：仅允许剪辑服务写入 editPlan
   */
  async setEditPlan(projectId, plan) {
    const project = await this.getProject(projectId)
    project.editPlan = plan
    project.updatedAt = new Date().toISOString()
    this._persist(project)
    return project.editPlan
  }

  /**
   * 批量更新镜头顺序
   * @param {string} projectId
   * @param {string[]} shotIds - 按新顺序排列的镜头ID数组
   */
  async updateShotOrder(projectId, shotIds) {
    const project = await this.getProject(projectId)
    if (!project.shots || project.shots.length === 0) {
      throw new Error('Project has no shots')
    }

    // 验证所有 shotId 都存在
    const existingIds = new Set(project.shots.map((s) => s.id))
    for (const id of shotIds) {
      if (!existingIds.has(id)) {
        throw new Error(`Shot ${id} not found in project`)
      }
    }

    // 按新顺序重新排列
    const shotMap = new Map(project.shots.map((s) => [s.id, s]))
    project.shots = shotIds.map((id, index) => {
      const shot = shotMap.get(id)
      shot.index = index
      return shot
    })

    project.updatedAt = new Date().toISOString()
    this._persist(project)
    return project
  }

  /**
   * 更新单个镜头时长
   */
  async updateShotDuration(projectId, shotId, duration) {
    const project = await this.getProject(projectId)
    const shot = project.shots.find((s) => s.id === shotId)
    if (!shot) {
      throw new Error(`Shot ${shotId} not found`)
    }
    if (shot.locked) {
      throw new Error('Shot is locked')
    }
    const newDuration = Math.max(1, Math.min(30, parseInt(duration, 10) || 5))
    shot.duration = newDuration
    shot.updatedAt = new Date().toISOString()
    project.updatedAt = new Date().toISOString()
    this._persist(project)
    return shot
  }

  /**
   * 删除项目（软删除，移到回收站）
   */
  async deleteProject(projectId, { deletedBy = 'default' } = {}) {
    const project = this.projects.get(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    // 从活跃项目中移除
    this.projects.delete(projectId)

    // 移到回收站
    this.recycleBin.set(projectId, {
      project: project.toJSON(),
      deletedAt: new Date().toISOString(),
      deletedBy,
    })

    // 从存储中移除（但保留在内存回收站中）
    storageService.deleteProject(projectId)

    // 限制回收站大小
    if (this.recycleBin.size > this.maxRecycleBinItems) {
      const oldestKey = this.recycleBin.keys().next().value
      this.recycleBin.delete(oldestKey)
    }

    logger.info(`Project moved to recycle bin: ${projectId} (${project.name})`)
    return { success: true, message: '项目已移到回收站' }
  }

  /**
   * 列出回收站项目
   */
  listRecycleBin({ userId, limit = 50, offset = 0 } = {}) {
    let list = Array.from(this.recycleBin.values())

    if (userId) {
      list = list.filter((item) => item.project.userId === userId)
    }

    // 按删除时间倒序
    list.sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt))

    const total = list.length
    const items = list.slice(offset, offset + limit).map((item) => ({
      ...item.project,
      deletedAt: item.deletedAt,
      deletedBy: item.deletedBy,
    }))

    return { total, items }
  }

  /**
   * 从回收站恢复项目
   */
  restoreProject(projectId) {
    const item = this.recycleBin.get(projectId)
    if (!item) {
      throw new Error(`项目不在回收站中: ${projectId}`)
    }

    // 还原为 Model 实例
    const project = hydrateProject(item.project)
    if (!project) {
      throw new Error(`项目数据损坏，无法恢复: ${projectId}`)
    }

    // 更新时间
    project.updatedAt = new Date().toISOString()

    // 移回活跃项目
    this.projects.set(projectId, project)
    this.recycleBin.delete(projectId)

    // 持久化
    this._persist(project)

    logger.info(`Project restored from recycle bin: ${projectId} (${project.name})`)
    return { success: true, project: project.toJSON() }
  }

  /**
   * 永久删除项目（从回收站彻底删除）
   */
  permanentlyDeleteProject(projectId) {
    const item = this.recycleBin.get(projectId)
    if (!item) {
      throw new Error(`项目不在回收站中: ${projectId}`)
    }

    // 清理关联文件
    this._cleanupProjectFiles(projectId)

    // 从回收站移除
    this.recycleBin.delete(projectId)

    logger.info(`Project permanently deleted: ${projectId} (${item.project.name})`)
    return { success: true, message: '项目已永久删除' }
  }

  /**
   * 清空回收站
   */
  emptyRecycleBin({ userId } = {}) {
    let count = 0
    const toDelete = []

    for (const [id, item] of this.recycleBin.entries()) {
      if (!userId || item.project.userId === userId) {
        toDelete.push(id)
      }
    }

    for (const id of toDelete) {
      this._cleanupProjectFiles(id)
      this.recycleBin.delete(id)
      count++
    }

    logger.info(`Recycle bin emptied: ${count} projects permanently deleted`)
    return { success: true, deletedCount: count }
  }

  /**
   * 获取回收站统计
   */
  getRecycleBinStats({ userId } = {}) {
    let list = Array.from(this.recycleBin.values())
    if (userId) {
      list = list.filter((item) => item.project.userId === userId)
    }
    return {
      total: list.length,
      oldestDeletedAt: list.length > 0 ? list[list.length - 1].deletedAt : null,
      newestDeletedAt: list.length > 0 ? list[0].deletedAt : null,
    }
  }

  /**
   * 列出项目
   */
  async listProjects({ userId, limit = 20, offset = 0, search, status, style, platform, tag, favorite, archived, sort = 'updatedAt' }) {
    let list = Array.from(this.projects.values())

    // 按用户筛选
    if (userId) {
      list = list.filter((p) => p.userId === userId)
    }

    // 按归档筛选（默认排除归档项目）
    if (archived === true || archived === 'true') {
      list = list.filter((p) => p.isArchived === true)
    } else if (archived !== 'all') {
      list = list.filter((p) => p.isArchived !== true)
    }

    // 按收藏筛选
    if (favorite === true || favorite === 'true') {
      list = list.filter((p) => p.isFavorite === true)
    }

    // 按标签筛选
    if (tag) {
      const tagLower = tag.toLowerCase()
      list = list.filter((p) => p.tags && p.tags.includes(tagLower))
    }

    // 按名称搜索
    if (search) {
      const searchLower = search.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(searchLower) ||
        (p.description && p.description.toLowerCase().includes(searchLower))
      )
    }

    // 按状态筛选
    if (status && status !== 'all') {
      list = list.filter((p) => {
        const totalShots = p.shots?.length || 0
        const completedShots = p.shots?.filter((s) => s.status === 'completed').length || 0
        if (status === 'completed') {
          return totalShots > 0 && completedShots === totalShots
        }
        if (status === 'in-progress') {
          return totalShots > 0 && completedShots < totalShots
        }
        if (status === 'empty') {
          return totalShots === 0
        }
        return true
      })
    }

    // 按风格筛选
    if (style && style !== 'all') {
      list = list.filter((p) => (p.style || 'none') === style)
    }

    // 按平台筛选
    if (platform && platform !== 'all') {
      list = list.filter((p) => (p.platform || 'landscape') === platform)
    }

    // 排序
    if (sort === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
    } else if (sort === 'createdAt') {
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    } else if (sort === 'lastAccessedAt') {
      list.sort((a, b) => {
        const aTime = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0
        const bTime = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0
        return bTime - aTime
      })
    } else {
      list.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    }

    return {
      total: list.length,
      items: list.slice(offset, offset + limit).map((p) => p.toJSON()),
    }
  }

  /**
   * 导出项目数据
   */
  async exportProject(projectId) {
    const project = await this.getProject(projectId)
    return {
      ...project.toJSON(),
      exportedAt: new Date().toISOString(),
    }
  }

  /**
   * 获取所有项目的标签集合
   */
  getAllTags(userId) {
    const tagSet = new Set()
    for (const project of this.projects.values()) {
      if (userId && project.userId !== userId) continue
      if (project.tags && Array.isArray(project.tags)) {
        for (const tag of project.tags) {
          tagSet.add(tag)
        }
      }
    }
    return Array.from(tagSet).sort()
  }

  /**
   * 切换项目收藏状态
   */
  async toggleFavorite(projectId) {
    const project = await this.getProject(projectId)
    const isFavorite = project.toggleFavorite()
    this._persist(project)
    logger.info(`Project ${isFavorite ? 'favorited' : 'unfavorited'}: ${projectId}`)
    return { projectId, isFavorite }
  }

  /**
   * 切换项目归档状态
   */
  async toggleArchive(projectId) {
    const project = await this.getProject(projectId)
    const isArchived = project.toggleArchive()
    this._persist(project)
    logger.info(`Project ${isArchived ? 'archived' : 'unarchived'}: ${projectId}`)
    return { projectId, isArchived }
  }

  /**
   * 复制项目（深拷贝剧本、角色、镜头、场景，不复制视频文件）
   */
  async duplicateProject(projectId, { newName, userId } = {}) {
    try {
      const source = await this.getProject(projectId)

      // 深拷贝镜头（重置状态为 pending，清除视频URL）
      const clonedShots = (source.shots || []).map((shot) => ({
        description: shot.description,
        dialogue: shot.dialogue || '',
        narration: shot.narration || '',
        duration: shot.duration || 5,
        shotType: shot.shotType || '',
        cameraMovement: shot.cameraMovement || '',
        characterIds: shot.characterIds ? [...shot.characterIds] : [],
        status: 'pending',
        videoUrl: '',
        consistencyScore: undefined,
        errorMessage: '',
      }))

      // 深拷贝角色（清除参考图，需要重新上传）
      const clonedCharacters = (source.characters || []).map((char) => ({
        name: char.name,
        description: char.description || '',
        appearance: char.appearance || '',
        referenceImages: [],
        locked: false,
      }))

      // 深拷贝场景
      const clonedScenes = (source.scenes || []).map((scene) => ({
        name: scene.name,
        description: scene.description || '',
        referenceImages: [],
      }))

      const duplicated = new Project({
        name: newName || `${source.name} (副本)`,
        description: source.description,
        targetDuration: source.targetDuration,
        style: source.style,
        platform: source.platform,
        script: source.script ? JSON.parse(JSON.stringify(source.script)) : { synopsis: '', shots: [] },
        characters: clonedCharacters,
        scenes: clonedScenes,
        shots: clonedShots,
        tags: source.tags ? [...source.tags] : [],
        isFavorite: false,
        isArchived: false,
        userId: userId || source.userId,
      })

      this.projects.set(duplicated.id, duplicated)
      this._persist(duplicated)
      logger.info(`Project duplicated: ${projectId} -> ${duplicated.id}`)
      return duplicated
    } catch (error) {
      logger.error('Failed to duplicate project:', error.message)
      throw error
    }
  }

  /**
   * 批量删除项目
   */
  async batchDelete(projectIds, userId) {
    const results = { success: [], failed: [] }
    for (const projectId of projectIds) {
      try {
        const project = this.projects.get(projectId)
        if (!project) {
          results.failed.push({ projectId, error: '项目不存在' })
          continue
        }
        if (userId && project.userId !== userId) {
          results.failed.push({ projectId, error: '无权限' })
          continue
        }
        // 清理关联文件
        this._cleanupProjectFiles(project)
        this.projects.delete(projectId)
        storageService.deleteProject(projectId)
        results.success.push(projectId)
      } catch (error) {
        results.failed.push({ projectId, error: error.message })
      }
    }
    logger.info(`Batch delete: ${results.success.length} success, ${results.failed.length} failed`)
    return results
  }

  /**
   * 批量归档/取消归档
   */
  async batchArchive(projectIds, archive, userId) {
    const results = { success: [], failed: [] }
    for (const projectId of projectIds) {
      try {
        const project = this.projects.get(projectId)
        if (!project) {
          results.failed.push({ projectId, error: '项目不存在' })
          continue
        }
        if (userId && project.userId !== userId) {
          results.failed.push({ projectId, error: '无权限' })
          continue
        }
        project.isArchived = archive
        project.updatedAt = new Date().toISOString()
        this._persist(project)
        results.success.push(projectId)
      } catch (error) {
        results.failed.push({ projectId, error: error.message })
      }
    }
    logger.info(`Batch archive(${archive}): ${results.success.length} success, ${results.failed.length} failed`)
    return results
  }

  /**
   * 批量收藏/取消收藏
   */
  async batchFavorite(projectIds, favorite, userId) {
    const results = { success: [], failed: [] }
    for (const projectId of projectIds) {
      try {
        const project = this.projects.get(projectId)
        if (!project) {
          results.failed.push({ projectId, error: '项目不存在' })
          continue
        }
        if (userId && project.userId !== userId) {
          results.failed.push({ projectId, error: '无权限' })
          continue
        }
        project.isFavorite = favorite
        project.updatedAt = new Date().toISOString()
        this._persist(project)
        results.success.push(projectId)
      } catch (error) {
        results.failed.push({ projectId, error: error.message })
      }
    }
    logger.info(`Batch favorite(${favorite}): ${results.success.length} success, ${results.failed.length} failed`)
    return results
  }

  /**
   * 清理项目关联文件
   */
  _cleanupProjectFiles(project) {
    try {
      // 清理视频文件
      if (project.shots) {
        for (const shot of project.shots) {
          if (shot.videoUrl && shot.videoUrl.startsWith('/storage/')) {
            const videoPath = this._resolveStoragePath(shot.videoUrl)
            if (!videoPath) continue
            if (fs.existsSync(videoPath)) {
              fs.unlinkSync(videoPath)
            }
          }
        }
      }
      // 清理缩略图
      if (project.coverUrl && project.coverUrl.startsWith('/storage/')) {
        const thumbPath = this._resolveStoragePath(project.coverUrl)
        if (!thumbPath) return
        if (fs.existsSync(thumbPath)) {
          fs.unlinkSync(thumbPath)
        }
      }
    } catch (error) {
      logger.warn('Cleanup project files failed:', error.message)
    }
  }

  _resolveStoragePath(url) {
    const resolved = path.resolve(STORAGE_DIR, url.replace('/storage/', ''))
    const root = path.resolve(STORAGE_DIR) + path.sep
    return resolved.startsWith(root) ? resolved : null
  }
}

export const projectService = new ProjectService()
export default projectService
