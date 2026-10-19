import logger from '../utils/logger.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { storageService } from './storageService.js'
import { NovelCharacterState } from '../models/NovelCharacterState.js'
import { getNovelProject, readNovelFile } from './novelProjectService.js'
import { listCharacters } from './characterExtractionService.js'
import { isGenericName } from '../utils/nameFilters.js'

/**
 * 角色成长状态服务（Sprint 20 / S20-3；S32 升级为「按集形象时间线」）
 *
 * 目标：让角色的外观/装备/能力随剧情时间点演进，而不是全片用同一套终态设定。
 * 机制：
 *  - 每个角色在首次出场集由 LLM 从该集原文推导初始形象；
 *  - 之后每集以上一集状态为基准，只依据本集剧情做增量（不允许出现尚未获得的装备）；
 *  - 剧本/出图/出片提示词按「当集状态」组装，替换原静态终态描述。
 */

export function addState(novelId, characterId, data = {}) {
  const character = storageService.getNovelCharacter(characterId)
  if (!character || character.novelId !== novelId) {
    throw new Error(`character not found: ${characterId}`)
  }
  const state = new NovelCharacterState({ ...data, novelId, characterId })
  return storageService.createNovelCharacterState(state)
}

export function listStates(novelId, characterId) {
  return storageService
    .listNovelCharacterStates(novelId, characterId)
    .sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
}

/** 取某角色在指定集时的状态（≤ 该集的最近一条） */
export function getCharacterStateAt(novelId, characterId, episodeNo) {
  const states = listStates(novelId, characterId).filter((s) => Number(s.episodeNo) <= Number(episodeNo))
  return states[states.length - 1] || null
}

/** 新增或更新某角色某集的状态（按 novelId+characterId+episodeNo 唯一） */
export function upsertState(novelId, characterId, episodeNo, patch = {}, { source = 'manual' } = {}) {
  const character = storageService.getNovelCharacter(characterId)
  if (!character || character.novelId !== novelId) throw new Error(`character not found: ${characterId}`)
  const existing = listStates(novelId, characterId).find((s) => Number(s.episodeNo) === Number(episodeNo))
  if (existing) {
    Object.assign(existing, patch, { source, updatedAt: new Date().toISOString() })
    return storageService.updateNovelCharacterState(existing)
  }
  const state = new NovelCharacterState({ novelId, characterId, episodeNo, source, ...patch })
  return storageService.createNovelCharacterState(state)
}

export function deleteStatesForEpisode(novelId, episodeNo) {
  return storageService.deleteNovelCharacterStates(novelId, null, episodeNo)
}

/**
 * 组装「形象指令」文本，供剧本/出图/出片提示词使用。
 * 对每个具名角色取「≤该集」的最近状态；没有状态则跳过。
 */
export function buildAppearanceDirective(novelId, episodeNo, names = null) {
  const chars = listCharacters(novelId).filter((c) => c.name && !isGenericName(c.name))
  const wanted = names && names.length ? new Set(names) : null
  const lines = []
  for (const c of chars) {
    if (wanted && !wanted.has(c.name)) continue
    const st = getCharacterStateAt(novelId, c.id, episodeNo)
    if (!st) continue
    const bits = []
    if (st.appearance) bits.push(`外观：${st.appearance}`)
    if (st.equipment) bits.push(`装备：${st.equipment}`)
    if (st.injuries) bits.push(`伤势：${st.injuries}`)
    if (st.abilities) bits.push(`能力：${st.abilities}`)
    if (bits.length) lines.push(`- ${c.name}（第${episodeNo}集）：${bits.join('；')}`)
  }
  return lines.join('\n')
}

const STATE_JSON_SCHEMA =
  '{"characters":[{"name":"角色名","appearance":"该集应有外观（发型/衣着/年龄感/明显特征）","equipment":"该集已持有并携带的装备/道具（没有则留空）","injuries":"该集的身体状态/伤势（没有则留空）","abilities":"该集的能力/实力阶段"}]}'

function buildStatePrompt(episode, text, prevStates, presentNames = []) {
  const nameRule = presentNames.length
    ? `\n【本集出场角色（name 必须逐字使用以下名字，不得改写、不得新增其它角色）】\n${presentNames.join('、')}`
    : ''
  const prevLines = prevStates.length
    ? prevStates
        .map(
          (s) =>
            `- ${s.name}（第${s.episodeNo}集）：外观 ${s.appearance || '未知'}；装备 ${s.equipment || '无'}；伤势 ${s.injuries || '无'}；能力 ${s.abilities || '未知'}`
        )
        .join('\n')
    : '（无，本集为首次建立形象）'
  const system = [
    '你是影视剧的「服化道 / 角色连续性」总监，负责保证同一角色在不同集数中的外观与装备随剧情时间线合理演进。',
    '',
    '【铁律】',
    '1. 时间线一致：角色只能使用「到本集为止」已经获得的装备/能力。严禁出现尚未获得的神装、变身形态或后期能力。',
    '2. 若是角色首次出场，依据原文推导当时的外观与境况，不要代入结局状态。',
    '3. 若非本集明确发生变化，沿用上一集的装备/能力，不要凭空升级。',
    '4. 忠于原文，不确定的字段留空字符串，不要编造。',
    '5. appearance 只写「本集可观察到的外形」（年龄感/发型/衣着/伤痕），不要写身份、称号、背景故事或后期设定。',
    '6. abilities 只写「本集正文或分镜中实际展现的能力」；未展现则留空，严禁引用角色后期才获得的能力。',
    '',
    '【输出】严格 JSON，不要解释：',
    STATE_JSON_SCHEMA,
  ].join('\n')
  const user = [prevLines, nameRule, '', '【本集标题】' + (episode.title || ''), '【本集正文】', String(text || '').slice(0, 6000)].join('\n')
  return { systemPrompt: system, userPrompt: user, options: { temperature: 0.3, maxTokens: 3000 } }
}

