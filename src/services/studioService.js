import { storageService } from './storageService.js'
import { Studio } from '../models/Studio.js'
import { projectService } from './projectService.js'
import logger from '../utils/logger.js'

const STORAGE_KEY = 'studios'

/**
 * R30：剧场计划厂牌服务
 * 持久化 key 'studios'，参照 teamService 的 _load/_save。
 */
export class StudioService {
  _load() {
    const data = storageService.get(STORAGE_KEY) || {}
    const studios = {}
    for (const [id, s] of Object.entries(data)) {
      studios[id] = new Studio(s)
    }
    return studios
  }

  _save(studios) {
    const data = {}
    for (const [id, s] of Object.entries(studios)) data[id] = s.toJSON()
    storageService.set(STORAGE_KEY, data)
  }

  /**
   * 创建厂牌
   */
  async createStudio({ name, description, logo, stylePositioning, curatorName, ownerId }) {
    if (!name || !String(name).trim()) {
      throw new Error('厂牌名称不能为空')
    }
    const studios = this._load()
    const studio = new Studio({
      name: String(name).trim(),
      description: description || '',
      logo: logo || '🎬',
      stylePositioning: stylePositioning || '',
      curatorName: curatorName || '',
      curatorId: ownerId || 'default',
    })
    studios[studio.id] = studio
    this._save(studios)
    logger.info(`Studio created: ${studio.id} - ${studio.name}`)
    return studio
  }

  /**
   * 取厂牌，找不到抛错
   */
  async getStudio(id) {
    const studio = this._load()[id]
    if (!studio) throw new Error(`Studio not found: ${id}`)
    return studio
  }

  /**
   * 厂牌广场
   */
  async listStudios() {
    const items = Object.values(this._load()).map((s) => s.toJSON())
    return { total: items.length, items }
  }

  /**
   * 更新厂牌基础信息
   */
  async updateStudio(id, updates) {
    const studios = this._load()
    const studio = studios[id]
    if (!studio) throw new Error(`Studio not found: ${id}`)
    const updatable = ['name', 'description', 'logo', 'logoUrl', 'stylePositioning', 'curatorName']
    for (const field of updatable) {
      if (updates[field] !== undefined) studio[field] = updates[field]
    }
    studio.updatedAt = new Date().toISOString()
    this._save(studios)
    return studio
  }

  /**
   * 签约创作者
   */
  async signMember(id, { userId, name, role }) {
    if (!userId) throw new Error('userId 不能为空')
    const studios = this._load()
    const studio = studios[id]
    if (!studio) throw new Error(`Studio not found: ${id}`)
    if (studio.getMember(userId)) throw new Error('创作者已签约')
    studio.members.push({
      userId,
      name: name || userId,
      role: role || 'creator',
      joinedAt: new Date().toISOString(),
    })
    studio.updatedAt = new Date().toISOString()
    this._save(studios)
    return studio
  }

  /**
   * 移除签约创作者
   */
  async removeMember(id, userId) {
    const studios = this._load()
    const studio = studios[id]
    if (!studio) throw new Error(`Studio not found: ${id}`)
    if (!studio.getMember(userId)) throw new Error('成员不存在')
    studio.members = studio.members.filter((m) => m.userId !== userId)
    studio.updatedAt = new Date().toISOString()
    this._save(studios)
    return studio
  }

  /**
   * 建剧集
   */
  async createShow(id, { title, synopsis, coverIcon }) {
    if (!title || !String(title).trim()) {
      throw new Error('剧集标题不能为空')
    }
    const studios = this._load()
    const studio = studios[id]
    if (!studio) throw new Error(`Studio not found: ${id}`)
    const show = {
      id: `show_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      title: String(title).trim(),
      synopsis: synopsis || '',
      coverIcon: coverIcon || '🎞️',
      projectIds: [],
      createdAt: new Date().toISOString(),
    }
    studio.shows.push(show)
    studio.updatedAt = new Date().toISOString()
    this._save(studios)
    return show
  }

  /**
   * 取剧集
   */
  async getShow(studioId, showId) {
    const studio = await this.getStudio(studioId)
    const show = studio.getShow(showId)
    if (!show) throw new Error(`Show not found: ${showId}`)
    return show
  }

  /**
   * 把作品归入厂牌（回写 project.studioId）
   */
  async addProject(studioId, projectId) {
    const studios = this._load()
    const studio = studios[studioId]
    if (!studio) throw new Error(`Studio not found: ${studioId}`)
    // 校验 project 存在（不存在会抛 Project not found）
    await projectService.getProject(projectId)
    if (!studio.projectIds.includes(projectId)) {
      studio.projectIds.push(projectId)
      studio.updatedAt = new Date().toISOString()
    }
    await projectService.updateProject(projectId, { studioId })
    this._save(studios)
    return studio
  }

  /**
   * 把作品归入剧集；同时确保该作品也在厂牌作品列表里
   */
  async addProjectToShow(studioId, showId, projectId) {
    const studios = this._load()
    const studio = studios[studioId]
    if (!studio) throw new Error(`Studio not found: ${studioId}`)
    const show = studio.getShow(showId)
    if (!show) throw new Error(`Show not found: ${showId}`)
    await projectService.getProject(projectId)

    // 确保作品也在厂牌作品列表
    if (!studio.projectIds.includes(projectId)) {
      studio.projectIds.push(projectId)
      await projectService.updateProject(projectId, { studioId })
    }
    if (!show.projectIds.includes(projectId)) {
      show.projectIds.push(projectId)
    }
    studio.updatedAt = new Date().toISOString()
    this._save(studios)
    return show
  }

  /**
   * 把 project 实例转成简要对象
   */
  _briefProject(project) {
    const shots = project.shots || []
    return {
      id: project.id,
      name: project.name,
      coverUrl: project.coverUrl || '',
      status: project.status,
      shotCount: shots.length,
    }
  }

  /**
   * 厂牌详情：聚合作品与剧集的简要对象
   */
  async getStudioDetail(id) {
    const studio = await this.getStudio(id)
    const json = studio.toJSON()
    json.works = await this.listStudioWorks(id)
    json.shows = json.shows.map((show) => ({
      ...show,
      works: (show.projectIds || [])
        .map((pid) => {
          try {
            return this._briefProject(projectService.projects.get(pid))
          } catch {
            return null
          }
        })
        .filter(Boolean),
    }))
    return json
  }

  /**
   * 列出厂牌下所有作品
   */
  async listStudioWorks(id) {
    const studio = await this.getStudio(id)
    const works = []
    for (const pid of studio.projectIds) {
      try {
        works.push(this._briefProject(projectService.projects.get(pid)))
      } catch {
        /* skip stale */
      }
    }
    return works
  }

  /**
   * 列出某剧集下所有作品
   */
  async listShowWorks(studioId, showId) {
    const show = await this.getShow(studioId, showId)
    const works = []
    for (const pid of show.projectIds || []) {
      try {
        works.push(this._briefProject(projectService.projects.get(pid)))
      } catch {
        /* skip stale */
      }
    }
    return works
  }
}

export const studioService = new StudioService()
export default studioService
