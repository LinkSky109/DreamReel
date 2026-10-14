import config from '../config/index.js'
import logger from '../utils/logger.js'
import { generateId } from '../utils/idGenerator.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { storageService } from './storageService.js'
import { WorldEntity, WORLD_TYPES, WORLD_TYPE_LABELS } from '../models/WorldEntity.js'
import { getNovelProject, updateNovelProject, writeNovelFile, assertEditable } from './novelProjectService.js'
import { listChunks } from './novelChunkService.js'

/**
 * 世界观设定集（Sprint 25）
 * 抽取 种族/势力/重要事件/装备/文化/地点/力量体系 等实体及其关系，覆盖全书（分片）。
 * LLM 优先（分片抽取 + 合并去重），启发式兜底。
 */

const TYPE_SUFFIX = {
  faction: /[\u4e00-\u9fa5]{2,6}(帝国|王国|联盟|公会|军团|家族|宗派|组织|教团|联邦|议会|公司|军|帮)/g,
  event: /[\u4e00-\u9fa5]{2,6}(战争|起义|革命|毁灭|陷落|统一|大战|叛乱|灾变|核爆)/g,
  item: /[\u4e00-\u9fa5]{2,6}(装甲|殖装|机甲|飞船|武器|装置|核心|芯片|药剂|战舰)/g,
  race: /[\u4e00-\u9fa5]{1,4}(族|人种|兽人|灵族|妖族|魔族|神族)/g,
  culture: /[\u4e00-\u9fa5]{1,4}(教|信仰|习俗|节日|礼仪|文字|语言)/g,
  power: /[\u4e00-\u9fa5]{1,4}(异能|法术|能量|进化|血脉|基因)/g,
}

function countOccurrences(text, name) {
  if (!name) return 0
  let n = 0
  let i = text.indexOf(name)
  while (i !== -1) {
    n++
    i = text.indexOf(name, i + name.length)
  }
  return n
}

export function heuristicExtract(text, { minFreq = 3, max = 80 } = {}) {
  const found = []
  for (const [type, re] of Object.entries(TYPE_SUFFIX)) {
    const seen = new Map()
    for (const m of text.match(re) || []) {
      seen.set(m, (seen.get(m) || 0) + 1)
    }
    for (const [name, c] of seen.entries()) {
      if (c >= minFreq) found.push({ type, name, aliases: [], description: '', relations: [], count: c })
    }
  }
  return found.sort((a, b) => b.count - a.count).slice(0, max)
}

function buildWorldPrompt(sample) {
  return {
    systemPrompt:
      '你是小说世界观设定分析师。只输出 JSON，不要解释。合并同一实体的别名；relations 的 target 用实体名。',
    userPrompt: `阅读下面小说片段，抽取世界观设定，严格输出 JSON：
{"entities":[{"type":"race|faction|event|item|culture|location|power|other","name":"","aliases":[],"description":"","attributes":{},"relations":[{"target":"","kind":"所属|敌对|盟友|参与|拥有|源于|位于"}]}]}

要求：尽量覆盖 种族/势力/重要事件/装备/文化；不要臆造未出现内容。

片段：
${sample}`,
  }
}

function mergeEntities(all) {
  const byKey = new Map()
  for (const e of all) {
    const name = (e.name || '').trim()
    if (!name) continue
    const type = WORLD_TYPES.includes(e.type) ? e.type : 'other'
    const key = `${type}::${name}`
    const aliases = Array.isArray(e.aliases) ? e.aliases.filter(Boolean) : []
    const relations = Array.isArray(e.relations) ? e.relations.filter((r) => r && r.target) : []
    if (!byKey.has(key)) {
      byKey.set(key, { type, name, aliases: [...aliases], description: e.description || '', attributes: e.attributes || {}, relations: [...relations] })
    } else {
      const cur = byKey.get(key)
      cur.aliases = [...new Set([...cur.aliases, ...aliases])].filter((a) => a !== name)
      if ((e.description || '').length > cur.description.length) cur.description = e.description
      const rk = new Set(cur.relations.map((r) => `${r.target}::${r.kind}`))
      for (const r of relations) {
        const k = `${r.target}::${r.kind}`
        if (!rk.has(k)) { cur.relations.push(r); rk.add(k) }
      }
      cur.attributes = { ...cur.attributes, ...(e.attributes || {}) }
    }
  }
  return [...byKey.values()]
}

