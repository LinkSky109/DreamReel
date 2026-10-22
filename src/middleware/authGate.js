import config from '../config/index.js'
import { authRequired } from './auth.js'

/**
 * 全局鉴权闸门。生产默认开启（见 config/authEnforce.js），开发/测试默认关闭。
 * 开启后：除公开白名单外，所有 /api（含 /api/v1）请求必须携带有效 Bearer token。
 * 管理面（enterprise/system/webhooks/teams/cloud-drive/api-keys）不在白名单内。
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

/**
 * 把 /api/v1 前缀归一化为 /api，使同一份公开白名单同时覆盖 legacy 与 v1 入口。
 * 例：/api/v1/auth/login → /api/auth/login；/api/v1/projects → /api/projects。
 * @param {string} full
 * @returns {string}
 */
export function normalizeApiPath(full) {
  if (typeof full !== 'string' || !full) return ''
  let normalized = full
  if (normalized === '/api/v1') {
    normalized = '/api'
  } else if (normalized.startsWith('/api/v1/')) {
    normalized = `/api${normalized.slice('/api/v1'.length)}`
  }
  // 容忍尾斜杠差异（/api/auth/login/ 与 /api/auth/login 等价）
  if (normalized.length > 1 && normalized.endsWith('/')) normalized = normalized.slice(0, -1)
  return normalized
}

export function isPublicApiRequest(req) {
  const full = normalizeApiPath(`${req.baseUrl || ''}${req.path || ''}`)
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
