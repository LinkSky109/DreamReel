import {} from './baseLLMProvider.js'
import { MockLLMProvider } from './mockLLMProvider.js'
import { OpenAILLMProvider } from './openaiLLMProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'

const PROVIDER_MAP = {
  mock: MockLLMProvider,
  openai: OpenAILLMProvider,
}

// LLM 模型元数据目录
export const LLM_MODEL_CATALOG = [
  { id: 'mock', name: 'Mock LLM', vendor: '本地', strengths: ['测试', '离线'], default: true, models: [{ id: 'mock', name: 'Mock', default: true }] },
  { id: 'openai', name: 'OpenAI GPT', vendor: 'OpenAI (美)', strengths: ['通用能力强', '英文优秀'], default: false, models: [
    { id: 'gpt-4o', name: 'GPT-4o', default: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', default: false },
  ] },
]

let activeProvider = null

export function getLLMProvider() {
  if (activeProvider) return activeProvider

  const providerName = config.llm.provider
  const ProviderClass = PROVIDER_MAP[providerName]

  if (!ProviderClass) {
    logger.warn(`Unknown LLM provider: ${providerName}, falling back to mock`)
    activeProvider = new MockLLMProvider(config.llm)
  } else {
    activeProvider = new ProviderClass(config.llm)
  }

  logger.info(`LLM provider initialized: ${activeProvider.name}`)
  return activeProvider
}

/**
 * 获取项目感知的 LLM Provider 实例（Phase 1）
 * @param {string|null} projectId
 * @param {string|null} userId
 * @returns {BaseLLMProvider}
 */
export function getLLMProviderForProject(projectId = null, userId = null) {
  if (!projectId && !userId) {
    return getLLMProvider()
  }

  const resolved = resolveProviderConfig('llm', projectId, userId)
  const ProviderClass = PROVIDER_MAP[resolved.provider]

  if (!ProviderClass) {
    logger.warn(`Unknown LLM provider: ${resolved.provider}, falling back to mock`)
    return new MockLLMProvider(config.llm)
  }

  const mergedConfig = buildMergedConfig('llm', resolved.provider, resolved.config, resolved.model)
  const instance = new ProviderClass(mergedConfig)
  logger.info(`LLM provider for project=${projectId}: ${instance.name} (source=${resolved.source})`)
  return instance
}

export function resetLLMProvider() {
  activeProvider = null
}

export function getAvailableProviders() {
  return Object.keys(PROVIDER_MAP)
}

/**
 * 获取 LLM 模型目录
 */
export function getLLMModelCatalog() {
  return LLM_MODEL_CATALOG.map((p) => ({
    ...p,
    configured: isProviderConfigured('llm', p.id),
  }))
}

export default getLLMProvider
