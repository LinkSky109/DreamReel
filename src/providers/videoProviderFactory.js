import { BaseVideoProvider } from './baseVideoProvider.js'
import { MockVideoProvider } from './mockVideoProvider.js'
import { RunwayVideoProvider } from './runwayVideoProvider.js'
import { PikaVideoProvider } from './pikaVideoProvider.js'
import { SeedanceVideoProvider } from './seedanceVideoProvider.js'
import { MinimaxVideoProvider } from './minimaxVideoProvider.js'
import { WanVideoProvider } from './wanVideoProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'
import { resolveProviderConfig, buildMergedConfig, isProviderConfigured } from './providerResolver.js'

/**
 * 视频生成 Provider 工厂
 * 根据配置选择具体实现，支持降级切换
 * R20: 新增 Seedance / Minimax / Wan 国产模型矩阵（对标 LibTV）
 */
const PROVIDER_MAP = {
  mock: MockVideoProvider,
  runway: RunwayVideoProvider,
  pika: PikaVideoProvider,
  seedance: SeedanceVideoProvider,
  minimax: MinimaxVideoProvider,
  wan: WanVideoProvider,
}

// 模型元数据：供前端展示可选模型与能力标签
export const VIDEO_MODEL_CATALOG = [
  { id: 'mock', name: 'Mock 占位', vendor: '本地', strengths: ['测试', '离线'], referenceImage: true, default: true, models: [{ id: 'mock', name: 'Mock', default: true }] },
  { id: 'runway', name: 'Runway Gen-3', vendor: 'Runway (美)', strengths: ['电影感', '运镜'], referenceImage: true, models: [{ id: 'gen-3-alpha', name: 'Gen-3 Alpha', default: true }] },
  { id: 'pika', name: 'Pika 1.0', vendor: 'Pika (美)', strengths: ['风格化', '动画'], referenceImage: false, models: [{ id: 'pika-1.0', name: 'Pika 1.0', default: true }] },
  { id: 'seedance', name: 'Seedance 2.5', vendor: '字节跳动', strengths: ['国产', '中文理解强', '运镜自然'], referenceImage: true, benchmark: 'LibTV', models: [
    { id: 'seedance-2.5', name: 'Seedance 2.5', default: true },
    { id: 'seedance-2-0-fast', name: 'Seedance 2.0 Fast', default: false },
  ] },
  { id: 'minimax', name: 'Minimax Hailuo', vendor: 'Minimax', strengths: ['国产', '表情细腻', '长镜头'], referenceImage: true, benchmark: 'LibTV', models: [{ id: 'video-01', name: 'Video-01', default: true }] },
  { id: 'wan', name: '通义万相 3.0', vendor: '阿里', strengths: ['国产', '国风', '电商素材'], referenceImage: true, benchmark: 'LibTV', models: [{ id: 'wanx2.1-t2v-plus', name: 'Wanx2.1 T2V Plus', default: true }] },
]

let activeProvider = null

/**
 * 获取视频 Provider 实例（全局单例，向后兼容）
 */
export function getVideoProvider() {
  if (activeProvider) return activeProvider

  const providerName = config.video.provider
  const ProviderClass = PROVIDER_MAP[providerName]

  if (!ProviderClass) {
    logger.warn(`Unknown video provider: ${providerName}, falling back to mock`)
    activeProvider = new MockVideoProvider(config.video)
  } else {
    activeProvider = new ProviderClass(config.video)
  }

  logger.info(`Video provider initialized: ${activeProvider.name}`)
  return activeProvider
}

/**
 * 获取项目感知的视频 Provider 实例（Phase 1）
 * @param {string|null} projectId
 * @param {string|null} userId
 * @returns {BaseVideoProvider}
 */
export function getVideoProviderForProject(projectId = null, userId = null) {
  if (!projectId && !userId) {
    return getVideoProvider()
  }

  const resolved = resolveProviderConfig('video', projectId, userId)
  const ProviderClass = PROVIDER_MAP[resolved.provider]

  if (!ProviderClass) {
    logger.warn(`Unknown video provider: ${resolved.provider}, falling back to mock`)
    return new MockVideoProvider(config.video)
  }

  const mergedConfig = buildMergedConfig('video', resolved.provider, resolved.config, resolved.model)
  const instance = new ProviderClass(mergedConfig)
  logger.info(`Video provider for project=${projectId}: ${instance.name} (source=${resolved.source})`)
  return instance
}

/**
 * 重置 provider（用于测试）
 */
export function resetVideoProvider() {
  activeProvider = null
}

/**
 * 获取所有可用 provider 名称
 */
export function getAvailableProviders() {
  return Object.keys(PROVIDER_MAP)
}

/**
 * 获取模型目录（R20）
 */
export function getVideoModelCatalog() {
  return VIDEO_MODEL_CATALOG.map((p) => ({
    ...p,
    configured: isProviderConfigured('video', p.id),
  }))
}

export default getVideoProvider
