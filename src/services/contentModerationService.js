import { logger } from '../utils/logger.js'

/**
 * 内容审核服务
 * 基于关键词的内容安全检测，覆盖暴力、色情、违法、仇恨等类别
 */

// 审核类别
export const MODERATION_CATEGORY = {
  VIOLENCE: 'violence',
  SEXUAL: 'sexual',
  HATE: 'hate',
  ILLEGAL: 'illegal',
  SELF_HARM: 'self_harm',
  DRUGS: 'drugs',
}

// 审核结果等级
export const MODERATION_LEVEL = {
  PASS: 'pass',       // 通过
  WARNING: 'warning', // 警告（可继续，但有风险提示）
  REJECT: 'reject',   // 拒绝（禁止生成）
}

// 关键词库（基础版，可扩展）
const KEYWORD_DATABASE = {
  [MODERATION_CATEGORY.VIOLENCE]: {
    level: MODERATION_LEVEL.WARNING,
    keywords: [
      '杀人', '谋杀', '血腥', '暴力', '殴打', '酷刑', '恐怖袭击',
      '枪击', '爆炸', '自杀式', '斩首', '肢解', '虐杀',
      'kill', 'murder', 'blood', 'gore', 'violent', 'behead',
      'torture', 'massacre', 'slaughter',
    ],
  },
  [MODERATION_CATEGORY.SEXUAL]: {
    level: MODERATION_LEVEL.REJECT,
    keywords: [
      '色情', '裸体', '性爱', '性交', '淫荡', '裸露', '成人内容',
      'porn', 'nude', 'naked', 'sexual', 'xxx', 'erotic', 'nsfw',
    ],
  },
  [MODERATION_CATEGORY.HATE]: {
    level: MODERATION_LEVEL.REJECT,
    keywords: [
      '种族歧视', '仇恨言论', '纳粹', '法西斯', '白人至上',
      'racist', 'hate speech', 'nazi', 'fascist', 'supremacist',
    ],
  },
  [MODERATION_CATEGORY.ILLEGAL]: {
    level: MODERATION_LEVEL.REJECT,
    keywords: [
      '制作炸弹', '制造毒品', '洗钱', '诈骗教程', '黑客攻击',
      'how to make bomb', 'drug manufacturing', 'money laundering',
      'fraud tutorial', 'cyberattack',
    ],
  },
  [MODERATION_CATEGORY.SELF_HARM]: {
    level: MODERATION_LEVEL.WARNING,
    keywords: [
      '自杀', '自残', '割腕', '上吊', '跳楼',
      'suicide', 'self harm', 'cutting', 'overdose',
    ],
  },
  [MODERATION_CATEGORY.DRUGS]: {
    level: MODERATION_LEVEL.WARNING,
    keywords: [
      '吸毒', '注射毒品', '可卡因', '海洛因', '冰毒',
      'cocaine', 'heroin', 'meth', 'injecting drugs',
    ],
  },
}

// 类别中文名称
const CATEGORY_LABELS = {
  [MODERATION_CATEGORY.VIOLENCE]: '暴力内容',
  [MODERATION_CATEGORY.SEXUAL]: '色情内容',
  [MODERATION_CATEGORY.HATE]: '仇恨言论',
  [MODERATION_CATEGORY.ILLEGAL]: '违法内容',
  [MODERATION_CATEGORY.SELF_HARM]: '自残倾向',
  [MODERATION_CATEGORY.DRUGS]: '毒品相关',
}

export class ContentModerationService {
  constructor() {
    this.keywordDb = KEYWORD_DATABASE
    this.auditLog = []
    this.maxAuditLog = 500
  }

