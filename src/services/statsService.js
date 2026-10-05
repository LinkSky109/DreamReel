import { storageService } from './storageService.js'

/**
 * 数据统计 Service
 * 聚合用户创作数据，生成仪表盘统计
 */
export class StatsService {
  /**
   * 获取用户概览统计
   */
  getOverview(userId = 'default') {
    const projects = this._getUserProjects(userId)
    const usage = storageService.data.usage?.[userId] || {}
    const exports = storageService.data.exports?.[userId] || []

    const totalShots = projects.reduce((sum, p) => sum + (p.shots?.length || 0), 0)
    const completedShots = projects.reduce(
      (sum, p) => sum + (p.shots?.filter((s) => s.status === 'completed').length || 0),
      0
    )
    const totalCharacters = projects.reduce((sum, p) => sum + (p.characters?.length || 0), 0)
    const totalVideoGenerations = this._getTotalVideoGenerations(usage)
    const totalDubbingSeconds = this._getTotalDubbingSeconds(usage)

    return {
      totalProjects: projects.length,
      totalShots,
      completedShots,
      completionRate: totalShots > 0 ? Math.round((completedShots / totalShots) * 100) : 0,
      totalCharacters,
      totalVideoGenerations,
      totalExports: exports.length,
      totalDubbingMinutes: Math.round(totalDubbingSeconds / 60),
      lastActive: this._getLastActive(projects),
    }
  }

  /**
   * 获取创作趋势（按天统计）
   */
  getTrend(userId = 'default', days = 14) {
    const projects = this._getUserProjects(userId)
    const usage = storageService.data.usage?.[userId] || {}
    const exports = storageService.data.exports?.[userId] || []

    const trend = []
    const today = new Date()

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]

      // 当天创建的项目
      const projectsCreated = projects.filter((p) => {
        return p.createdAt && p.createdAt.startsWith(dateStr)
      }).length

      // 当天的视频生成次数
      const videoGenerations = usage[dateStr]?.videoGenerations || 0

      // 当天的导出次数
      const exportsCount = exports.filter((e) => {
        return e.createdAt && e.createdAt.startsWith(dateStr)
      }).length

      trend.push({
        date: dateStr,
        projectsCreated,
        videoGenerations,
        exports: exportsCount,
      })
    }

    return trend
  }

  /**
   * 获取风格使用分布
   */
  getStyleDistribution(userId = 'default') {
    const projects = this._getUserProjects(userId)
    const styleCount = {}

    for (const project of projects) {
      const style = project.style || 'none'
      styleCount[style] = (styleCount[style] || 0) + 1

      // 统计镜头级别的风格
      if (project.shots) {
        for (const shot of project.shots) {
          if (shot.styleId && shot.styleId !== 'none') {
            styleCount[shot.styleId] = (styleCount[shot.styleId] || 0) + 1
          }
        }
      }
    }

    // 转换为数组并排序
    const distribution = Object.entries(styleCount)
      .map(([styleId, count]) => ({ styleId, count }))
      .sort((a, b) => b.count - a.count)

    return distribution
  }

  /**
   * 获取平台分布
   */
  getPlatformDistribution(userId = 'default') {
    const projects = this._getUserProjects(userId)
    const platformCount = {}

    for (const project of projects) {
      const platform = project.platform || 'landscape'
      platformCount[platform] = (platformCount[platform] || 0) + 1
    }

    return Object.entries(platformCount).map(([platform, count]) => ({ platform, count }))
  }

  /**
   * 获取额度使用情况
   */
  getQuotaUsage(userId = 'default') {
    const usage = storageService.data.usage?.[userId] || {}
    const today = new Date().toISOString().split('T')[0]
    const month = today.slice(0, 7)

    return {
      video: {
        daily: {
          used: usage[today]?.videoGenerations || 0,
          limit: 5,
          remaining: Math.max(0, 5 - (usage[today]?.videoGenerations || 0)),
        },
      },
      dubbing: {
        monthly: {
          used: usage[month]?.dubbingSeconds || 0,
          limit: 600, // 10 分钟 = 600 秒
          remaining: Math.max(0, 600 - (usage[month]?.dubbingSeconds || 0)),
        },
      },
    }
  }

  /**
   * 获取最近活跃项目
   */
  getRecentProjects(userId = 'default', limit = 5) {
    const projects = this._getUserProjects(userId)
    return projects
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
      .slice(0, limit)
      .map((p) => ({
        id: p.id,
        name: p.name,
        updatedAt: p.updatedAt,
        shotCount: p.shots?.length || 0,
        completedShots: p.shots?.filter((s) => s.status === 'completed').length || 0,
        style: p.style || 'none',
      }))
  }

  /**
   * 获取完整仪表盘数据
   */
  getDashboard(userId = 'default') {
    return {
      overview: this.getOverview(userId),
      trend: this.getTrend(userId, 14),
      styleDistribution: this.getStyleDistribution(userId),
      platformDistribution: this.getPlatformDistribution(userId),
      quotaUsage: this.getQuotaUsage(userId),
      recentProjects: this.getRecentProjects(userId, 5),
    }
  }

  // ============ 内部方法 ============

  _getUserProjects(userId) {
    const projects = storageService.data.projects || {}
    return Object.values(projects).filter((p) => {
      if (userId === 'default') {
        return !p.userId || p.userId === 'default'
      }
      return p.userId === userId
    })
  }

  _getTotalVideoGenerations(usage) {
    return Object.values(usage).reduce((sum, day) => sum + (day.videoGenerations || 0), 0)
  }

  _getTotalDubbingSeconds(usage) {
    return Object.values(usage).reduce((sum, day) => sum + (day.dubbingSeconds || 0), 0)
  }

  _getLastActive(projects) {
    if (projects.length === 0) return null
    const latest = projects.reduce((max, p) => {
      return new Date(p.updatedAt) > new Date(max.updatedAt) ? p : max
    })
    return latest.updatedAt
  }
}

export const statsService = new StatsService()
