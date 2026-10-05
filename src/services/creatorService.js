import { projectService } from './projectService.js'
import { storageService } from './storageService.js'
import logger from '../utils/logger.js'

/**
 * R11：创作者主页服务
 * 创作者资料、作品列表、作品统计、公开主页
 */

export class CreatorService {
  constructor() {
    // 创作者资料以 userId 为键存储（内存 + storage meta）
    this.profiles = new Map()
  }

  /**
   * 获取或创建创作者资料
   */
  async getProfile(userId) {
    const uid = userId || 'default'
    if (this.profiles.has(uid)) return this.profiles.get(uid)

    // 从 storage 用户数据补充
    const userRecord = storageData(storageService, uid)
    const profile = {
      userId: uid,
      displayName: userRecord?.name || userRecord?.email?.split('@')[0] || '梦卷创作者',
      bio: '',
      avatarUrl: userRecord?.avatarUrl || '',
      isPublic: false,
      socialLinks: {},
      createdAt: new Date().toISOString(),
    }
    this.profiles.set(uid, profile)
    return profile
  }

  /**
   * 更新创作者资料
   */
  async updateProfile(userId, updates) {
    const profile = await this.getProfile(userId)
    const allowed = ['displayName', 'bio', 'avatarUrl', 'isPublic', 'socialLinks']
    for (const key of allowed) {
      if (updates[key] !== undefined) profile[key] = updates[key]
    }
    profile.updatedAt = new Date().toISOString()
    this.profiles.set(profile.userId, profile)
    return profile
  }

  /**
   * 获取创作者作品列表
   */
  async getWorks(userId, { includeUnlisted = false } = {}) {
    const uid = userId || 'default'
    const result = await projectService.listProjects({
      userId: uid,
      archived: includeUnlisted ? 'all' : undefined,
      limit: 1000,
    })
    let works = result.items || []
    if (!includeUnlisted) {
      works = works.filter((p) => p.status !== 'archived')
    }
    works.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
    return works
  }

  /**
   * 创作者主页数据（资料 + 作品 + 统计）
   */
  async getCreatorPage(userId) {
    const profile = await this.getProfile(userId)
    const works = await this.getWorks(userId)

    const stats = {
      workCount: works.length,
      totalDuration: works.reduce((s, p) => {
        const shots = p.shots || []
        return s + shots.reduce((sum, sh) => sum + (sh.duration || 0), 0)
      }, 0),
      completedCount: works.filter((p) => p.status === 'completed').length,
      favoriteCount: works.reduce((s, p) => s + (p.favoriteCount || 0), 0),
      likeCount: works.reduce((s, p) => s + (p.likeCount || 0), 0),
    }

    return {
      profile,
      works: works.map((w) => ({
        id: w.id,
        name: w.name,
        coverUrl: w.coverUrl,
        status: w.status,
        style: w.style,
        updatedAt: w.updatedAt,
        shotCount: (w.shots || []).length,
      })),
      stats,
      publicUrl: profile.isPublic ? `/creator/${profile.userId}` : null,
    }
  }
}

// 从 storageService 安全读取用户记录
function storageData(storage, uid) {
  try {
    return storage.data?.users?.[uid] || null
  } catch (e) {
    return null
  }
}

export const creatorService = new CreatorService()
export default creatorService
