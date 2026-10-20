import { generateId } from '../utils/idGenerator.js'

/**
 * 世界观实体类型（覆盖长篇小说 12 大模块）。
 */
export const WORLD_TYPES = [
  'world', // 世界规则（起源/位面/纪元/底层规则/时间/生死灵魂/禁忌/资源）
  'power', // 力量/魔法/异能体系
  'rule', // 律法与禁忌
  'race', // 种族/物种
  'faction', // 势力与组织
  'event', // 重大事件
  'item', // 装备/宝物/道具/巨型造物/阵法
  'location', // 地域风貌
  'culture', // 文化风俗
  'prophecy', // 预言/传说/符号体系
  'conflict', // 冲突体系
  'civilization', // 文明与科技/术法
  'narrative', // 叙事与作品特色
  'other',
]

export const WORLD_TYPE_LABELS = {
  world: '世界规则',
  power: '力量体系',
  rule: '律法与禁忌',
  race: '种族物种',
  faction: '势力组织',
  event: '重大事件',
  item: '装备宝物',
  location: '地域风貌',
  culture: '文化风俗',
  prophecy: '预言传说',
  conflict: '冲突体系',
  civilization: '文明体系',
  narrative: '叙事特色',
  other: '其他',
}

/** 核心类型：缺失时提示可换引擎/扩大范围 */
export const WORLD_CORE_TYPES = ['race', 'faction', 'event', 'item', 'power', 'location', 'world']

/**
 * 每类型专属属性模板 [{ key, label }]。
 * 抽取时作为 attributes 的推荐字段，合并时按 key 取值；未知 key 也保留。
 */
