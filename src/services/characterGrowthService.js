import logger from '../utils/logger.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { storageService } from './storageService.js'
import { writeChild, deleteChildStates } from './novelChildStore.js'
import { NovelCharacterState } from '../models/NovelCharacterState.js'
import { getEpisode, getEpisodeText } from './novelEpisodeStore.js'
import { listCharacters } from './characterExtractionService.js'
import { isGenericName } from '../utils/nameFilters.js'
import { getNovelProjectAsync, listCharactersAsync, listStatesAsync } from './novelAsyncReadService.js'

/**
 * 角色成长状态服务（Sprint 20 / S20-3；S32 升级为「按集形象时间线」）
 *
 * 目标：让角色的外观/装备/能力随剧情时间点演进，而不是全片用同一套终态设定。
 * 机制：
 *  - 每个角色在首次出场集由 LLM 从该集原文推导初始形象；
 *  - 之后每集以上一集状态为基准，只依据本集剧情做增量（不允许出现尚未获得的装备）；
 *  - 剧本/出图/出片提示词按「当集状态」组装，替换原静态终态描述。
 */

export async function addState(novelId, characterId, data = {}) {
  const character = (await listCharactersAsync(novelId)).find((c) => c.id === characterId)
  if (!character) {
    throw new Error(`character not found: ${characterId}`)
  }
  const state = new NovelCharacterState({ ...data, novelId, characterId })
  return writeChild('states', state)
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
export async function upsertState(novelId, characterId, episodeNo, patch = {}, { source = 'manual' } = {}) {
  const [chars, states] = await Promise.all([listCharactersAsync(novelId), listStatesAsync(novelId, characterId)])
  const character = chars.find((c) => c.id === characterId)
  if (!character) throw new Error(`character not found: ${characterId}`)
  const existing = states.find((s) => Number(s.episodeNo) === Number(episodeNo))
  if (existing) {
    Object.assign(existing, patch, { source, updatedAt: new Date().toISOString() })
    return writeChild('states', existing)
  }
  const state = new NovelCharacterState({ novelId, characterId, episodeNo, source, ...patch })
  return writeChild('states', state)
}

export async function deleteStatesForEpisode(novelId, episodeNo) {
  return deleteChildStates(novelId, null, episodeNo)
}

/**
 * 组装「形象指令」文本，供剧本/出图/出片提示词使用。
 * 对每个具名角色取「≤该集」的最近状态；没有状态则跳过。
 */
export async function buildAppearanceDirectiveAsync(novelId, episodeNo, names = null) {
  const chars = (await listCharactersAsync(novelId)).filter((c) => c.name && !isGenericName(c.name))
  const wanted = names && names.length ? new Set(names) : null
  const states = await listStatesAsync(novelId)
  const lines = []
  for (const c of chars) {
    if (wanted && !wanted.has(c.name)) continue
    const applicable = states
      .filter((s) => s.characterId === c.id && Number(s.episodeNo) <= Number(episodeNo))
      .sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
    const st = applicable[applicable.length - 1]
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

function buildStatePrompt(episode, text, prevStates, presentNames = [], { compact = false } = {}) {
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
    '7. 每个字段控制在 60 字以内；只输出角色数组，不要解释、不要 markdown。',
    '',
    '【输出】严格 JSON，不要解释：',
    STATE_JSON_SCHEMA,
  ].join('\n')
  // 分镜描述常包含原文没有的出场/形象信息（尤其配角），补进上下文可减少角色漏产出
  const shotLines = (episode.screenplay?.shots || [])
    .slice(0, compact ? 6 : 10)
    .map((s, i) => `#${i + 1} ${String(s.description || '').slice(0, compact ? 80 : 140)}`)
    .filter((x) => x.length > 4)
    .join('\n')
  const user = [
    prevLines,
    nameRule,
    '',
    '【本集标题】' + (episode.title || ''),
    shotLines ? `【本集分镜】\n${shotLines}` : '',
    '【本集正文】',
    String(text || '').slice(0, compact ? 2200 : 4200),
  ].join('\n')
  // 结构化抽取不需要深度思考：显式关闭 thinking，避免 reasoning_tokens 吃光 max_tokens
  // （实测 deepseek-flash 默认会消耗全部预算在 reasoning 上，导致 content 为空）
  return {
    systemPrompt: system,
    userPrompt: user,
    options: { temperature: 0.2, maxTokens: 4000, thinking: { type: 'disabled' } },
  }
}

/** 把数组按 size 分片 */
function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** 取一组角色在上一集的状态（用于增量） */
async function prevStatesFor(novelId, chars, episodeNo) {
  const allStates = await listStatesAsync(novelId)
  const at = (characterId, ep) =>
    allStates
      .filter((s) => s.characterId === characterId && Number(s.episodeNo) <= ep)
      .sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
      .pop() || null
  return chars
    .map((c) => {
      const st = at(c.id, episodeNo - 1) || at(c.id, episodeNo)
      return st
        ? { name: c.name, episodeNo: st.episodeNo, appearance: st.appearance, equipment: st.equipment, injuries: st.injuries, abilities: st.abilities }
        : null
    })
    .filter(Boolean)
}

function normalizeProduced(arr) {
  return (Array.isArray(arr) ? arr : [])
    .filter((x) => x && x.name)
    .map((x) => ({
      name: String(x.name).trim(),
      appearance: String(x.appearance || '').slice(0, 120),
      equipment: String(x.equipment || '').slice(0, 120),
      injuries: String(x.injuries || '').slice(0, 120),
      abilities: String(x.abilities || '').slice(0, 120),
    }))
}

/**
 * 一次 LLM 调用（带预算升级）：先 4000，失败再 8000，最后压缩输入重试。
 * 分片后单次输出量很小，配合预算升级可显著降低「推理吃满 token → 空输出」概率。
 */
async function callStateLLM(llm, ep, text, chars, episodeNo, novelId) {
  const prev = await prevStatesFor(novelId, chars, episodeNo)
  const names = chars.map((c) => c.name)
  const budgets = [4000, 8000]
  let lastError = null
  for (let i = 0; i < budgets.length; i += 1) {
    try {
      const prompt = buildStatePrompt(ep, text, prev, names, { compact: i > 0 })
      prompt.options.maxTokens = budgets[i]
      const res = await llm.generateJSON(prompt)
      const arr = normalizeProduced(res.data && res.data.characters)
      if (arr.length) return arr
    } catch (error) {
      lastError = error
      logger.warn(`角色形象状态 LLM 第 ${i + 1} 次失败（${chars.length} 角色 / maxTokens=${budgets[i]}）：${error.message}`)
    }
  }
  if (lastError) throw lastError
  return []
}

/**
 * 为某一集生成/更新角色形象状态（LLM）。返回写入的状态数组。
 * opts: { names?: string[], provider?: 'heuristic' }
 */
export async function generateEpisodeStates(novelId, episodeId, opts = {}) {
  await getNovelProjectAsync(novelId)
  const ep = await getEpisode(novelId, episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  const episodeNo = Number(ep.episodeNo ?? (ep.chapterIndex ?? 0) + 1)
  const text = await getEpisodeText(novelId, ep)

  const allChars = (await listCharactersAsync(novelId)).filter((c) => c.name && !isGenericName(c.name))
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

  // 名称匹配：支持别名；再退化为「包含」匹配
  const matchChar = (rawName) => {
    const nm = String(rawName || '').trim()
    if (!nm) return null
    const byExact = present.find((c) => c.name === nm || (c.aliases || []).includes(nm))
    if (byExact) return byExact
    return present.find((c) => nm.includes(c.name) || c.name.includes(nm)) || null
  }

  const persist = async (list, source) => {
    const out = []
    for (const item of list) {
      const c = matchChar(item.name)
      if (!c) continue
      out.push(
        await upsertState(
          novelId,
          c.id,
          episodeNo,
          {
            appearance: item.appearance,
            equipment: item.equipment,
            injuries: item.injuries,
            abilities: item.abilities,
            chapterTitle: ep.title || '',
            note: source === 'base' ? 'LLM 未产出，沿用上一集/角色卡（可重跑）' : '',
          },
          { source }
        )
      )
    }
    return out
  }

  const saved = []
  let degraded = []

  if (opts.provider !== 'heuristic') {
    const llm = getLLMProvider()
    // 分片：每片最多 4 个角色，显著降低单次输出量与推理吃满 token 的风险
    for (const group of chunk(present, 4)) {
      try {
        const arr = await callStateLLM(llm, ep, text, group, episodeNo, novelId)
        const matched = new Set()
        const groupSaved = await persist(arr, 'llm')
        for (const item of arr) {
          const c = matchChar(item.name)
          if (c) matched.add(c.id)
        }
        saved.push(...groupSaved)
        // 分片成功但漏掉个别角色（常见于配角）→ 对这些角色单独再试一次
        for (const c of group.filter((x) => !matched.has(x.id))) {
          try {
            const arr = await callStateLLM(llm, ep, text, [c], episodeNo, novelId)
            if (arr.length) saved.push(...(await persist(arr, 'llm')))
            else degraded.push(c)
          } catch {
            degraded.push(c)
          }
        }
      } catch (error) {
        // 分片失败 → 逐角色降级重试（每片 1 人，输入更小）
        logger.warn(`分片失败，改为逐角色重试（第${episodeNo}集）：${error.message}`)
        for (const c of group) {
          try {
            const arr = await callStateLLM(llm, ep, text, [c], episodeNo, novelId)
            saved.push(...(await persist(arr, 'llm')))
            if (!arr.length) degraded.push(c)
          } catch {
            degraded.push(c)
          }
        }
      }
    }
  } else {
    degraded = [...present]
  }

  // 仅对真正没拿到 LLM 结果的角色回退（不使用 description：它可能是终态）
  if (degraded.length) {
    for (const c of degraded) {
      const prev = getCharacterStateAt(novelId, c.id, episodeNo - 1)
      const card = c.card || {}
      saved.push(
        ...(await persist(
          [
            {
              name: c.name,
              appearance: (prev && prev.appearance) || card.appearance || '',
              equipment: (prev && prev.equipment) || '',
              injuries: (prev && prev.injuries) || '',
              abilities: (prev && prev.abilities) || '',
            },
          ],
          'base'
        ))
      )
    }
  }

  const llmCount = saved.filter((s) => s.source === 'llm').length
  logger.info(`角色形象状态已生成 novel=${novelId} ep=${episodeNo} 角色=${saved.length}（LLM ${llmCount} / 回退 ${saved.length - llmCount}）`)
  return saved
}

/** 形象时间线（按角色分组），供 UI 展示 */
export function buildTimeline(novelId) {
  return buildTimelineFrom(listCharacters(novelId), listStates(novelId))
}

/**
 * 用已加载的角色与状态构建时间线（供 PostgreSQL 只读路径复用）。
 * 状态按 characterId 分组、按 episodeNo 升序；角色顺序保持不变。
 */
export function buildTimelineFrom(chars, allStates) {
  const byCharacter = new Map()
  for (const state of allStates) {
    if (!state?.characterId) continue
    if (!byCharacter.has(state.characterId)) byCharacter.set(state.characterId, [])
    byCharacter.get(state.characterId).push(state)
  }
  const out = []
  for (const c of chars) {
    if (!c.name || isGenericName(c.name)) continue
    const states = (byCharacter.get(c.id) || [])
      .slice()
      .sort((a, b) => (a.episodeNo ?? 0) - (b.episodeNo ?? 0))
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

/** 文本相似度（字符二元组 Jaccard），用于判断两个阶段是否真的发生了变化 */
function similarity(a, b) {
  const x = String(a || '').replace(/\s+/g, '')
  const y = String(b || '').replace(/\s+/g, '')
  if (!x && !y) return 1
  if (!x || !y) return 0
  const grams = (s) => {
    const set = new Set()
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2))
    if (!set.size) set.add(s)
    return set
  }
  const A = grams(x)
  const B = grams(y)
  let inter = 0
  for (const g of A) if (B.has(g)) inter += 1
  return inter / (A.size + B.size - inter)
}

/**
 * 从形象时间线里提炼「有意义的阶段」：外观/装备/能力发生实质变化时才切一个阶段。
 * 返回按集号升序的阶段状态（最多 maxStages 个，均匀抽样保留首尾）。
 */
function deriveStagesFromStates(states, { maxStages = 8 } = {}) {
  if (!states.length) return []
  const changed = (a, b) =>
    similarity(a.appearance, b.appearance) < 0.62 ||
    String(a.equipment || '').trim() !== String(b.equipment || '').trim() ||
    similarity(a.abilities, b.abilities) < 0.62 ||
    String(a.injuries || '').trim() !== String(b.injuries || '').trim()

  const stages = [states[0]]
  for (let i = 1; i < states.length; i += 1) {
    if (changed(states[i], stages[stages.length - 1])) stages.push(states[i])
  }
  if (stages.length <= maxStages) return stages

  const picked = []
  for (let i = 0; i < maxStages; i += 1) {
    picked.push(stages[Math.round((i * (stages.length - 1)) / (maxStages - 1))])
  }
  return picked.filter((s, i) => picked.findIndex((x) => x.id === s.id) === i)
}

export function deriveCharacterStages(novelId, characterId, opts = {}) {
  return deriveStagesFromStates(listStates(novelId, characterId), opts)
}

export async function deriveCharacterStagesAsync(novelId, characterId, opts = {}) {
  return deriveStagesFromStates(await listStatesAsync(novelId, characterId), opts)
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
  deriveCharacterStages,
  missingStatesForEpisode,
}
