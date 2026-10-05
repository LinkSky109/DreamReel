import { v4 as uuidv4 } from 'uuid'

/**
 * R30：剧场计划厂牌模型（对标 LibTV「剧场计划/TV Show」）
 * 独立模型：厂牌下有签约创作者(members)、剧集(shows)、归入作品(projectIds)
 */
export class Studio {
  constructor({
    id,
    name,
    description,
    logo,
    logoUrl,
    stylePositioning,
    curatorId,
    curatorName,
    members,
    shows,
    projectIds,
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id || uuidv4()
    this.name = name || '未命名厂牌'
    this.description = description || ''
    this.logo = logo || '🎬'
    this.logoUrl = logoUrl || ''
    this.stylePositioning = stylePositioning || ''
    this.curatorId = curatorId || null
    this.curatorName = curatorName || ''
    this.members = Array.isArray(members) ? members : []
    this.shows = Array.isArray(shows) ? shows : []
    this.projectIds = Array.isArray(projectIds) ? projectIds : []
    this.createdAt = createdAt || new Date().toISOString()
    this.updatedAt = updatedAt || new Date().toISOString()
  }

  getMember(userId) {
    return this.members.find((m) => m.userId === userId) || null
  }

  getShow(showId) {
    return this.shows.find((s) => s.id === showId) || null
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      logo: this.logo,
      logoUrl: this.logoUrl,
      stylePositioning: this.stylePositioning,
      curatorId: this.curatorId,
      curatorName: this.curatorName,
      members: this.members,
      shows: this.shows,
      projectIds: this.projectIds,
      memberCount: this.members.length,
      showCount: this.shows.length,
      projectCount: this.projectIds.length,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    }
  }
}

export default Studio
