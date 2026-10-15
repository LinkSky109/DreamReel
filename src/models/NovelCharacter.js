import { generateId } from '../utils/idGenerator.js'

/**
 * 角色卡字段模板（分大类，覆盖长篇小说全维度角色要素）。
 * key 为存储字段名，label 为中文标签，group 为归类。
 */
export const CARD_SCHEMA = [
  // 一、基础档案
  { key: 'age', label: '年龄', group: 'basic' },
  { key: 'gender', label: '性别', group: 'basic' },
  { key: 'appearance', label: '外貌', group: 'basic' },
  { key: 'personality', label: '性格底色', group: 'basic' },
  { key: 'habits', label: '习惯', group: 'basic' },
  { key: 'catchphrase', label: '口头禅', group: 'basic' },
  { key: 'fears', label: '恐惧', group: 'basic' },
  { key: 'obsessions', label: '执念', group: 'basic' },
  { key: 'weaknesses', label: '心理弱点', group: 'basic' },

  // 二、能力面板
  { key: 'abilities', label: '基础能力', group: 'ability' },
  { key: 'talents', label: '特殊天赋', group: 'ability' },
  { key: 'shortcomings', label: '短板', group: 'ability' },
  { key: 'combatStyle', label: '战斗风格', group: 'ability' },
  { key: 'strengths', label: '擅长领域', group: 'ability' },
  { key: 'limits', label: '不擅长领域', group: 'ability' },

  // 三、人际关系网络
  { key: 'relations', label: '人际关系网', group: 'relations' },
  { key: 'relationChanges', label: '关系变化节点', group: 'relations' },

  // 四、过往创伤
  { key: 'childhood', label: '童年经历', group: 'trauma' },
  { key: 'regrets', label: '重大遗憾', group: 'trauma' },
  { key: 'shadows', label: '心理阴影', group: 'trauma' },
  { key: 'coreKnot', label: '核心心结', group: 'trauma' },

  // 五、信念与价值观
  { key: 'principles', label: '原则底线', group: 'beliefs' },
  { key: 'worldview', label: '三观', group: 'beliefs' },
  { key: 'beliefShifts', label: '信念转变节点', group: 'beliefs' },

  // 六、伏笔与隐藏身份
  { key: 'hiddenIdentity', label: '隐藏身世', group: 'secrets' },
  { key: 'secretMission', label: '秘密任务', group: 'secrets' },
  { key: 'disguise', label: '伪装身份', group: 'secrets' },
  { key: 'secrets', label: '不为人知的秘密', group: 'secrets' },

  // 七、结局与遗留影响
  { key: 'fate', label: '生死归宿', group: 'ending' },
  { key: 'legacy', label: '遗产/传说', group: 'ending' },
  { key: 'impact', label: '对世界/他人的改变', group: 'ending' },

  // 八、声线与成长
  { key: 'voice', label: '声线描述', group: 'media' },
  { key: 'growth', label: '成长轨迹', group: 'media' },
]

export const CARD_GROUPS = {
  basic: '基础档案',
  ability: '能力面板',
  relations: '人际关系网',
  trauma: '过往创伤',
  beliefs: '信念与价值观',
  secrets: '伏笔与隐藏身份',
  ending: '结局与遗留影响',
  media: '声线与成长',
}

/** 可审核的角色卡字段（用于修订率统计） */
export const CARD_FIELDS = CARD_SCHEMA.map((f) => f.key)

/** 参与修订率统计的字段 = 名字 + 别名 + 角色卡字段 */
export const CHARACTER_FIELDS = ['name', 'aliases', ...CARD_FIELDS]

/** 角色类别：个体 / 群体（族群、兵种、组织成员） */
export const CHARACTER_KINDS = ['individual', 'group']

function emptyCard() {
  const card = {}
  for (const field of CARD_FIELDS) card[field] = ''
  return card
}

/**
 * 小说角色（Sprint 19 / S19-4、S19-5）
 * name / aliases / description + 分大类角色卡（基础/能力/关系/创伤/信念/秘密/结局/声线）。
 */
export class NovelCharacter {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.name = data.name || ''
    this.aliases = Array.isArray(data.aliases) ? data.aliases : []
    this.description = data.description || ''
    this.kind = CHARACTER_KINDS.includes(data.kind) ? data.kind : 'individual'
    const base = emptyCard()
    const card = data.card || {}
    for (const field of CARD_FIELDS) {
      if (card[field] !== undefined && card[field] !== null) base[field] = card[field]
    }
    this.card = base
    this.provider = data.provider || 'heuristic' // heuristic | llm
    this.status = data.status || 'pending' // pending | approved
    // 人工修订记录 [{ field, from, to, at }]
    this.reviewEdits = Array.isArray(data.reviewEdits) ? data.reviewEdits : []
    this.createdAt = data.createdAt || new Date().toISOString()
    this.updatedAt = data.updatedAt || this.createdAt
  }

  toJSON() {
    return { ...this }
  }
}
