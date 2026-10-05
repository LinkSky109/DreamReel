import { BaseTTSProvider } from './baseTTSProvider.js'
import { MockTTSProvider } from './mockTTSProvider.js'
import { ElevenLabsTTSProvider } from './elevenLabsTTSProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'

const PROVIDER_MAP = {
  mock: MockTTSProvider,
  elevenlabs: ElevenLabsTTSProvider,
}

// TTS 模型元数据目录
export const TTS_MODEL_CATALOG = [
  { id: 'mock', name: 'Mock TTS', vendor: '本地', strengths: ['测试', '离线'], default: true, models: [{ id: 'mock', name: 'Mock', default: true }] },
  { id: 'elevenlabs', name: 'ElevenLabs', vendor: 'ElevenLabs (美)', strengths: ['情感丰富', '多语言', '自然'], default: false, models: [
    { id: 'eleven_monolingual_v1', name: 'Eleven Monolingual v1', default: true },
    { id: 'eleven_multilingual_v2', name: 'Eleven Multilingual v2', default: false },
  ] },
]

let activeProvider = null

export function getTTSProvider() {
  if (activeProvider) return activeProvider

  const providerName = config.tts.provider
  const ProviderClass = PROVIDER_MAP[providerName]

  if (!ProviderClass) {
    logger.warn(`Unknown TTS provider: ${providerName}, falling back to mock`)
    activeProvider = new MockTTSProvider(config.tts)
  } else {
    activeProvider = new ProviderClass(config.tts)
  }

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
  const ProviderClass = PROVIDER_MAP[resolved.provider]

  if (!ProviderClass) {
    logger.warn(`Unknown TTS provider: ${resolved.provider}, falling back to mock`)
    return new MockTTSProvider(config.tts)
  }

  const mergedConfig = buildMergedConfig('tts', resolved.provider, resolved.config, resolved.model)
  const instance = new ProviderClass(mergedConfig)
  logger.info(`TTS provider for project=${projectId}: ${instance.name} (source=${resolved.source})`)
  return instance
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