/**
 * 为某一集生成/更新角色形象状态（LLM）。返回写入的状态数组。
 * opts: { names?: string[], provider?: 'heuristic' }
 */
export async function generateEpisodeStates(novelId, episodeId, opts = {}) {
  getNovelProject(novelId)
  const ep = storageService.getEpisode(episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  const episodeNo = Number(ep.episodeNo ?? (ep.chapterIndex ?? 0) + 1)
  const text = readNovelFile(novelId, ep.sourceFile)?.toString('utf-8') || ''

  const allChars = listCharacters(novelId).filter((c) => c.name && !isGenericName(c.name))
  // 出场角色判定优先级：显式 names > 本集剧本分镜里出现 > 原文出现 > 主要角色兜底
  const scriptText = (ep.screenplay?.shots || []).map((s) => `${s.description || ''} ${s.dialogue || ''}`).join(' ')
  let present
  if (opts.names && opts.names.length) {
    present = allChars.filter((c) => opts.names.includes(c.name))
  } else {
    const inScript = allChars.filter((c) => scriptText.includes(c.name))
    const inText = allChars.filter((c) => text.includes(c.name))
    const pool = inScript.length ? inScript : inText
    present = pool.length
      ? pool
      : allChars.sort((a, b) => (b.mentions || 0) - (a.mentions || 0)).slice(0, 3) // 首集无具名时兜底主要角色
  }
  present = present.slice(0, 12)
  if (!present.length) return []

  const prevStates = present
    .map((c) => {
      const st = getCharacterStateAt(novelId, c.id, episodeNo - 1) || getCharacterStateAt(novelId, c.id, episodeNo)
      return st
        ? { name: c.name, episodeNo: st.episodeNo, appearance: st.appearance, equipment: st.equipment, injuries: st.injuries, abilities: st.abilities }
        : null
    })
    .filter(Boolean)

  let produced = []
  if (opts.provider !== 'heuristic') {
    try {
      const llm = getLLMProvider()
      const res = await llm.generateJSON(buildStatePrompt(ep, text, prevStates, present.map((c) => c.name)))
      const arr = res.data && Array.isArray(res.data.characters) ? res.data.characters : []
      produced = arr
        .filter((x) => x && x.name)
        .map((x) => ({
          name: String(x.name).trim(),
          appearance: x.appearance || '',
          equipment: x.equipment || '',
          injuries: x.injuries || '',
          abilities: x.abilities || '',
        }))
    } catch (error) {
      logger.warn(`角色形象状态 LLM 失败：${error.message}`)
    }
  }
  // 回退（不使用角色卡 description：它可能是终态，会污染早期集）
  const fallbackProduced = () =>
    present.map((c) => {
      const prev = getCharacterStateAt(novelId, c.id, episodeNo - 1)
      const card = c.card || {}
      return {
        name: c.name,
        appearance: (prev && prev.appearance) || card.appearance || '',
        equipment: (prev && prev.equipment) || '',
        injuries: (prev && prev.injuries) || '',
        abilities: (prev && prev.abilities) || '',
      }
    })

  // 名称匹配：支持别名；再退化为「包含」匹配
  const matchChar = (rawName) => {
    const nm = String(rawName || '').trim()
    if (!nm) return null
    const byExact = present.find((c) => c.name === nm || (c.aliases || []).includes(nm))
    if (byExact) return byExact
    return present.find((c) => nm.includes(c.name) || c.name.includes(nm)) || null
  }

  let saved = []
  const persist = (list, source) => {
    const out = []
    for (const item of list) {
      const c = matchChar(item.name)
      if (!c) continue
      out.push(
        upsertState(
          novelId,
          c.id,
          episodeNo,
          {
            appearance: item.appearance,
            equipment: item.equipment,
            injuries: item.injuries,
            abilities: item.abilities,
            chapterTitle: ep.title || '',
          },
          { source }
        )
      )
    }
    return out
  }

  if (produced.length) saved = persist(produced, 'llm')
  if (!saved.length) {
    // 回退：本集建立/沿用，不做无据升级
    saved = persist(fallbackProduced(), 'base')
  }
  logger.info(`角色形象状态已生成 novel=${novelId} ep=${episodeNo} 角色=${saved.length}`)
  return saved
}

/** 形象时间线（按角色分组），供 UI 展示 */
export function buildTimeline(novelId) {
  const chars = listCharacters(novelId).filter((c) => c.name && !isGenericName(c.name))
  const out = []
  for (const c of chars) {
    const states = listStates(novelId, c.id)
    if (!states.length) continue
    out.push({
      characterId: c.id,
      name: c.name,
      states: states.map((s) => ({
        episodeNo: s.episodeNo,
        appearance: s.appearance,
        equipment: s.equipment,
        injuries: s.injuries,
        abilities: s.abilities,
        source: s.source,
      })),
    })
  }
  return out
}

/** 校验某集是否已具备出场角色的形象状态；返回缺失角色名 */
export function missingStatesForEpisode(novelId, episodeNo, names = []) {
  const chars = listCharacters(novelId).filter((c) => c.name && names.includes(c.name))
  return chars.filter((c) => !getCharacterStateAt(novelId, c.id, episodeNo)).map((c) => c.name)
}

export default {
  addState,
  listStates,
  getCharacterStateAt,
  upsertState,
  deleteStatesForEpisode,
  buildAppearanceDirective,
  generateEpisodeStates,
  buildTimeline,
  missingStatesForEpisode,
}
