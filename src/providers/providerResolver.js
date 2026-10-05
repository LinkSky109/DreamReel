import config from '../config/index.js'
import { authService } from '../services/authService.js'
import { projectService } from '../services/projectService.js'
import logger from '../utils/logger.js'

/**
 * Provider 解析器
 * 四级回退：项目级 → 用户级 → 全局默认 → Mock
 * 每一级回退前校验目标 Provider 是否已配置 API Key
 */

/**
 * 校验 Provider 是否已配置 API Key
 * @param {string} stage - 'video' | 'llm' | 'tts' | 'image'
 * @param {string} providerName
 * @returns {boolean}
 */
export function isProviderConfigured(stage, providerName) {
  if (providerName === 'mock') return true

  if (stage === 'video') {
    switch (providerName) {
      case 'runway':
        return !!config.video.runwayApiKey
      case 'pika':
        return !!config.video.pikaApiKey
      case 'seedance':
        return !!config.video.seedanceApiKey
      case 'minimax':
        return !!config.video.minimaxApiKey && !!config.video.minimaxGroupId
      case 'wan':
        return !!config.video.wanApiKey
      default:
        return false
    }
  }

  if (stage === 'llm') {
    switch (providerName) {
      case 'openai':
        return !!config.llm.apiKey
      default:
        return false
    }
  }

  if (stage === 'tts') {
    switch (providerName) {
      case 'elevenlabs':
        return !!config.tts.elevenLabsApiKey
      default:
        return false
    }
  }

  if (stage === 'image') {
    switch (providerName) {
      case 'openai':
        return !!config.image.apiKey
      default:
        return false
    }
  }

  return false
}

/**
 * 解析 Provider 配置
 * @param {string} stage - 'video' | 'llm' | 'tts' | 'image'
 * @param {string|null} projectId
 * @param {string|null} userId
 * @returns {{provider: string, model: string|null, config: object, source: string}}
 */
export function resolveProviderConfig(stage, projectId = null, userId = null) {
  // 1. 项目级配置
  if (projectId) {
    try {
      const project = projectService.projects.get(projectId)
      if (project?.providerPreferences?.[stage]?.provider) {
        const pref = project.providerPreferences[stage]
        if (isProviderConfigured(stage, pref.provider)) {
          return {
            provider: pref.provider,
            model: pref.model || null,
            config: pref.config || {},
            source: 'project',
          }
        }
        logger.warn(`Project ${projectId} configured provider ${pref.provider} for ${stage} is not available (missing API key), falling back`)
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. 用户级默认
  if (userId) {
    try {
      const user = authService.getUserById(userId)
      if (user?.defaultProviderPreferences?.[stage]?.provider) {
        const pref = user.defaultProviderPreferences[stage]
        if (isProviderConfigured(stage, pref.provider)) {
          return {
            provider: pref.provider,
            model: pref.model || null,
            config: pref.config || {},
            source: 'user-default',
          }
        }
        logger.warn(`User ${userId} default provider ${pref.provider} for ${stage} is not available (missing API key), falling back`)
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. 全局默认
  const globalProvider = config[stage]?.provider
  if (globalProvider && isProviderConfigured(stage, globalProvider)) {
    return {
      provider: globalProvider,
      model: config[stage]?.model || null,
      config: {},
      source: 'global-default',
    }
  }

  // 4. 安全回退到 Mock
  logger.info(`No configured provider found for stage=${stage}, falling back to mock`)
  return {
    provider: 'mock',
    model: null,
    config: {},
    source: 'fallback',
  }
}

/**
 * 构建合并后的 Provider 配置
 * @param {string} stage
 * @param {string} providerName
 * @param {object} prefConfig - 偏好中的 config
 * @param {string|null} model
 * @returns {object}
 */
export function buildMergedConfig(stage, providerName, prefConfig = {}, model = null) {
  const baseConfig = { ...config[stage] }
  const merged = {
    ...baseConfig,
    ...prefConfig,
    provider: providerName,
  }
  if (model) {
    merged.model = model
  }
  return merged
}