  /**
   * 审核文本内容
   * @param {string} text - 待审核文本
   * @param {object} options - { userId, projectId, context }
   * @returns {object} 审核结果 { passed, level, categories, matchedKeywords, details }
   */
  moderate(text, options = {}) {
    try {
      if (!text || typeof text !== 'string') {
        return this._result(MODERATION_LEVEL.PASS, [], [], '空内容，自动通过')
      }

      const lowerText = text.toLowerCase()
      const matchedCategories = []
      const matchedKeywords = []
      let highestLevel = MODERATION_LEVEL.PASS

      for (const [category, config] of Object.entries(this.keywordDb)) {
        const hits = config.keywords.filter((kw) => lowerText.includes(kw.toLowerCase()))
        if (hits.length > 0) {
          matchedCategories.push(category)
          matchedKeywords.push(...hits)
          if (this._levelPriority(config.level) > this._levelPriority(highestLevel)) {
            highestLevel = config.level
          }
        }
      }

      const passed = highestLevel !== MODERATION_LEVEL.REJECT
      const result = this._result(
        highestLevel,
        matchedCategories,
        matchedKeywords,
        passed ? '内容审核通过' : '内容包含违规信息，已拒绝'
      )

      // 记录审计日志
      this._logAudit({
        text: text.substring(0, 100),
        ...result,
        userId: options.userId,
        projectId: options.projectId,
        context: options.context,
        timestamp: new Date().toISOString(),
      })

      logger.info(
        `Content moderation [${highestLevel}]: ${matchedCategories.length} categories, ${matchedKeywords.length} keywords`
      )

      return result
    } catch (error) {
      logger.error('Content moderation failed:', error.message)
      // 审核失败时默认通过，不阻塞用户（生产环境应改为拒绝）
      return this._result(MODERATION_LEVEL.PASS, [], [], '审核服务异常，默认通过')
    }
  }

  /**
   * 批量审核（剧本多镜头）
   */
  moderateBatch(texts, options = {}) {
    const results = texts.map((text, index) => ({
      index,
      ...this.moderate(text, options),
    }))

    const hasReject = results.some((r) => r.level === MODERATION_LEVEL.REJECT)
    const hasWarning = results.some((r) => r.level === MODERATION_LEVEL.WARNING)

    return {
      overall: hasReject ? MODERATION_LEVEL.REJECT : hasWarning ? MODERATION_LEVEL.WARNING : MODERATION_LEVEL.PASS,
      passed: !hasReject,
      results,
      rejectedCount: results.filter((r) => r.level === MODERATION_LEVEL.REJECT).length,
      warningCount: results.filter((r) => r.level === MODERATION_LEVEL.WARNING).length,
    }
  }

  /**
   * 获取审核日志
   */
  getAuditLog(limit = 50) {
    return this.auditLog.slice(0, limit)
  }

  /**
   * 获取审核统计
   */
  getStats() {
    const total = this.auditLog.length
    const passed = this.auditLog.filter((l) => l.level === MODERATION_LEVEL.PASS).length
    const warnings = this.auditLog.filter((l) => l.level === MODERATION_LEVEL.WARNING).length
    const rejected = this.auditLog.filter((l) => l.level === MODERATION_LEVEL.REJECT).length

    const categoryCounts = {}
    for (const log of this.auditLog) {
      for (const cat of log.categories || []) {
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
      }
    }

    return {
      total,
      passed,
      warnings,
      rejected,
      passRate: total > 0 ? Math.round((passed / total) * 100) : 100,
      categoryCounts,
    }
  }

  /**
   * 级别优先级比较
   */
  _levelPriority(level) {
    const priorities = {
      [MODERATION_LEVEL.PASS]: 0,
      [MODERATION_LEVEL.WARNING]: 1,
      [MODERATION_LEVEL.REJECT]: 2,
    }
    return priorities[level] || 0
  }

  /**
   * 构造审核结果
   */
  _result(level, categories, keywords, message) {
    return {
      passed: level !== MODERATION_LEVEL.REJECT,
      level,
      categories,
      categoryLabels: categories.map((c) => CATEGORY_LABELS[c] || c),
      matchedKeywords: keywords,
      message,
    }
  }

  /**
   * 记录审计日志
   */
  _logAudit(entry) {
    this.auditLog.unshift(entry)
    if (this.auditLog.length > this.maxAuditLog) {
      this.auditLog = this.auditLog.slice(0, this.maxAuditLog)
    }
  }
}

export const contentModerationService = new ContentModerationService()
export default contentModerationService
