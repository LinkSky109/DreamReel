import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { assertEditable } from './novelProjectService.js'
import { getEpisode, updateEpisode, getEpisodeText } from './novelEpisodeStore.js'

import { isGenericName } from '../utils/nameFilters.js'
import { buildAppearanceDirective, generateEpisodeStates } from './characterGrowthService.js'
import { getNovelProjectAsync, listCharactersAsync, listEntitiesAsync } from './novelAsyncReadService.js'
import { getOrGenerateOutline } from './episodeOutlineService.js'

/**
 * 单集剧本生成（Sprint 21 / S21-3）
 * LLM（OpenCode）优先，启发式回退；两者都做时长归一，保证总时长 ∈ [85,95]s。
 */

const SHOT_SECONDS = 7.5
const MIN_TOTAL = 85
const MAX_TOTAL = 95

function heuristicScript(text, target) {
  const shotCount = Math.max(4, Math.round(target / SHOT_SECONDS))
  const per = target / shotCount
  const size = Math.max(1, Math.ceil(text.length / shotCount))
  const shots = []
  for (let i = 0; i < shotCount; i++) {
    const seg = text.slice(i * size, (i + 1) * size).trim()
    shots.push({
      index: i + 1,
      description: seg.slice(0, 60),
      dialogue: seg.slice(0, 80),
      duration: Number(per.toFixed(2)),
    })
  }
  return { shots, totalSeconds: Number((per * shotCount).toFixed(2)) }
}

/** 归一：把 shots 时长按比例缩放到 target，并回写 totalSeconds */
function normalizeTotal(script, target) {
  const sum = script.shots.reduce((s, x) => s + (Number(x.duration) || 0), 0) || 1
  const factor = target / sum
  script.shots = script.shots.map((s) => ({
    ...s,
    duration: Number(((Number(s.duration) || 0) * factor).toFixed(2)),
  }))
  script.totalSeconds = Number(script.shots.reduce((s, x) => s + x.duration, 0).toFixed(2))
  return script
}

/**
 * 组装剧本提示词——为「提示词缓存命中」优化（DeepSeek 前缀缓存）：
 *  - 【稳定前缀】systemPrompt：人设/方法论/任务/输出格式/硬性要求/风格/全书核心设定，
 *    跨集**逐字节相同** → 命中缓存（prompt_cache_hit_tokens）。
 *  - 【动态尾部】userPrompt：仅放"本集出场设定 + 本集片段"，必然未命中，但体积小。
 */
