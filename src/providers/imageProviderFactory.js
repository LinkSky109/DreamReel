import { BaseImageProvider } from './baseImageProvider.js'
import { MockImageProvider } from './mockImageProvider.js'
import { OpenAIImageProvider } from './openaiImageProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'
import { composeWithFallback } from '../services/executionRouter.js'

const PROVIDER_MAP = {
  mock: MockImageProvider,
  openai: OpenAIImageProvider,
}

export const IMAGE_MODEL_CATALOG = [
  {
    id: 'mock',
    name: 'Mock 本地渲染',
    vendor: '本地',
    strengths: ['离线', '真实 PNG', '测试'],
    realGeneration: false,
    default: true,
    models: [{ id: 'mock', name: 'Mock Renderer', default: true }],
  },
  {
    id: 'openai',
    name: 'OpenAI Images 兼容',
    vendor: 'OpenAI / 兼容服务',
    strengths: ['文生图', '指令遵循', '可配置 Base URL'],
    realGeneration: true,
    default: false,
    models: [{ id: 'gpt-image-1', name: 'gpt-image-1', default: true }],
  },
]

let activeProvider = null

function rawImage(name, { model = null } = {}) {
  const ProviderClass = PROVIDER_MAP[name]
  if (!ProviderClass) return null
  // 图片 provider 的 baseUrl/apiKey 只取全局配置（prefConfig 传空），避免 SSRF 与密钥替换
  return new ProviderClass(buildMergedConfig('image', name, {}, model))
}

function buildImageChain(primaryName, { projectId = null, userId = null, model = null } = {}) {
  const baseMeta = { stage: 'image', projectId, userId, deadlineMs: config.image.attemptTimeoutMs || 0 }
  const primary = rawImage(primaryName, { model }) || new MockImageProvider(config.image)
  const raws = [primary]
  const fallbacks = (config.image.fallbackProviders || []).filter(
    (n) => n && n !== primaryName && PROVIDER_MAP[n] && isProviderConfigured('image', n)
  )
  for (const n of fallbacks) {
    const p = rawImage(n)
    if (p) raws.push(p)
  }
  if (raws.length > 1) logger.info(`Image 回退链: ${raws.map((x) => x.name).join(' → ')}`)
  return composeWithFallback(raws, baseMeta, ['generateImage'])
}

export function getImageProvider() {
  if (activeProvider) return activeProvider
  if (!PROVIDER_MAP[config.image.provider]) {
    logger.warn(`Unknown image provider: ${config.image.provider}, falling back to mock`)
  }
  activeProvider = buildImageChain(config.image.provider)
  logger.info(`Image provider initialized: ${activeProvider.name}`)
  return activeProvider
}

export function getImageProviderForProject(projectId = null, userId = null) {
  if (!projectId && !userId) return getImageProvider()

  const resolved = resolveProviderConfig('image', projectId, userId)
  if (resolved.source === 'global-default' || resolved.source === 'fallback') {
    return getImageProvider()
  }

  return buildImageChain(resolved.provider, { projectId, userId, model: resolved.model })
}

export function resetImageProvider() {
  activeProvider = null
}

export function getAvailableProviders() {
  return Object.keys(PROVIDER_MAP)
}

export function getImageModelCatalog() {
  return IMAGE_MODEL_CATALOG.map((p) => ({
    ...p,
    configured: isProviderConfigured('image', p.id),
  }))
}

export { BaseImageProvider }
export default getImageProvider
