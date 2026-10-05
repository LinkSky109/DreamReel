import { projectService } from './projectService.js'
import logger from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * R09：作品广场服务
 * 发布作品、广场流、点赞、播放统计
 */

const GALLERY_CATEGORIES = [
  { id: 'all', name: '全部' },
  { id: 'short', name: '故事短片' },
  { id: 'ad', name: '产品广告' },
  { id: 'vlog', name: '旅行 Vlog' },
  { id: 'knowledge', name: '知识科普' },
  { id: 'music', name: '音乐可视化' },
  { id: 'promo', name: '社媒推广' },
]

export class GalleryService {
  constructor() {
    // 点赞记录：projectId -> Set(userId)
    this.likes = new Map()
  }

  getCategories() {
    return GALLERY_CATEGORIES
  }

  /**
   * 发布作品到广场
   */
  async publish(projectId, { category } = {}) {
    const project = await projectService.getProject(projectId)
    project.isPublished = true
    project.publishedAt = project.publishedAt || new Date().toISOString()
    if (category) project.galleryCategory = category
    await projectService.updateProject(projectId, {
      isPublished: true,
      publishedAt: project.publishedAt,
      galleryCategory: project.galleryCategory,
    })
    logger.info(`Project published to gallery: ${projectId}`)
    return project
  }

  /**
   * 取消发布（下架）
   */
  async unpublish(projectId) {
    await projectService.updateProject(projectId, { isPublished: false })
    return { success: true }
  }

  /**
   * 广场流
   */
  async listGallery({ category = 'all', sort = 'latest', challengeId = null } = {}) {
    const result = await projectService.listProjects({ archived: 'all', limit: 1000 })
    let works = (result.items || []).filter((p) => p.isPublished)

    if (challengeId) works = works.filter((p) => p.challengeId === challengeId)
    if (category && category !== 'all') {
      works = works.filter((p) => p.galleryCategory === category)
    }

    if (sort === 'popular') {
      works.sort((a, b) => (b.likeCount + b.viewCount * 0.1) - (a.likeCount + a.viewCount * 0.1))
    } else {
      works.sort((a, b) => new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0))
    }

    return { total: works.length, items: works.map((w) => this._toGalleryItem(w)) }
  }

  /**
   * 记录播放
   */
  async recordView(projectId) {
    const project = await projectService.getProject(projectId)
    project.viewCount = (project.viewCount || 0) + 1
    await projectService.updateProject(projectId, { viewCount: project.viewCount })
    return { viewCount: project.viewCount }
  }

  /**
   * 点赞 / 取消点赞（toggle）
   */
  async toggleLike(projectId, userId = 'default') {
    const project = await projectService.getProject(projectId)
    if (!this.likes.has(projectId)) this.likes.set(projectId, new Set())
    const set = this.likes.get(projectId)
    let liked
    if (set.has(userId)) {
      set.delete(userId)
      project.likeCount = Math.max(0, (project.likeCount || 1) - 1)
      liked = false
    } else {
      set.add(userId)
      project.likeCount = (project.likeCount || 0) + 1
      liked = true
    }
    await projectService.updateProject(projectId, { likeCount: project.likeCount })
    return { liked, likeCount: project.likeCount }
  }

  hasLiked(projectId, userId = 'default') {
    return this.likes.get(projectId)?.has(userId) || false
  }

  /**
   * R25: 一键复刻广场作品（对标 LibTV「一键复制爆款」）
   * 深拷贝公开项目的剧本/角色/场景/镜头元数据为新项目，
   * 镜头状态重置为 pending，不复制视频文件。
   */
  async remix(publicProjectId, { userId = 'default', newName } = {}) {
    const source = await projectService.getProject(publicProjectId)
    if (!source.isPublished) {
      throw new Error('Source project is not published to gallery')
    }

    // 1. 创建空项目
    const clone = await projectService.createProject({
      name: newName || `复刻-${source.name}`,
      description: source.description || '',
      targetDuration: source.targetDuration,
      style: source.style,
      platform: source.platform,
      tags: source.tags || [],
      userId,
    })

    // 2. 深拷贝剧本（重新生成 id）
    const script = source.script ? JSON.parse(JSON.stringify(source.script)) : null
    if (script) {
      script.characters = (script.characters || []).map((c) => ({ ...c, id: uuidv4() }))
      script.shots = (script.shots || []).map((s) => ({ ...s, id: uuidv4() }))
    }

    // 3. 深拷贝镜头（重置状态，清空视频文件）
    const newShots = (source.shots || []).map((s) => {
      const plain = typeof s.toJSON === 'function' ? s.toJSON() : { ...s }
      return {
        ...plain,
        id: uuidv4(),
        videoUrl: null,
        status: 'pending',
        locked: false,
        versions: [],
      }
    })

    // 4. 写回新项目
    await projectService.updateProject(clone.id, {
      script,
      shots: newShots,
      remixOf: source.id,
      remixAuthor: source.userId,
      isPublished: false,
    })

    logger.info(`Remix: ${publicProjectId} -> ${clone.id} by user=${userId}`)
    return {
      remixId: clone.id,
      sourceId: source.id,
      sourceName: source.name,
      shotCount: newShots.length,
      copiedShots: newShots.length,
    }
  }

  _toGalleryItem(p) {
    const completedShot = (p.shots || []).find((s) => s.videoUrl)
    return {
      id: p.id,
      name: p.name,
      description: p.description || p.script?.synopsis || '',
      coverUrl: p.coverUrl || '',
      previewUrl: completedShot?.videoUrl || '',
      authorId: p.userId,
      category: p.galleryCategory,
      style: p.style,
      likeCount: p.likeCount || 0,
      viewCount: p.viewCount || 0,
      publishedAt: p.publishedAt,
      challengeId: p.challengeId || null,
      shotCount: (p.shots || []).length,
    }
  }
}

export const galleryService = new GalleryService()
export default galleryService