function buildScriptPrompt(text, target, style = {}, ctx = {}) {
  const styleText = [style.name, style.visual, style.narration].filter((x) => typeof x === 'string' && x).join('；')
  const coreLines = (ctx.core || []).slice(0, 26)
  const localLines = (ctx.local || []).slice(0, 24)
  const localNames = (ctx.localNames || []).slice(0, 24)

  const systemPrompt = [
    '你是拥有 12 年行业经验的专业剧本创作总监，兼具院线电影、网络剧、竖屏短剧、话剧、动画剧本的全流程创作经验，精通经典编剧理论与当代市场受众心理；既能从 0 到 1 孵化原创，也能基于给定 IP 做专业化改编，输出符合工业标准的成果。',
    '',
    '【方法论基准】',
    '- 竖屏短剧结构：单集用「钩子→升级→反转→留悬」四节拍；每集结尾必留悬念。',
    '- 情节原则：拒绝无效铺垫——每场戏至少同时实现「推进剧情 / 塑造人物 / 渲染情绪」中的两项；冲突逐层升级（个人危机→关系危机→生存危机）；结局回扣核心主题。',
    '- 人物铁则：情节由人物动机驱动而非倒逼；主要角色有「优点-缺陷-秘密」；反派/对手有自洽立场，拒绝工具人。',
    '',
    '【任务定位】你不是在写完整剧本或分场大纲，而是把给定小说片段改编为「一集竖屏短剧分镜表」，输出严格 JSON，不要解释。',
    '',
    '【输出格式（固定）】',
    '{"shots":[{"index":1,"description":"画面（须体现视觉风格与出镜角色）","dialogue":"台词或旁白","duration":秒}]}',
    '各 shot 的 duration 之和应约等于目标时长（允许 85–95s）。',
    '',
    '【分镜硬性要求】',
    '1. 每个分镜都必须有「人」：至少一个具名角色出镜且在做某事；禁止纯风景/纯气氛/纯空镜。',
    '2. 每个分镜都要有信息增量（动作/对话/冲突/选择/情节推进其一）；禁止用风景凑时长。',
    '3. 由角色动机驱动事件：写"谁在做什么/为什么"，环境只作背景、不得单独成镜。',
    '4. 单集结构：按「钩子→升级→反转→留悬」组织；最后一个分镜必须留悬念。',
    '5. 内容不足时减少镜头数并拉长单镜（6–12 秒），不要用空镜填充。',
    '6. 台词/旁白符合人物身份性格、有潜台词，避免口语化冗余与空泛抒情。',
    '',
    '【必须沿用的既有设定】名字/身份必须与下列一致，不得另起名字或编造新设定：',
    coreLines.length ? coreLines.join('\n') : '（无）',
    styleText ? `\n【全书统一风格】${styleText}` : '',
    '【形象时间线铁律】角色的外观/装备/能力必须符合其在本集剧情时间点的状态，严禁让角色提前使用尚未获得的装备、变身形态或后期能力；本集应有形象以「本集角色状态」为准。',
  ]
    .filter(Boolean)
    .join('\n')

  const userPrompt = [
    target ? `目标成片时长：${target} 秒。` : '',
    localNames.length ? `【本集出场的角色/设定（须在画面中体现且名字一致）】${localNames.join('、')}` : '',
    localLines.length ? localLines.join('\n') : '',
    ctx.appearanceDirective ? `\n【本集角色状态（画面须严格按此时点形象，不得提前出现未获得装备）】\n${ctx.appearanceDirective}` : '',
    '',
    '【本集小说片段】',
    text.slice(0, 6000),
  ]
    .filter(Boolean)
    .join('\n')

  return { systemPrompt, userPrompt, options: { temperature: 0.6, maxTokens: 4000 } }
}

/** 全书核心设定（稳定、跨集一致 → 利于缓存命中） */
async function bookCoreLines(novelId) {
  const key = (x) => [-(x.mentions || 0), String(x.name)]
  const chars = (await listCharactersAsync(novelId))
    .filter((c) => c.name && !isGenericName(c.name))
    .sort((a, b) => key(a)[0] - key(b)[0] || a.name.localeCompare(b.name))
    .slice(0, 14)
  const ents = (await listEntitiesAsync(novelId))
    .filter((e) => e.name && !isGenericName(e.name))
    .sort((a, b) => key(a)[0] - key(b)[0] || a.name.localeCompare(b.name))
    .slice(0, 12)
  const cl = chars.map((c) => {
    const card = c.card || {}
    // 只放稳定的人格底色：外貌/能力随剧情演进，改由「本集角色状态」提供，避免终态泄漏到早期集
    const bits = [card.personality].filter(Boolean).map((s) => String(s).slice(0, 48))
    const alias = (c.aliases || []).length ? `（别名 ${c.aliases.slice(0, 3).join('/')}）` : ''
    return `- ${c.name}${alias}：${bits.join('；') || '（人格见原文，形象按本集状态）'}`
  })
  const el = ents.map((e) => `- ${e.name}（${e.type}）：${String(e.description || '').slice(0, 40)}`)
  return [...cl, ...el]
}

