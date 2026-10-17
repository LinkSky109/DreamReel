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

function buildScriptPrompt(text, target, style = {}, names = []) {
  const styleText = [style.name, style.visual, style.narration].filter((x) => typeof x === 'string' && x).join('；')
  const nameText = names.length ? names.slice(0, 24).join('、') : ''
  return {
    systemPrompt: '你是影视分镜编剧。只输出 JSON，不要解释。每个镜头都必须推动剧情。',
    userPrompt: `把下面小说片段改编为**一集**分镜剧本。目标成片时长 ${target} 秒（允许 85–95）。严格输出 JSON：
{"shots":[{"index":1,"description":"画面","dialogue":"台词或旁白","duration":秒}]}
各 shot 的 duration 之和应约等于 ${target}。

**分镜硬性要求（务必遵守）**：
1. **每个分镜都必须有「人」**：至少一个具名角色出镜并在做某事；**禁止**没有任何角色、纯风景/纯气氛/纯空镜的镜头。
2. **每个分镜都要有信息增量**：动作、对话、冲突、选择或情节推进之一；禁止用风景描写凑时长。
3. 由**角色驱动事件**：镜头里要有"谁在做什么/为什么"，而不是"哪里长什么样"。
4. 环境只能作为角色动作的**背景**写进画面，不能单独成镜。
5. 若原文该段内容不足以支撑 ${target} 秒，允许**减少镜头数**并适当拉长单镜（每镜 6–12 秒），不要用空镜填充。
${nameText ? `6. 本集出现的角色/设定（画面里要用到这些具名对象，名字保持一致）：${nameText}。\n` : ''}
${styleText ? `\n全书统一风格（画面与旁白都保持该基调，画面描述里体现该视觉风格）：${styleText}。\n` : ''}
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
      // 本集正文里出现的具名角色/设定 → 提示模型以它们驱动分镜（也提升参考图命中）
      const names = [
        ...new Set([
          ...listCharacters(novelId).filter((c) => c.name && !isGenericName(c.name) && text.includes(c.name)).map((c) => c.name),
          ...listEntities(novelId).filter((e) => e.name && !isGenericName(e.name) && text.includes(e.name)).map((e) => e.name),
        ]),
      ]
      const { data } = await llm.generateJSON(buildScriptPrompt(text, target, project.style || {}, names))
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
