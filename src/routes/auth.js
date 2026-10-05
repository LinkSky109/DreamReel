import { Router } from 'express'
import { authService } from '../services/authService.js'
import { authRequired } from '../middleware/auth.js'
import { resolveProviderConfig } from '../providers/providerResolver.js'

const router = Router()

/**
 * 用户注册
 * POST /api/auth/register
 * Body: { username, email, password }
 */
router.post('/register', (req, res) => {
  try {
    const { username, email, password } = req.body
    const result = authService.register({ username, email, password })
    res.status(201).json(result)
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

/**
 * 用户登录
 * POST /api/auth/login
 * Body: { email, password }
 */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body
    const result = authService.login({ email, password })
    res.json(result)
  } catch (error) {
    res.status(401).json({ error: error.message })
  }
})

/**
 * 获取当前用户信息
 * GET /api/auth/me
 */
router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user.toJSON() })
})

// ========== Phase 1: 用户默认 Provider 偏好 ==========

/**
 * 获取当前用户的模型偏好
 * GET /api/auth/me/model-preferences
 */
router.get('/me/model-preferences', authRequired, (req, res) => {
  try {
    const user = req.user
    const userId = user.id

    const resolved = {
      video: resolveProviderConfig('video', null, userId),
      llm: resolveProviderConfig('llm', null, userId),
      tts: resolveProviderConfig('tts', null, userId),
    }

    res.json({
      preferences: user.defaultProviderPreferences,
      resolved: {
        video: {
          provider: resolved.video.provider,
          model: resolved.video.model,
          source: resolved.video.source,
        },
        llm: {
          provider: resolved.llm.provider,
          model: resolved.llm.model,
          source: resolved.llm.source,
        },
        tts: {
          provider: resolved.tts.provider,
          model: resolved.tts.model,
          source: resolved.tts.source,
        },
      },
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * 更新当前用户的模型偏好
 * PUT /api/auth/me/model-preferences
 * Body: { video?: { provider, model, config }, llm?: { provider, model, config }, tts?: { provider, model, config } }
 */
router.put('/me/model-preferences', authRequired, (req, res) => {
  try {
    const { video, llm, tts } = req.body
    const user = req.user

    const updated = authService.updateUserModelPreferences(user.id, { video, llm, tts })

    const resolved = {
      video: resolveProviderConfig('video', null, user.id),
      llm: resolveProviderConfig('llm', null, user.id),
      tts: resolveProviderConfig('tts', null, user.id),
    }

    res.json({
      preferences: updated.defaultProviderPreferences,
      resolved: {
        video: {
          provider: resolved.video.provider,
          model: resolved.video.model,
          source: resolved.video.source,
        },
        llm: {
          provider: resolved.llm.provider,
          model: resolved.llm.model,
          source: resolved.llm.source,
        },
        tts: {
          provider: resolved.tts.provider,
          model: resolved.tts.model,
          source: resolved.tts.source,
        },
      },
    })
  } catch (error) {
    res.status(400).json({ error: error.message })
  }
})

export default router
