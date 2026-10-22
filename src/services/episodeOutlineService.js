import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getNovelProjectAsync, listCharactersAsync } from './novelAsyncReadService.js'
import { getEpisode, getSeason, updateEpisode, getEpisodeText } from './novelEpisodeStore.js'
import { getLLMProviderByPref } from '../providers/llmProviderFactory.js'
import { isProviderConfigured } from '../providers/providerResolver.js'
import { isGenericName } from '../utils/nameFilters.js'

/**
 * 分集大纲（懒生成）。
 *
 * 只有进入/生成某一集时才调用；结果写回 episode.outline 并复用。
 * LLM 不可用（mock/未配置/调用失败）时用启发式大纲兜底，保证流程不阻塞。
 */

const OUTLINE_SYSTEM =
  '你是有 12 年行业经验的剧集策划。只输出 JSON，不要解释，不要 Markdown 代码块。'

function resolveProvider(project, opts = {}) {
  if (opts.useLLM === false || opts.provider === 'heuristic') return null
  const pref = opts.provider
    ? { provider: opts.provider, model: opts.model || null }
    : project?.providerPreferences?.llm || null
  const name = pref?.provider || config.llm.provider
  if (!name || name === 'mock') return null
  if (!isProviderConfigured('llm', name)) return null
  try {
    const provider = getLLMProviderByPref(pref)
    if (!provider || provider.name === 'mock') return null
    return provider
  } catch (error) {
    logger.warn(`大纲 LLM 初始化失败，回退启发式：${error.message}`)
    return null
  }
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[。！？…；!?;])/)
    .map((s) => s.trim())
    .filter(Boolean)
}

async function heuristicOutline(novelId, episode, text) {
  const sentences = splitSentences(text)
  const chars = (await listCharactersAsync(novelId))
    .filter((c) => c.name && !isGenericName(c.name) && text.includes(c.name))
    .slice(0, 6)
    .map((c) => c.name)
  return {
    title: episode.title || episode.chapterTitle || '',
    coreConflict: (sentences[0] || text.slice(0, 60) || '').slice(0, 80),
    synopsis: (sentences.slice(0, 4).join('') || text.slice(0, 160) || '').slice(0, 200),
    cliffhanger: (sentences[sentences.length - 1] || '').slice(0, 100),
    keyCharacters: chars,
    provider: 'heuristic',
  }
}

async function llmOutline(provider, { episode, season, text }) {
  const seasonCtx = season
    ? [`【季】${season.title || ''}`, season.goal ? `【季目标】${season.goal}` : '', season.endingHook ? `【季末钩子】${season.endingHook}` : '']
        .filter(Boolean)
        .join('\n')
    : ''
  const userPrompt = [
    '为以下这一集小说内容写分集大纲。严格输出 JSON：',
    '{"title":"","coreConflict":"","synopsis":"","cliffhanger":"","keyCharacters":[""]}',
    '要求：忠于原文；核心冲突一句话；梗概 80-150 字；收尾悬念要能让观众想看下一集；重点出场角色只列本集出现的。',
    seasonCtx,
    `【本集标题】${episode.title || episode.chapterTitle || ''}`,
    '【本集正文】',
    String(text || '').slice(0, 6000),
  ]
    .filter(Boolean)
    .join('\n')
  const res = await provider.generateJSON({
    systemPrompt: OUTLINE_SYSTEM,
    userPrompt,
    options: { temperature: 0.5, maxTokens: 1200 },
  })
  const data = res.data || {}
  return {
    title: String(data.title || episode.title || '').slice(0, 120),
    coreConflict: String(data.coreConflict || '').slice(0, 200),
    synopsis: String(data.synopsis || '').slice(0, 600),
    cliffhanger: String(data.cliffhanger || '').slice(0, 200),
    keyCharacters: Array.isArray(data.keyCharacters)
      ? data.keyCharacters.slice(0, 12).map((x) => String(x))
      : [],
    provider: 'llm',
  }
}

/**
 * 获取或生成某集大纲（懒生成）。
 * @param {string} novelId
 * @param {string} episodeId
 * @param {object} opts { force?:boolean, useLLM?:boolean, provider?:string, model?:string }
 */
export async function getOrGenerateOutline(novelId, episodeId, opts = {}) {
  const project = await getNovelProjectAsync(novelId)
  const episode = await getEpisode(novelId, episodeId)
  if (!episode || episode.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  if (episode.outline && !opts.force) return episode.outline

  const text = await getEpisodeText(novelId, episode)
  const season = episode.seasonId ? await getSeason(novelId, episode.seasonId) : null
  const provider = resolveProvider(project, opts)

  let outline
  if (provider) {
    try {
      outline = await llmOutline(provider, { episode, season, text })
    } catch (error) {
      logger.warn(`分集大纲 LLM 失败，回退启发式（${episodeId}）：${error.message}`)
      outline = await heuristicOutline(novelId, episode, text)
    }
  } else {
    outline = await heuristicOutline(novelId, episode, text)
  }

  outline.generatedAt = new Date().toISOString()
  episode.outline = outline
  await updateEpisode(novelId, episode)
  return outline
}

export default getOrGenerateOutline
