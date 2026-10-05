import { BaseImageProvider } from './baseImageProvider.js'
import { MockImageProvider } from './mockImageProvider.js'
import { OpenAIImageProvider } from './openaiImageProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'

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

export function getImageProvider() {
  if (activeProvider) return activeProvider
  const ProviderClass = PROVIDER_MAP[config.image.provider]
  if (!ProviderClass) {
    logger.warn(`Unknown image provider: ${config.image.provider}, falling back to mock`)
    activeProvider = new MockImageProvider(config.image)
  } else {
    activeProvider = new ProviderClass(config.image)
  }
  logger.info(`Image provider initialized: ${activeProvider.name}`)
  return activeProvider
}

export function getImageProviderForProject(projectId = null, userId = null) {
  if (!projectId && !userId) return getImageProvider()

  const resolved = resolveProviderConfig('image', projectId, userId)
  if (resolved.source === 'global-default' || resolved.source === 'fallback') {
    return getImageProvider()
  }

  const ProviderClass = PROVIDER_MAP[resolved.provider]
  if (!ProviderClass) {
    logger.warn(`Unknown image provider: ${resolved.provider}, falling back to mock`)
    return new MockImageProvider(config.image)
  }

  // 图片 provider 的 baseUrl/apiKey 只取全局配置，忽略项目/用户级覆盖，避免 SSRF 与密钥替换。
  const mergedConfig = buildMergedConfig('image', resolved.provider, {}, resolved.model)
  return new ProviderClass(mergedConfig)
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
