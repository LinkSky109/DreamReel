import config from '../config/index.js'
import { authRequired } from './auth.js'

/**
 * 全局鉴权闸门。默认关闭（REQUIRE_AUTH=false），避免打断现有匿名页面。
 * 开启后：除公开白名单外，所有 /api 请求必须携带有效 Bearer token。
 */

const PUBLIC_RULES = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/auth/register' },
  { method: 'POST', path: '/api/auth/refresh' },
  { method: 'POST', path: '/api/auth/forgot-password' },
  { method: 'POST', path: '/api/auth/reset-password' },
  { method: 'ANY', prefix: '/api/open/v1' },
  { method: 'GET', prefix: '/api/gallery' },
  { method: 'GET', prefix: '/api/creators' },
  { method: 'GET', prefix: '/api/community' },
  { method: 'GET', prefix: '/api/store' },
  { method: 'GET', prefix: '/api/templates' },
  { method: 'GET', prefix: '/api/styles' },
  { method: 'GET', prefix: '/api/challenges' },
]

export function isPublicApiRequest(req) {
  const full = `${req.baseUrl}${req.path}`
  return PUBLIC_RULES.some((rule) => {
    if (rule.method !== 'ANY' && rule.method !== req.method) return false
    return rule.path ? full === rule.path : full.startsWith(rule.prefix)
  })
}

export function authGate(req, res, next) {
  if (!config.auth.enforce) return next()
  if (isPublicApiRequest(req)) return next()
  if (req.auth) return next()
  return authRequired(req, res, next)
}
