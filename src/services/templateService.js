import logger from '../utils/logger.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * 模板服务
 * 内置创作模板 + 用户自定义模板，用户可一键从模板创建项目
 */
const BUILTIN_TEMPLATES = [
  {
    id: 'product-ad',
    name: '产品广告',
    description: '30秒产品展示短片，适合电商主图视频和社媒投放',
    category: '商业',
    icon: '📦',
    color: '#6366f1',
    defaultSettings: {
      targetDuration: 30,
      style: 'cinematic',
      platform: 'landscape',
    },
    sampleIdeas: [
      '一款智能手表的产品展示，突出健康监测和运动追踪功能',
      '新型蓝牙耳机开箱体验，强调音质和续航',
      '手工咖啡豆品牌故事，从产地到杯中',
    ],
    tags: ['产品', '广告', '电商'],
  },
  {
    id: 'travel-vlog',
    name: '旅行Vlog',
    description: '第一人称旅行记录，风景+体验+情绪',
    category: '生活',
    icon: '✈️',
    color: '#06b6d4',
    defaultSettings: {
      targetDuration: 60,
      style: 'warm',
      platform: 'portrait',
    },
    sampleIdeas: [
      '一个人在京都的秋日旅行，从清晨寺庙到夜晚居酒屋',
      '冰岛自驾之旅，极光、瀑布和黑沙滩',
      '成都美食三日游，火锅、茶馆和熊猫',
    ],
    tags: ['旅行', 'Vlog', '生活'],
  },
  {
    id: 'story-short',
    name: '故事短片',
    description: '有起承转合的叙事短片，适合微电影和剧情创作',
    category: '创意',
    icon: '🎭',
    color: '#ec4899',
    defaultSettings: {
      targetDuration: 45,
      style: 'cinematic',
      platform: 'landscape',
    },
    sampleIdeas: [
      '宇航员在火星上发现一株植物，决定守护它长大',
      '老钟表匠修好了一块停摆的怀表，时间倒流回年轻时',
      '城市最后一个邮差，在雨夜送出一封迟到三十年的信',
    ],
    tags: ['剧情', '短片', '叙事'],
  },
  {
    id: 'knowledge',
    name: '知识科普',
    description: '3分钟知识讲解，适合教育内容和自媒体',
    category: '教育',
    icon: '📚',
    color: '#10b981',
    defaultSettings: {
      targetDuration: 180,
      style: 'clean',
      platform: 'landscape',
    },
    sampleIdeas: [
      '为什么天空是蓝色的？用瑞利散射原理解释',
      '区块链是什么？3分钟搞懂去中心化账本',
      '猫为什么会打呼噜？振动频率的治愈秘密',
    ],
    tags: ['科普', '教育', '知识'],
  },
  {
    id: 'social-promo',
    name: '社媒推广',
    description: '15秒竖版短视频，适合抖音/小红书快速传播',
    category: '商业',
    icon: '📱',
    color: '#f59e0b',
    defaultSettings: {
      targetDuration: 15,
      style: 'vibrant',
      platform: 'portrait',
    },
    sampleIdeas: [
      '新开咖啡店的开业推广，3个必来理由',
      '健身房月卡促销，前后对比激励',
      '独立书店周末活动，阅读氛围展示',
    ],
    tags: ['社媒', '推广', '竖版'],
  },
  {
    id: 'music-visual',
    name: '音乐可视化',
    description: '配合音乐的抽象视觉短片，适合MV和氛围视频',
    category: '创意',
    icon: '🎵',
    color: '#8b5cf6',
    defaultSettings: {
      targetDuration: 30,
      style: 'surreal',
      platform: 'landscape',
    },
    sampleIdeas: [
      '电子音乐配合流动的彩色液体和几何图形',
      '钢琴曲配雨中城市的慢镜头和倒影',
      '氛围音乐配合星空延时和星云流动',
    ],
    tags: ['音乐', '视觉', '抽象'],
  },
  {
    id: 'food-review',
    name: '美食探店',
    description: '餐厅探店+菜品特写，适合美食博主和本地生活推荐',
    category: '生活',
    icon: '🍜',
    color: '#f97316',
    defaultSettings: {
      targetDuration: 45,
      style: 'warm',
      platform: 'portrait',
    },
    sampleIdeas: [
      '隐藏在巷子里的老字号面馆，一碗牛肉面的匠心',
      '日式烧鸟店探店，从备料到烤制的全过程',
      '周末brunch推荐，三家风格迥异的咖啡馆',
    ],
    tags: ['美食', '探店', '生活'],
  },
  {
    id: 'fitness-tutorial',
    name: '健身教程',
    description: '动作示范+要点讲解，适合健身教练和运动博主',
    category: '教育',
    icon: '💪',
    color: '#ef4444',
    defaultSettings: {
      targetDuration: 60,
      style: 'clean',
      platform: 'portrait',
    },
    sampleIdeas: [
      '居家无器械腹肌训练，5个动作每天10分钟',
      '深蹲正确姿势讲解，避免膝盖受伤的3个要点',
      '办公室肩颈放松操，久坐族必学的4个拉伸',
    ],
    tags: ['健身', '教程', '运动'],
  },
  {
    id: 'wedding-memory',
    name: '婚礼回忆',
    description: '婚礼高光时刻混剪，适合婚庆和个人纪念',
    category: '创意',
    icon: '💒',
    color: '#f472b6',
    defaultSettings: {
      targetDuration: 90,
      style: 'romantic',
      platform: 'landscape',
    },
    sampleIdeas: [
      '海边婚礼的日出仪式，从准备到誓言的完整记录',
      '校园爱情十年长跑，从校服到婚纱的回忆杀',
      '森系户外婚礼，自然光下的first look和亲友祝福',
    ],
    tags: ['婚礼', '回忆', '浪漫'],
  },
  {
    id: 'tech-review',
    name: '科技评测',
    description: '数码产品深度评测，参数+体验+购买建议',
    category: '教育',
    icon: '🔬',
    color: '#3b82f6',
    defaultSettings: {
      targetDuration: 120,
      style: 'clean',
      platform: 'landscape',
    },
    sampleIdeas: [
      '新款旗舰手机深度评测，影像、续航、性能全面对比',
      '无线降噪耳机横评，5款热门产品谁更值得买',
      '机械键盘入坑指南，轴体、配列、键帽一次讲清',
    ],
    tags: ['科技', '评测', '数码'],
  },
]