export async function extractWorld(novelId, opts = {}) {
  const project = getNovelProject(novelId)
  assertEditable(project, 'world')
  const chunks = listChunks(novelId)
  if (!chunks.length) throw new Error('尚未摄取正文，请先 ingest')

  const maxChapters = opts.maxChapters && opts.maxChapters > 0 ? opts.maxChapters : 30
  const chunkSize = opts.chunkSize && opts.chunkSize > 0 ? opts.chunkSize : 10
  const useChunks = chunks.slice(0, maxChapters)
  const fullText = useChunks.map((c) => c.text).join('\n')

  const configured = config.llm && config.llm.provider && config.llm.provider !== 'mock'
  const useLLM = opts.provider ? opts.provider === 'llm' : configured

  let raw = []
  let provider = 'heuristic'
  if (useLLM) {
    provider = 'llm'
    const llm = getLLMProvider()
    let okChunks = 0
    for (let i = 0; i < useChunks.length; i += chunkSize) {
      const group = useChunks.slice(i, i + chunkSize)
      const sample = group.map((c) => `【${c.chapterTitle}】\n${c.text}`).join('\n').slice(0, 8000)
      try {
        const { data } = await llm.generateJSON(buildWorldPrompt(sample))
        if (data && Array.isArray(data.entities)) {
          raw.push(...data.entities)
          okChunks++
        }
      } catch (error) {
        // 单个分片失败不影响其它分片
        logger.warn(`世界观分片 ${i / chunkSize + 1} 失败，跳过：${error.message}`)
      }
    }
    logger.info(`世界观 LLM 抽取完成：${okChunks} 个分片成功，累计 ${raw.length} 实体`)
    if (okChunks === 0) {
      logger.warn('世界观 LLM 全部分片失败，回退启发式')
      provider = 'heuristic-fallback'
      raw = heuristicExtract(fullText)
    }
  } else {
    raw = heuristicExtract(fullText)
  }

  const merged = mergeEntities(raw)
  for (const e of merged) {
    e.mentions = countOccurrences(fullText, e.name)
  }

  // 清理旧实体
  if (storageService.data.novelWorldEntities) {
    for (const e of storageService.listWorldEntities(novelId)) delete storageService.data.novelWorldEntities[e.id]
  }

  const saved = merged.map((e) =>
    storageService.createWorldEntity(
      new WorldEntity({
        novelId,
        type: e.type,
        name: e.name,
        aliases: e.aliases,
        description: e.description,
        attributes: e.attributes,
        relations: e.relations,
        mentions: e.mentions,
        provider,
      })
    )
  )

  writeNovelFile(novelId, 'worldbuilding/entities.json', JSON.stringify(saved, null, 2))

  // 备选集合：每次抽取生成一个候选集合，默认选中最新
  const set = storageService.createWorldSet({
    id: generateId(),
    novelId,
    provider,
    createdAt: new Date().toISOString(),
    entityIds: saved.map((e) => e.id),
  })
  updateNovelProject(novelId, {
    worldSets: [...(project.worldSets || []), set.id],
    selectedWorldSet: set.id,
  })

  const summary = summarize(novelId)
  return { project: getNovelProject(novelId), provider, entities: saved.length, summary, set }
}

/** 选定某个世界观集合为当前生效 */
export function selectWorldSet(novelId, setId) {
  const project = getNovelProject(novelId)
  assertEditable(project, 'world')
  const set = storageService.getWorldSet(setId)
  if (!set || set.novelId !== novelId) throw new Error(`world set not found: ${setId}`)
  return updateNovelProject(novelId, { selectedWorldSet: setId })
}

/** 备选集合列表（含实体数） */
export function listWorldSets(novelId) {
  const project = storageService.getNovelProject(novelId)
  return (project?.worldSets || [])
    .map((sid) => {
      const set = storageService.getWorldSet(sid)
      return set ? { id: set.id, provider: set.provider, createdAt: set.createdAt, count: set.entityIds.length, selected: sid === project.selectedWorldSet } : null
    })
    .filter(Boolean)
}

export function listEntities(novelId, type) {
  const project = storageService.getNovelProject(novelId)
  let list = storageService.listWorldEntities(novelId)
  const setId = project && project.selectedWorldSet
  if (setId) {
    const set = storageService.getWorldSet(setId)
    if (set) {
      const ids = new Set(set.entityIds)
      list = list.filter((e) => ids.has(e.id))
    }
  }
  return (type ? list.filter((e) => e.type === type) : list).sort((a, b) => (b.mentions || 0) - (a.mentions || 0))
}

/** 关系（解析 target 到实体 id） */
export function listRelations(novelId) {
  const entities = storageService.listWorldEntities(novelId)
  const byName = new Map(entities.map((e) => [e.name, e.id]))
  const out = []
  for (const e of entities) {
    for (const r of e.relations || []) {
      out.push({ from: e.id, fromName: e.name, to: byName.get(r.target) || null, toName: r.target, kind: r.kind || '' })
    }
  }
  return out
}

export function summarize(novelId) {
  const entities = storageService.listWorldEntities(novelId)
  const byType = {}
  for (const t of WORLD_TYPES) byType[t] = 0
  for (const e of entities) byType[e.type] = (byType[e.type] || 0) + 1
  const missing = WORLD_TYPES.filter((t) => ['race', 'faction', 'event', 'item', 'culture'].includes(t) && byType[t] === 0)
  return {
    total: entities.length,
    byType,
    byTypeLabel: Object.fromEntries(Object.entries(byType).map(([k, v]) => [WORLD_TYPE_LABELS[k] || k, v])),
    relations: listRelations(novelId).length,
    missingCoreTypes: missing.map((t) => WORLD_TYPE_LABELS[t]),
    provider: entities[0]?.provider || null,
  }
}
