import {} from './baseTTSProvider.js'
import { MockTTSProvider } from './mockTTSProvider.js'
import { ElevenLabsTTSProvider } from './elevenLabsTTSProvider.js'
import { VolcTTSProvider } from './volcTTSProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'
import { composeWithFallback } from '../services/executionRouter.js'

const PROVIDER_MAP = {
  mock: MockTTSProvider,
  volc: VolcTTSProvider,
  elevenlabs: ElevenLabsTTSProvider,
}

// TTS 模型元数据目录
export const TTS_MODEL_CATALOG = [
  { id: 'mock', name: 'Mock TTS', vendor: '本地', strengths: ['测试', '离线'], default: true, models: [{ id: 'mock', name: 'Mock', default: true }] },
  { id: 'volc', name: '豆包语音 TTS（火山）', vendor: '字节跳动', strengths: ['中文强', '多音色', '情感语气'], default: false, models: [
    { id: 'seed-tts-2.0', name: 'Seed-TTS 2.0（大模型语音合成）', default: true },
  ] },
  { id: 'elevenlabs', name: 'ElevenLabs', vendor: 'ElevenLabs (美)', strengths: ['情感丰富', '多语言', '自然'], default: false, models: [
    { id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1', default: true },
    { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2', default: false },
  ] },
]

let activeProvider = null

function rawTTS(name, { model = null, prefConfig = {} } = {}) {
  const ProviderClass = PROVIDER_MAP[name]
  if (!ProviderClass) return null
  return new ProviderClass(buildMergedConfig('tts', name, prefConfig, model))
}

function buildTTSChain(primaryName, { projectId = null, userId = null, model = null, prefConfig = {} } = {}) {
  const baseMeta = { stage: 'tts', projectId, userId, deadlineMs: config.tts.attemptTimeoutMs || 0 }
  const primary = rawTTS(primaryName, { model, prefConfig }) || new MockTTSProvider(config.tts)
  const raws = [primary]
  const fallbacks = (config.tts.fallbackProviders || []).filter(
    (n) => n && n !== primaryName && PROVIDER_MAP[n] && isProviderConfigured('tts', n)
  )
  for (const n of fallbacks) {
    const p = rawTTS(n)
    if (p) raws.push(p)
  }
  if (raws.length > 1) logger.info(`TTS 回退链: ${raws.map((x) => x.name).join(' → ')}`)
  return composeWithFallback(raws, baseMeta, ['synthesize'])
}

export function getTTSProvider() {
  if (activeProvider) return activeProvider
  const providerName = config.tts.provider
  if (!PROVIDER_MAP[providerName]) logger.warn(`Unknown TTS provider: ${providerName}, falling back to mock`)
  activeProvider = buildTTSChain(providerName)
  logger.info(`TTS provider initialized: ${activeProvider.name}`)
  return activeProvider
}

/**
 * 获取项目感知的 TTS Provider 实例（Phase 1）
 * @param {string|null} projectId
 * @param {string|null} userId
 * @returns {BaseTTSProvider}
 */
export function getTTSProviderForProject(projectId = null, userId = null) {
  if (!projectId && !userId) {
    return getTTSProvider()
  }
  const resolved = resolveProviderConfig('tts', projectId, userId)
  return buildTTSChain(resolved.provider, {
    projectId,
    userId,
    model: resolved.model,
    prefConfig: resolved.config,
  })
}

export function resetTTSProvider() {
  activeProvider = null
}

export function getAvailableProviders() {
  return Object.keys(PROVIDER_MAP)
}

/**
 * 获取 TTS 模型目录
 */
export function getTTSModelCatalog() {
  return TTS_MODEL_CATALOG.map((p) => ({
    ...p,
    configured: isProviderConfigured('tts', p.id),
  }))
}

export default getTTSProvider
