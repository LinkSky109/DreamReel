import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { storageService } from './storageService.js'
import { getNovelProject, readNovelFile, assertEditable } from './novelProjectService.js'
import { listCharacters } from './characterExtractionService.js'
import { listEntities } from './worldbuildingService.js'
import { isGenericName } from '../utils/nameFilters.js'

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

function buildScriptPrompt(text, target, style = {}, ctx = {}) {
  const styleText = [style.name, style.visual, style.narration].filter((x) => typeof x === 'string' && x).join('；')
  const names = (ctx && ctx.names) || []
  const nameText = names.length ? names.slice(0, 24).join('、') : ''
  const settingLines = [...((ctx && ctx.charLines) || []), ...((ctx && ctx.entLines) || [])].slice(0, 30)
  const systemPrompt = [
    '你是拥有 12 年行业经验的专业剧本创作总监，兼具院线电影、网络剧、竖屏短剧、话剧、动画剧本的全流程创作经验，精通经典编剧理论与当代市场受众心理；既能从 0 到 1 孵化原创，也能基于给定 IP 做专业化改编，输出符合工业标准的成果。',
    '方法论基准：',
    '- 竖屏短剧结构：单集用「钩子→升级→反转→留悬」四节拍；每集结尾必留悬念。',
    '- 情节原则：拒绝无效铺垫——每场戏至少同时实现「推进剧情 / 塑造人物 / 渲染情绪」中的两项；冲突逐层升级（个人危机→关系危机→生存危机）；结局回扣核心主题。',
    '- 人物铁则：情节由人物动机驱动而非倒逼；主要角色有「优点-缺陷-秘密」；反派/对手有自洽立场，拒绝工具人。',
    '当前任务定位：你**不是**在写完整剧本或分场大纲，而是把给定小说片段改编为**一集的竖屏短剧分镜表**（每集约 1–2 分钟），输出严格 JSON，不要解释。',
    '合规要求（最重要）：**每个分镜都必须至少有一个具名角色出镜并做某事**；禁止纯风景/纯气氛/纯空镜；环境只能作为角色动作的背景。',
  ].join('\n')
  return {
    systemPrompt,
    userPrompt: `把下面小说片段改编为**一集**竖屏短剧分镜脚本。目标成片时长 ${target} 秒（允许 85–95）。严格输出 JSON：
{"shots":[{"index":1,"description":"画面","dialogue":"台词或旁白","duration":秒}]}
各 shot 的 duration 之和应约等于 ${target}。

**分镜硬性要求**：
1. **每个分镜都必须有「人」**：至少一个具名角色出镜且在做某事；禁止没有任何角色、纯风景/纯气氛/纯空镜的镜头。
2. **每个分镜都要有信息增量**：动作、对话、冲突、选择或情节推进之一；禁止用风景描写凑时长。
3. 由**角色动机驱动事件**：镜头里要有"谁在做什么/为什么"，而不是"哪里长什么样"。
4. 环境只能作为角色动作的**背景**写进画面，不能单独成镜。
5. **单集结构**：按「钩子→升级→反转→留悬」四节拍组织；**最后一个分镜必须留悬念/钩子**。
6. 若原文该段内容不足以支撑 ${target} 秒，**减少镜头数并拉长单镜（6–12 秒）**，不要用空镜填充。
7. 台词/旁白符合人物身份性格、有潜台词，避免口语化冗余与空泛抒情。
${nameText ? `\n**必须沿用的既有设定**（角色/世界观阶段已建立；画面与台词里的名字、形象、身份必须与之一致，不得另起名字或编造新设定）：\n${settingLines.join('\n')}\n` : ''}
${styleText ? `\n全书统一风格（画面与旁白都保持该基调，画面描述里体现该视觉风格）：${styleText}\n` : ''}
片段：
${text.slice(0, 6000)}`,
    options: { temperature: 0.6, maxTokens: 4000 },
  }
}

export async function generateEpisodeScript(novelId, episodeId, opts = {}) {
  const project = getNovelProject(novelId)
  assertEditable(project, 'episodes')
  const ep = storageService.getEpisode(episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)

  const text = readNovelFile(novelId, ep.sourceFile)?.toString('utf-8') || ''
  const target = ep.targetSeconds || 90
  const configured = config.llm && config.llm.provider && config.llm.provider !== 'mock'

  let screenplay = null
  let provider = 'heuristic'
  if (configured && opts.provider !== 'heuristic') {
    try {
      const llm = getLLMProvider()
      // 本集正文里出现的具名角色/设定 → 连同关键属性喂给模型（沿用既有设定 + 提升参考图命中）
      const chars = listCharacters(novelId)
        .filter((c) => c.name && !isGenericName(c.name) && text.includes(c.name))
        .slice(0, 14)
      const ents = listEntities(novelId)
        .filter((e) => e.name && !isGenericName(e.name) && text.includes(e.name))
        .slice(0, 16)
      const charLines = chars.map((c) => {
        const card = c.card || {}
        const bits = [card.appearance, card.personality, card.abilities, card.combatStyle, card.identity]
          .filter(Boolean)
          .map((s) => String(s).slice(0, 70))
        const alias = (c.aliases || []).length ? `（别名 ${c.aliases.slice(0, 3).join('/')}）` : ''
        return `- ${c.name}${alias}：${bits.join('；') || String(c.description || '').slice(0, 70)}`
      })
      const entLines = ents.map((e) => `- ${e.name}（${e.type}）：${String(e.description || '').slice(0, 60)}`)
      const ctx = { names: [...new Set([...chars.map((c) => c.name), ...ents.map((e) => e.name)])], charLines, entLines }
      const { data } = await llm.generateJSON(buildScriptPrompt(text, target, project.style || {}, ctx))
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
  storageService.updateEpisode(ep)
  return ep
}

export function getEpisodeScript(novelId, episodeId) {
  const ep = storageService.getEpisode(episodeId)
  if (!ep || ep.novelId !== novelId) throw new Error(`episode not found: ${episodeId}`)
  return ep.screenplay
}
