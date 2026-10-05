import { authService } from '../services/authService.js'

/**
 * 认证中间件
 * 从 Authorization header 提取 Bearer token，验证后挂载 req.user
 */
export function authRequired(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录，请先登录' })
  }

  const token = authHeader.slice(7)
  const user = authService.verifyToken(token)
  if (!user) {
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }

  req.user = user
  next()
}

/**
 * 可选认证中间件
 * 如果有 token 则挂载 req.user，没有也继续
 */
export function authOptional(req, _res, next) {
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const user = authService.verifyToken(token)
    if (user) {
      req.user = user
    }
  }
  next()
}
