import { generateId } from '../utils/idGenerator.js'

/** 可审核的角色卡字段（用于修订率统计） */
export const CARD_FIELDS = [
  'appearance', // 外形
  'personality', // 性格
  'voice', // 声线描述
  'catchphrase', // 口头禅
  'relations', // 关系网
  'abilities', // 能力
  'growth', // 成长轨迹
]

/** 参与修订率统计的字段 = 名字 + 别名 + 角色卡字段 */
export const CHARACTER_FIELDS = ['name', 'aliases', ...CARD_FIELDS]

/**
 * 小说角色（Sprint 19 / S19-4、S19-5）
 * name / aliases / description + 角色卡（外形/性格/声线/口头禅/关系网/能力/成长）。
 */
export class NovelCharacter {
  constructor(data = {}) {
    this.id = data.id || generateId()
    this.novelId = data.novelId
    this.name = data.name || ''
    this.aliases = Array.isArray(data.aliases) ? data.aliases : []
    this.description = data.description || ''
    const card = data.card || {}
    this.card = {
      appearance: card.appearance || '',
      personality: card.personality || '',
      voice: card.voice || '',
      catchphrase: card.catchphrase || '',
      relations: card.relations || '',
      abilities: card.abilities || '',
      growth: card.growth || '',
    }
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
