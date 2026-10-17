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
      case 'deepseek':
        return !!config.llm.deepseekApiKey
      case 'opencode':
        // 本地 OpenCode 2.x 服务（服务发现或 baseUrl）；无需外部 key
        return true
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
    } catch {
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
    } catch {
      // ignore
    }
  }

  // 3. 全局默认
  const globalProvider = config[stage]?.provider
  if (globalProvider && isProviderConfigured(stage, globalProvider)) {
    // 各供应商默认模型名不同，避免把 LLM_MODEL（如 gpt-4o-mini）误当其它供应商的模型
    const globalModel =
      stage !== 'llm'
        ? config[stage]?.model || null
        : globalProvider === 'opencode'
          ? config.llm?.opencodeModel || null
          : globalProvider === 'deepseek'
            ? config.llm?.deepseekModel || null
            : config[stage]?.model || null
    return {
      provider: globalProvider,
      model: globalModel,
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
  // 各供应商的凭据/端点分开放，避免互相覆盖（如 OpenAI 的 baseUrl 被 DeepSeek 用到）
  if (stage === 'llm') {
    if (providerName === 'deepseek') {
      merged.apiKey = config.llm.deepseekApiKey
      merged.baseUrl = config.llm.deepseekBaseUrl
      if (!model) merged.model = config.llm.deepseekModel
    } else if (providerName === 'opencode') {
      if (!model) merged.model = config.llm.opencodeModel
    }
  }
  if (model) {
    merged.model = model
  }
  return merged
}
