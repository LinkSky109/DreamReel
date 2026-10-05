import { projectService } from './projectService.js'
import { galleryService } from './galleryService.js'
import logger from '../utils/logger.js'

/**
 * R10：创作挑战与活动服务
 */

const CHALLENGES = [
  {
    id: 'challenge-dream',
    title: '梦境重塑',
    theme: '一个反复出现的梦',
    description: '用 AI 呈现你最难忘的梦境，风格不限，强调超现实氛围。',
    rules: ['时长 15-60 秒', '需包含至少 1 个角色', '必须使用 AI 生成画面'],
    reward: '精选作品获首页推荐 + Pro 会员月卡',
    startAt: '2026-09-20',
    endAt: '2026-10-20',
    status: 'active',
    coverIcon: '🌙',
  },
  {
    id: 'challenge-city',
    title: '城市微光',
    theme: '城市里被忽略的瞬间',
    description: '记录城市角落的小人物、小场景，用镜头发现日常之美。',
    rules: ['时长 10-45 秒', '城市/街景主题', '鼓励写实风格'],
    reward: 'Top3 获官方流量扶持',
    startAt: '2026-09-25',
    endAt: '2026-10-25',
    status: 'active',
    coverIcon: '🏙️',
  },
  {
    id: 'challenge-scifi',
    title: '60 秒科幻',
    theme: '一句话科幻设定',
    description: '用一个反转或一个奇观，在 60 秒内讲完一个科幻故事。',
    rules: ['时长 ≤ 60 秒', '科幻题材', '需有明确叙事'],
    reward: '最佳叙事奖 + 风格包兑换券',
    startAt: '2026-10-01',
    endAt: '2026-10-31',
    status: 'active',
    coverIcon: '🚀',
  },
]

export class ChallengeService {
  listChallenges({ status = 'all' } = {}) {
    let list = CHALLENGES
    if (status !== 'all') list = list.filter((c) => c.status === status)
    return { total: list.length, items: list }
  }

  getChallenge(challengeId) {
    const c = CHALLENGES.find((x) => x.id === challengeId)
    if (!c) throw new Error(`Challenge not found: ${challengeId}`)
    return c
  }

  /**
   * 参与挑战：基于挑战主题创建项目
   */
  async joinChallenge(challengeId, { userId = 'default', name } = {}) {
    const challenge = this.getChallenge(challengeId)
    const project = await projectService.createProject({
      name: name || `${challenge.title} - 我的投稿`,
      description: `参与挑战「${challenge.title}」，主题：${challenge.theme}`,
      userId,
    })
    await projectService.updateProject(project.id, { challengeId })
    logger.info(`User joined challenge ${challengeId}: project ${project.id}`)
    return { success: true, challenge, project }
  }

  /**
   * 投稿：将已完成项目发布并关联到挑战
   */
  async submitToChallenge(challengeId, projectId) {
    this.getChallenge(challengeId)
    await projectService.updateProject(projectId, { challengeId })
    await galleryService.publish(projectId)
    logger.info(`Project ${projectId} submitted to challenge ${challengeId}`)
    return { success: true }
  }

  /**
   * 挑战详情 + 作品排行
   */
  async getChallengeDetail(challengeId) {
    const challenge = this.getChallenge(challengeId)
    const gallery = await galleryService.listGallery({ challengeId, sort: 'popular' })
    return {
      ...challenge,
      entries: gallery.items,
      entryCount: gallery.total,
    }
  }
}

export const challengeService = new ChallengeService()
export default challengeService
