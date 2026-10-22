import config from '../config/index.js'
import logger from '../utils/logger.js'
import { getLLMProvider } from '../providers/llmProviderFactory.js'
import { getNovelProjectAsync, listChunksAsync } from './novelAsyncReadService.js'
import { updateNovelProject } from './novelProjectService.js'


/**
 * 风格确定（Sprint 20 / S20-2）：全书统一。
 * LLM 可用时产出风格 JSON；否则启发式默认。
 */

const HEURISTIC_STYLE = {
  name: '默认（写实叙事）',
  visual: '按原文基调，自然光、写实质感',
  narration: '忠于原著的第三人称叙事',
  music: '随情节情绪起伏',
}

function buildStylePrompt(sample) {
  return {
    systemPrompt: '你是影视剧的美术与叙事指导。只输出 JSON，不要解释。',
    userPrompt: `根据下面的小说片段，给出**全书统一**的创作风格，严格输出 JSON：
{"name":"风格名","visual":"画面/色调","narration":"叙事基调","music":"配乐情绪"}

小说片段：
${sample}`,
  }
}

export async function generateStyle(novelId) {
  await getNovelProjectAsync(novelId)
  const chunks = await listChunksAsync(novelId)
  if (!chunks.length) throw new Error('尚未摄取正文，请先 ingest')

  const sample = chunks
    .slice(0, 5)
    .map((c) => c.text)
    .join('\n')
    .slice(0, 8000)

  const configured = config.llm && config.llm.provider && config.llm.provider !== 'mock'
  let style
  if (configured) {
    try {
      const llm = getLLMProvider()
      const { data } = await llm.generateJSON(buildStylePrompt(sample))
      style = {
        scope: 'book',
        name: data.name || HEURISTIC_STYLE.name,
        visual: data.visual || '',
        narration: data.narration || '',
        music: data.music || '',
        provider: 'llm',
      }
    } catch (error) {
      logger.warn(`风格 LLM 失败，回退启发式：${error.message}`)
      style = { scope: 'book', ...HEURISTIC_STYLE, provider: 'heuristic' }
    }
  } else {
    style = { scope: 'book', ...HEURISTIC_STYLE, provider: 'heuristic' }
  }

  return updateNovelProject(novelId, { style })
}