export const WORLD_ATTRIBUTES = {
  world: [
    { key: 'origin', label: '世界起源' },
    { key: 'planes', label: '位面/宇宙结构' },
    { key: 'eras', label: '纪元划分' },
    { key: 'physics', label: '底层物理/能量规则' },
    { key: 'time', label: '时间规则' },
    { key: 'soul', label: '生死与灵魂规则' },
    { key: 'taboos', label: '世界禁忌' },
    { key: 'resources', label: '核心资源体系' },
    { key: 'myth', label: '创世神话' },
  ],
  power: [
    { key: 'source', label: '能量来源' },
    { key: 'tiers', label: '等级划分' },
    { key: 'path', label: '修炼路径' },
    { key: 'cost', label: '代价' },
    { key: 'ceiling', label: '上限' },
    { key: 'forbidden', label: '禁忌能力' },
    { key: 'weakness', label: '弱点' },
    { key: 'inheritance', label: '传承方式' },
  ],
  rule: [
    { key: 'worldTaboo', label: '世界底层禁忌' },
    { key: 'racialLaw', label: '种族戒律' },
    { key: 'nationalLaw', label: '国家法律' },
    { key: 'religiousLaw', label: '神权/王权法条' },
    { key: 'penalty', label: '违反后的惩罚' },
  ],
  race: [
    { key: 'origin', label: '物种起源' },
    { key: 'lifespan', label: '寿命' },
    { key: 'senses', label: '生理特征/感官' },
    { key: 'reproduction', label: '繁殖方式' },
    { key: 'weakness', label: '弱点' },
    { key: 'talents', label: '天生能力' },
    { key: 'culture', label: '种族文化/价值观' },
    { key: 'relations', label: '与其他种族关系' },
    { key: 'subspecies', label: '亚种/变异个体' },
  ],
  faction: [
    { key: 'government', label: '政体' },
    { key: 'territory', label: '领地/首都' },
    { key: 'population', label: '人口/种族构成' },
    { key: 'goal', label: '对外宣称目标' },
    { key: 'trueGoal', label: '真实隐藏目的' },
    { key: 'structure', label: '权力结构' },
    { key: 'military', label: '军事力量' },
    { key: 'economy', label: '经济模式' },
    { key: 'diplomacy', label: '对外关系' },
    { key: 'conflicts', label: '内部矛盾' },
    { key: 'faith', label: '文化与信仰' },
    { key: 'timeline', label: '兴衰节点' },
  ],
  event: [
    { key: 'time', label: '时间' },
    { key: 'cause', label: '起因' },
    { key: 'foreshadow', label: '前置伏笔' },
    { key: 'parties', label: '参与方' },
    { key: 'turningPoints', label: '关键转折点' },
    { key: 'losses', label: '直接损失' },
    { key: 'longTerm', label: '长远代价' },
    { key: 'aftermath', label: '遗留后遗症' },
    { key: 'truth', label: '真实真相' },
    { key: 'rumor', label: '民间流传版本' },
    { key: 'products', label: '衍生产物' },
  ],
  item: [
    { key: 'grade', label: '品级' },
    { key: 'material', label: '材质与构造' },
    { key: 'maker', label: '制造者/年代' },
    { key: 'activation', label: '激活条件' },
    { key: 'effect', label: '效果' },
    { key: 'cost', label: '副作用/代价' },
    { key: 'weakness', label: '弱点与破解' },
    { key: 'spirit', label: '器灵/自我意志' },
    { key: 'curse', label: '传承与诅咒' },
    { key: 'category', label: '分类（消耗品/巨型造物/阵法）' },
  ],
  location: [
    { key: 'geography', label: '地理地质/气候' },
    { key: 'ecology', label: '生态与生物' },
    { key: 'settlements', label: '聚落形态' },
    { key: 'customs', label: '衣食住行风俗' },
    { key: 'rituals', label: '节庆/婚丧礼仪' },
    { key: 'language', label: '语言文字' },
    { key: 'symbols', label: '文化符号' },
    { key: 'transport', label: '交通与通信' },
  ],
  culture: [
    { key: 'overview', label: '概述' },
    { key: 'clothing', label: '服饰' },
    { key: 'food', label: '饮食' },
    { key: 'festivals', label: '节庆' },
    { key: 'rites', label: '婚丧礼仪' },
    { key: 'language', label: '语言文字' },
    { key: 'symbols', label: '图腾/纹样/象征' },
    { key: 'taboos', label: '禁忌符号' },
  ],
  prophecy: [
    { key: 'text', label: '预言原文' },
    { key: 'source', label: '预言来源' },
    { key: 'tampered', label: '是否被篡改' },
    { key: 'truth', label: '预言真假' },
    { key: 'omens', label: '图腾/徽章/暗号' },
    { key: 'epics', label: '歌谣/史诗/古籍' },
  ],
  conflict: [
    { key: 'external', label: '外部冲突' },
    { key: 'internal', label: '内部冲突' },
    { key: 'personal', label: '个人冲突' },
    { key: 'drivers', label: '冲突驱动源' },
    { key: 'chain', label: '连锁反应' },
  ],
  civilization: [
    { key: 'stage', label: '文明发展阶段' },
    { key: 'knowledge', label: '知识传承方式' },
    { key: 'forbidden', label: '禁忌研究' },
    { key: 'production', label: '日常生产方式' },
  ],
  narrative: [
    { key: 'structure', label: '叙事结构' },
    { key: 'pov', label: '视角切换规则' },
    { key: 'themes', label: '核心母题' },
    { key: 'morality', label: '善恶观' },
    { key: 'foreshadow', label: '伏笔与回收体系' },
    { key: 'imagery', label: '隐喻/象征意象' },
    { key: 'tone', label: '文风与情绪基调' },
    { key: 'flaws', label: '作品缺陷' },
  ],
  other: [],
}

export function attributeKeysFor(type) {
  return (WORLD_ATTRIBUTES[type] || []).map((a) => a.key)
}

/**
 * 世界观实体（Sprint 25）
 */
export class WorldEntity {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.type = WORLD_TYPES.includes(data.type) ? data.type : 'other'
    this.name = data.name || ''
    this.aliases = Array.isArray(data.aliases) ? data.aliases : []
    this.description = data.description || ''
    this.attributes = data.attributes && typeof data.attributes === 'object' ? data.attributes : {}
    this.relations = Array.isArray(data.relations) ? data.relations : [] // [{ target, kind }]
    this.firstChapter = data.firstChapter ?? null
    this.mentions = data.mentions ?? 0
    this.provider = data.provider || 'heuristic'
    this.status = data.status || 'pending' // pending | confirmed | revision
    this.note = data.note || ''
    this.createdAt = data.createdAt || new Date().toISOString()
  }

  toJSON() {
    return { ...this }
  }
}
