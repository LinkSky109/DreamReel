import { Router } from 'express'
import config from '../config/index.js'
import {
  getAvailableProviders as getAvailableVideoProviders,
  getVideoModelCatalog,
} from '../providers/videoProviderFactory.js'
import { getAvailableProviders as getAvailableLLMProviders } from '../providers/llmProviderFactory.js'
import { getAvailableProviders as getAvailableTTSProviders } from '../providers/ttsProviderFactory.js'

const router = Router()

/**
 * 获取当前 Provider 配置状态
 */
router.get('/status', (req, res) => {
  try {
    const status = {
      video: {
        current: config.video.provider,
        available: getAvailableVideoProviders(),
        configured: {
          runway: !!config.video.runwayApiKey,
          pika: !!config.video.pikaApiKey,
          seedance: !!config.video.seedanceApiKey,
          minimax: !!config.video.minimaxApiKey && !!config.video.minimaxGroupId,
          wan: !!config.video.wanApiKey,
        },
      },
      llm: {
        current: config.llm.provider,
        available: getAvailableLLMProviders(),
        configured: {
          openai: !!config.llm.apiKey,
        },
        model: config.llm.model,
      },
      tts: {
        current: config.tts.provider,
        available: getAvailableTTSProviders(),
        configured: {
          elevenlabs: !!config.tts.elevenLabsApiKey,
        },
      },
    }
    res.json(status)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 获取所有可用 Provider 列表
 */
router.get('/available', (req, res) => {
  try {
    res.json({
      video: getAvailableVideoProviders(),
      llm: getAvailableLLMProviders(),
      tts: getAvailableTTSProviders(),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * R20: 视频模型目录（前端展示可选模型与能力标签）
 */
router.get('/video-models', (req, res) => {
  try {
    res.json({
      current: config.video.provider,
      models: getVideoModelCatalog(),
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

export default router
