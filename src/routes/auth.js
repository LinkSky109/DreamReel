import { Router } from 'express'
import { authService } from '../services/authService.js'
import { authRequired } from '../middleware/auth.js'

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

export default router
