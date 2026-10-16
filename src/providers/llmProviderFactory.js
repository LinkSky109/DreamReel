import {} from './baseLLMProvider.js'
import { MockLLMProvider } from './mockLLMProvider.js'
import { OpenAILLMProvider } from './openaiLLMProvider.js'
import { OpencodeLLMProvider } from './opencodeLLMProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'

const PROVIDER_MAP = {
  mock: MockLLMProvider,
  openai: OpenAILLMProvider,
  opencode: OpencodeLLMProvider,
}

// LLM 模型元数据目录
export const LLM_MODEL_CATALOG = [
  { id: 'mock', name: 'Mock LLM', vendor: '本地', strengths: ['测试', '离线'], default: true, models: [{ id: 'mock', name: 'Mock', default: true }] },
  { id: 'openai', name: 'OpenAI GPT', vendor: 'OpenAI (美)', strengths: ['通用能力强', '英文优秀'], default: false, models: [
    { id: 'gpt-4o', name: 'GPT-4o', default: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', default: false },
  ] },
  { id: 'opencode', name: 'OpenCode (本地服务)', vendor: 'OpenCode', strengths: ['多供应商统一', '本地服务'], default: false, models: [
    { id: 'opencode/glm-5.3-flash-free', name: 'GLM-5.3 Flash（免费）', default: true },
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
 * 按显式偏好（如某小说的 providerPreferences.llm）解析 LLM Provider。
 * 偏好未配置/不可用 → 回退到用户级 → 全局 → Mock。
 * @param {{provider?:string, model?:string, config?:object}|null} pref
 * @param {string|null} userId
 */
export function getLLMProviderByPref(pref, userId = null) {
  if (pref && pref.provider && PROVIDER_MAP[pref.provider] && isProviderConfigured('llm', pref.provider)) {
    const merged = buildMergedConfig('llm', pref.provider, pref.config || {}, pref.model || null)
    return new PROVIDER_MAP[pref.provider](merged)
  }
  if (pref && pref.provider) {
    logger.warn(`预设 LLM provider=${pref.provider} 不可用（缺少凭据/未知），回退默认解析`)
  }
  return getLLMProviderForProject(null, userId)
}

/** 解析结果（供接口展示）：来源 = novel | user-default | global-default | fallback */
export function resolveLLMPreference(pref, userId = null) {
  if (pref && pref.provider && isProviderConfigured('llm', pref.provider)) {
    return { provider: pref.provider, model: pref.model || null, source: 'novel' }
  }
  return resolveProviderConfig('llm', null, userId)
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

/**
 * LLM 模型目录（opencode 时尝试从本机 OpenCode 2.x 服务拉取实时模型清单）。
 * 失败则回退静态目录，保证接口始终可用。
 */
export async function getLLMModelCatalogLive() {
  const catalog = getLLMModelCatalog()
  const oc = catalog.find((c) => c.id === 'opencode')
  const baseUrl = config.llm.opencodeBaseUrl
  if (!oc || !baseUrl) return catalog
  try {
    const headers = {}
    if (config.llm.opencodePassword) {
      headers.Authorization = 'Basic ' + Buffer.from(`opencode:${config.llm.opencodePassword}`).toString('base64')
    }
    const res = await fetch(`${baseUrl}/api/model`, { headers, signal: AbortSignal.timeout(5000) })
    if (!res.ok) return catalog
    const data = await res.json()
    const models = (data.data || [])
      .map((m) => ({ id: `${m.providerID}/${m.modelID}`, name: m.name || m.modelID }))
      .filter((m) => m.id.includes('/'))
    if (models.length) {
      oc.models = models.map((m) => ({ ...m, default: m.id === 'opencode/glm-5.3-flash-free' }))
    }
  } catch {
    // 服务未启动/超时 → 保留静态目录
  }
  return catalog
}

export default getLLMProvider
