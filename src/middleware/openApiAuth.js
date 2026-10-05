import { apiKeyService } from '../services/apiKeyService.js'

/**
 * R13：开放 API 鉴权中间件
 * 从 Authorization: Bearer drk_xxx 或 x-api-key 读取
 */
export function openApiAuth(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const key = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : req.headers['x-api-key']

  if (!key) {
    return res.status(401).json({ error: { code: 'missing_api_key', message: '缺少 API Key' } })
  }

  const record = apiKeyService.validate(key)
  if (!record) {
    return res.status(401).json({ error: { code: 'invalid_api_key', message: 'API Key 无效或已吊销' } })
  }
  req.apiKey = record
  next()
}

/**
 * Scope 校验
 */
export function requireScope(scope) {
  return (req, res, next) => {
    if (!apiKeyService.hasScope(req.apiKey, scope)) {
      return res.status(403).json({ error: { code: 'insufficient_scope', message: `缺少权限范围: ${scope}` } })
    }
    next()
  }
}
