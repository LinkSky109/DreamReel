import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { storageService } from './storageService.js'
import { getNovelProject, readNovelFile } from './novelProjectService.js'

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

function buildScriptPrompt(text, target) {
  return {
    systemPrompt: '你是影视分镜编剧。只输出 JSON，不要解释。',
    userPrompt: `把下面小说片段改编为**一集**分镜剧本。目标成片时长 ${target} 秒（允许 85–95）。严格输出 JSON：
{"shots":[{"index":1,"description":"画面","dialogue":"台词或旁白","duration":秒}]}
各 shot 的 duration 之和应约等于 ${target}。

片段：
${text.slice(0, 6000)}`,
  }
}

export async function generateEpisodeScript(novelId, episodeId, opts = {}) {
  getNovelProject(novelId)
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
      const { data } = await llm.generateJSON(buildScriptPrompt(text, target))
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
