import { fail } from '../http/respond.js'

/**
 * 用 zod 校验请求，校验失败返回 422 VALIDATION_ERROR。
 * 成功后的解析结果写入 req.validated.{body,query,params}，不覆盖原始 req.body。
 */
function run(schema, value) {
  const result = schema.safeParse(value)
  if (result.success) return { ok: true, data: result.data }
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }))
  return { ok: false, details }
}

export function validateBody(schema) {
  return (req, res, next) => {
    const result = run(schema, req.body)
    if (!result.ok) return fail(res, 422, 'VALIDATION_ERROR', '请求体校验失败', result.details)
    req.validated = { ...(req.validated || {}), body: result.data }
    return next()
  }
}

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = run(schema, req.query)
    if (!result.ok) return fail(res, 422, 'VALIDATION_ERROR', '查询参数校验失败', result.details)
    req.validated = { ...(req.validated || {}), query: result.data }
    return next()
  }
}

export function validateParams(schema) {
  return (req, res, next) => {
    const result = run(schema, req.params)
    if (!result.ok) return fail(res, 422, 'VALIDATION_ERROR', '路径参数校验失败', result.details)
    req.validated = { ...(req.validated || {}), params: result.data }
    return next()
  }
}
