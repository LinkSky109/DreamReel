import { BaseVideoProvider } from './baseVideoProvider.js'
import { MockVideoProvider } from './mockVideoProvider.js'
import { RunwayVideoProvider } from './runwayVideoProvider.js'
import { PikaVideoProvider } from './pikaVideoProvider.js'
import { SeedanceVideoProvider } from './seedanceVideoProvider.js'
import { MinimaxVideoProvider } from './minimaxVideoProvider.js'
import { WanVideoProvider } from './wanVideoProvider.js'
import config from '../config/index.js'
import logger from '../utils/logger.js'

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
  { id: 'mock', name: 'Mock 占位', vendor: '本地', strengths: ['测试', '离线'], referenceImage: true, default: true },
  { id: 'runway', name: 'Runway Gen-3', vendor: 'Runway (美)', strengths: ['电影感', '运镜'], referenceImage: true },
  { id: 'pika', name: 'Pika 1.0', vendor: 'Pika (美)', strengths: ['风格化', '动画'], referenceImage: false },
  { id: 'seedance', name: 'Seedance 2.5', vendor: '字节跳动', strengths: ['国产', '中文理解强', '运镜自然'], referenceImage: true, benchmark: 'LibTV' },
  { id: 'minimax', name: 'Minimax Hailuo', vendor: 'Minimax', strengths: ['国产', '表情细腻', '长镜头'], referenceImage: true, benchmark: 'LibTV' },
  { id: 'wan', name: '通义万相 3.0', vendor: '阿里', strengths: ['国产', '国风', '电商素材'], referenceImage: true, benchmark: 'LibTV' },
]

let activeProvider = null

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
  return VIDEO_MODEL_CATALOG
}

export default getVideoProvider