export class TemplateService {
  constructor() {
    this.userTemplates = new Map() // id -> user template
    this.maxUserTemplates = 100
  }

  /**
   * 列出所有模板（内置 + 用户）
   */
  listTemplates({ category, search, type = 'all' } = {}) {
    let list = []

    if (type === 'all' || type === 'builtin') {
      list = [...BUILTIN_TEMPLATES.map((t) => ({ ...t, type: 'builtin', isBuiltin: true }))]
    }
    if (type === 'all' || type === 'user') {
      const userList = Array.from(this.userTemplates.values()).map((t) => ({ ...t, type: 'user', isBuiltin: false }))
      list = [...list, ...userList]
    }

    if (category) {
      list = list.filter((t) => t.category === category)
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.description.toLowerCase().includes(q) ||
          (t.tags && t.tags.some((tag) => tag.toLowerCase().includes(q)))
      )
    }
    return list
  }

  /**
   * 获取单个模板
   */
  getTemplate(templateId) {
    // 先查内置模板
    const builtin = BUILTIN_TEMPLATES.find((t) => t.id === templateId)
    if (builtin) {
      return { ...builtin, type: 'builtin', isBuiltin: true }
    }
    // 再查用户模板
    const user = this.userTemplates.get(templateId)
    if (user) {
      return { ...user, type: 'user', isBuiltin: false }
    }
    throw new Error(`Template not found: ${templateId}`)
  }

  /**
   * 从项目创建模板
   */
  createTemplateFromProject(project, { name, description, category = '自定义', icon = '🎬', tags = [], userId = 'default' } = {}) {
    try {
      if (!project) {
        throw new Error('项目不能为空')
      }

      const templateId = `user-${uuidv4().slice(0, 8)}`
      const template = {
        id: templateId,
        name: name || `${project.name} - 模板`,
        description: description || `从项目「${project.name}」创建的模板`,
        category,
        icon,
        color: '#8b5cf6',
        defaultSettings: {
          targetDuration: project.targetDuration || 30,
          style: project.style || 'cinematic',
          platform: project.platform || 'landscape',
        },
        sampleIdeas: project.description ? [project.description] : ['基于此模板创作你的视频'],
        tags: tags.length > 0 ? tags : (project.tags || []),
        // 项目快照数据
        projectSnapshot: {
          script: project.script ? JSON.parse(JSON.stringify(project.script)) : null,
          characters: project.characters ? project.characters.map((c) => JSON.parse(JSON.stringify(c))) : [],
          shots: project.shots ? project.shots.map((s) => ({ ...s, status: 'pending', videoUrl: null })) : [],
          style: project.style,
          platform: project.platform,
          targetDuration: project.targetDuration,
        },
        createdBy: userId,
        createdAt: new Date().toISOString(),
        useCount: 0,
      }

      this.userTemplates.set(templateId, template)
      logger.info(`User template created: ${template.name} (${templateId})`)
      return template
    } catch (error) {
      logger.error(`Failed to create template from project: ${error.message}`)
      throw new Error(`创建模板失败: ${error.message}`)
    }
  }

  /**
   * 删除用户模板
   */
  deleteUserTemplate(templateId, userId = null) {
    const template = this.userTemplates.get(templateId)
    if (!template) {
      throw new Error(`模板不存在: ${templateId}`)
    }
    if (userId && template.createdBy !== userId) {
      throw new Error('无权删除此模板')
    }
    this.userTemplates.delete(templateId)
    logger.info(`User template deleted: ${templateId}`)
    return { success: true }
  }

  /**
   * 获取用户创建的模板
   */
  getUserTemplates(userId) {
    return Array.from(this.userTemplates.values())
      .filter((t) => t.createdBy === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  }

  /**
   * 增加模板使用次数
   */
  incrementUseCount(templateId) {
    const template = this.userTemplates.get(templateId)
    if (template) {
      template.useCount = (template.useCount || 0) + 1
    }
  }

  /**
   * 获取所有分类
   */
  listCategories() {
    const allTemplates = this.listTemplates()
    const categories = [...new Set(allTemplates.map((t) => t.category))]
    return categories.map((cat) => ({
      name: cat,
      count: allTemplates.filter((t) => t.category === cat).length,
    }))
  }

  /**
   * 从模板生成项目创建参数
   */
  buildProjectFromTemplate(templateId, overrides = {}) {
    const template = this.getTemplate(templateId)
    const idea = overrides.idea || (template.sampleIdeas && template.sampleIdeas[0]) || '基于此模板创作'

    // 增加使用次数
    if (!template.isBuiltin) {
      this.incrementUseCount(templateId)
    }

    const result = {
      name: overrides.name || `${template.name} - ${idea.slice(0, 15)}`,
      targetDuration: overrides.targetDuration || template.defaultSettings.targetDuration,
      style: overrides.style || template.defaultSettings.style,
      platform: overrides.platform || template.defaultSettings.platform,
      templateId: template.id,
      idea,
    }

    // 如果是用户模板且有项目快照，附加快照数据
    if (!template.isBuiltin && template.projectSnapshot) {
      result.projectSnapshot = template.projectSnapshot
    }

    return result
  }
}

export const templateService = new TemplateService()
export default templateService
