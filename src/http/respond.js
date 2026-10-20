/**
 * 统一响应与错误码（/api/v1 及新中间件使用）。
 *
 * 契约：
 *   成功：{ success: true, data, meta?: { requestId, apiVersion, ... } }
 *   失败：{ success: false, error: { code, message, details? }, meta? }
 *
 * 说明：/api 旧接口在迁移期保持原有返回结构；v1 通过别名复用旧路由，
 * 新代码应使用本模块，逐步把旧接口迁移到统一结构。
 */
export const ERROR_CODES = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
}

function metaFor(res, extra) {
  return {
    requestId: res.req?.id,
    apiVersion: res.getHeader('x-api-version') || undefined,
    ...extra,
  }
}

export function ok(res, data, meta) {
  return res.json({ success: true, data, meta: metaFor(res, meta) })
}

export function created(res, data, meta) {
  return res.status(201).json({ success: true, data, meta: metaFor(res, meta) })
}

export function fail(res, status, code, message, details) {
  const error = { code, message }
  if (details !== undefined) error.details = details
  return res.status(status).json({ success: false, error, meta: metaFor(res) })
}

export function errorStatus(code) {
  return ERROR_CODES[code] || 500
}

/**
 * 游标分页响应。items 必须已按游标顺序排列。
 */
export function paginated(res, items, { nextCursor = null, limit = items.length } = {}) {
  return ok(res, items, { nextCursor, limit, count: items.length })
}
