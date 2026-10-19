import {} from './baseLLMProvider.js'
import { MockLLMProvider } from './mockLLMProvider.js'
import { OpenAILLMProvider } from './openaiLLMProvider.js'
import { OpencodeLLMProvider } from './opencodeLLMProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'
import { instrumentProvider } from '../services/withMetrics.js'
import { composeWithFallback } from '../services/executionRouter.js'

const PROVIDER_MAP = {
  mock: MockLLMProvider,
  openai: OpenAILLMProvider,
  deepseek: OpenAILLMProvider,
  litellm: OpenAILLMProvider,
  opencode: OpencodeLLMProvider,
}

// LLM 模型元数据目录
export const LLM_MODEL_CATALOG = [
  { id: 'mock', name: 'Mock LLM', vendor: '本地', strengths: ['测试', '离线'], default: true, models: [{ id: 'mock', name: 'Mock', default: true }] },
  { id: 'deepseek', name: 'DeepSeek 官方 API', vendor: 'DeepSeek (深度求索)', strengths: ['中文强', '结构化输出好', '官方直连'], default: false, models: [
    { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash', default: true },
    { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro', default: false },
  ] },
  { id: 'openai', name: 'OpenAI GPT', vendor: 'OpenAI (美)', strengths: ['通用能力强', '英文优秀'], default: false, models: [
    { id: 'gpt-4o', name: 'GPT-4o', default: true },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', default: false },
  ] },
  { id: 'opencode', name: 'OpenCode (本地服务)', vendor: 'OpenCode', strengths: ['多供应商统一', '本地服务'], default: false, models: [
    { id: 'opencode/deepseek-v4.1-flash-free', name: 'DeepSeek V4.1 Flash（免费·快）', default: true },
  ] },
  { id: 'litellm', name: 'LiteLLM 网关', vendor: 'LiteLLM', strengths: ['统一网关', '多供应商/多套餐', '集中成本'], default: false, models: [
    { id: 'deepseek-flash', name: 'DeepSeek V4.1 Flash（经网关）', default: true },
  ] },
]

let activeProvider = null

function rawLLM(providerName, { projectId = null, userId = null, model = null, prefConfig = {} } = {}) {
  const ProviderClass = PROVIDER_MAP[providerName]
  if (!ProviderClass) return null
  return new ProviderClass(buildMergedConfig('llm', providerName, prefConfig, model))
}

/**
 * 构建 LLM 执行链：主 provider + 配置的回退（config.llm.fallbackProviders）。
 * 无回退时退化为单实例（与旧行为一致）。每个实例独立埋点（attempt/isFallback）。
 */
function buildLLMChain(primaryName, opts = {}) {
  const baseMeta = {
    stage: 'text',
    projectId: opts.projectId ?? null,
    userId: opts.userId ?? null,
    deadlineMs: config.llm.attemptTimeoutMs || 0,
  }
  const primary = rawLLM(primaryName, opts) || new MockLLMProvider(config.llm)
  const raws = [primary]

  const fallbacks = (config.llm.fallbackProviders || []).filter(
    (n) => n && n !== primaryName && PROVIDER_MAP[n] && isProviderConfigured('llm', n)
  )
  for (const n of fallbacks) {
    const p = rawLLM(n, { projectId: opts.projectId, userId: opts.userId })
    if (p) raws.push(p)
  }
  if (raws.length > 1) {
    logger.info(`LLM 回退链: ${raws.map((x) => x.name).join(' → ')}`)
  }
  return composeWithFallback(raws, baseMeta)
}

export function getLLMProvider() {
  if (activeProvider) return activeProvider
  const providerName = config.llm.provider
  if (!PROVIDER_MAP[providerName]) logger.warn(`Unknown LLM provider: ${providerName}, falling back to mock`)
  activeProvider = buildLLMChain(providerName)
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
  const chain = buildLLMChain(resolved.provider, {
    projectId,
    userId,
    model: resolved.model,
    prefConfig: resolved.config,
  })
  logger.info(`LLM provider for project=${projectId}: ${chain.name} (source=${resolved.source})`)
  return chain
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
    return instrumentProvider(new PROVIDER_MAP[pref.provider](merged), { stage: 'text', userId })
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
      oc.models = models.map((m) => ({ ...m, default: m.id === 'opencode/deepseek-v4.1-flash-free' }))
    }
  } catch {
    // 服务未启动/超时 → 保留静态目录
  }
  return catalog
}

export default getLLMProvider