export async function generateEpisodeScript(novelId, episodeId, opts = {}) {
  const project = await getNovelProjectAsync(novelId)
  assertEditable(project, 'episodes')
  const ep = await getEpisode(novelId, episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)

  // 懒生成分集大纲（已有则直接复用；mock/不可用时走启发式，不影响剧本生成）
  try {
    await getOrGenerateOutline(novelId, episodeId, {
      useLLM: opts.provider !== 'heuristic',
      provider: opts.outlineProvider,
    })
  } catch (error) {
    logger.warn(`分集大纲生成失败，继续生成剧本：${error.message}`)
  }

  const text = await getEpisodeText(novelId, ep)
  const target = ep.targetSeconds || 90
  const configured = config.llm && config.llm.provider && config.llm.provider !== 'mock'

  let screenplay = null
  let provider = 'heuristic'
  if (configured && opts.provider !== 'heuristic') {
    try {
      const llm = getLLMProvider()
      // 稳定前缀：全书核心设定（跨集一致 → 命中缓存）
      const core = await bookCoreLines(novelId)
      // 动态尾部：本集正文里出现的具名角色/设定
      const localChars = (await listCharactersAsync(novelId))
        .filter((c) => c.name && !isGenericName(c.name) && text.includes(c.name))
        .slice(0, 12)
      const localEnts = (await listEntitiesAsync(novelId))
        .filter((e) => e.name && !isGenericName(e.name) && text.includes(e.name))
        .slice(0, 12)
      const local = [
        ...localChars.map((c) => {
          const card = c.card || {}
          // 不放静态外貌/能力（可能已含终态）；形象统一由「本集角色状态」提供
          const bits = [card.personality].filter(Boolean).map((s) => String(s).slice(0, 40))
          return `- ${c.name}：${bits.join('；') || '（人格见原文）'}`
        }),
        ...localEnts.map((e) => `- ${e.name}（${e.type}）：${String(e.description || '').slice(0, 36)}`),
      ]
      const localNames = [...new Set([...localChars.map((c) => c.name), ...localEnts.map((e) => e.name)])]
      const episodeNo = Number(ep.episodeNo ?? (ep.chapterIndex ?? 0) + 1)
      const appearanceDirective = await buildAppearanceDirective(novelId, episodeNo, localNames)
      const ctx = { core, local, localNames, appearanceDirective }
      const res = await llm.generateJSON(buildScriptPrompt(text, target, project.style || {}, ctx))
      const data = res.data
      if (res.usage && typeof res.usage.prompt_cache_hit_tokens === 'number') {
        logger.info(`剧本缓存：命中 ${res.usage.prompt_cache_hit_tokens} / 未命中 ${res.usage.prompt_cache_miss_tokens} tokens`)
      }
      if (data && Array.isArray(data.shots) && data.shots.length) {
        screenplay = {
          shots: data.shots.map((s, i) => ({
            index: i + 1,
            description: s.description || '',
            dialogue: s.dialogue || '',
            duration: Number(s.duration) || SHOT_SECONDS,
          })),
          totalSeconds: 0,
        }
        screenplay = normalizeTotal(screenplay, target)
        provider = 'llm'
      }
    } catch (error) {
      logger.warn(`剧本 LLM 失败，回退启发式：${error.message}`)
    }
  }
  if (!screenplay) screenplay = normalizeTotal(heuristicScript(text, target), target)

  // 时长约束（85–95）
  if (screenplay.totalSeconds < MIN_TOTAL || screenplay.totalSeconds > MAX_TOTAL) {
    screenplay = normalizeTotal(screenplay, target)
  }

  ep.screenplay = screenplay
  ep.status = 'scripted'
  ep.scriptProvider = provider
  await updateEpisode(novelId, ep)

  // 生成/刷新本集角色形象状态（供出图/出片按剧情时间点使用；失败不影响剧本本身）
  try {
    await generateEpisodeStates(novelId, episodeId, { provider: opts.stateProvider })
  } catch (error) {
    logger.warn(`本集角色形象状态生成失败：${error.message}`)
  }
  return ep
}

export async function getEpisodeScript(novelId, episodeId) {
  const ep = await getEpisode(novelId, episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  return ep.screenplay
}
