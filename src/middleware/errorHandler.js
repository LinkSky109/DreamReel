import logger from '../utils/logger.js'
import { AppError } from '../utils/appError.js'

/**
 * 集中错误映射：
 * - AppError 按 status/code 输出，5xx 默认不泄漏 message
 * - 未知错误统一 500，日志带 requestId 与 stack
 */
export function errorHandler(error, req, res, _next) {
  if (/^CORS origin not allowed/.test(error.message || '')) {
    return res.status(403).json({ error: 'Forbidden', message: error.message, requestId: req.id })
  }

  const isKnown = error instanceof AppError
  const status = isKnown ? error.status : 500
  const code = isKnown ? error.code : 'INTERNAL_ERROR'
  const expose = isKnown ? error.expose : false

  const line = `[${req.id}] ${req.method} ${req.originalUrl} -> ${status}`
  if (status >= 500) {
    logger.error(`${line}: ${error.message}`, error.stack)
  } else {
    logger.warn(`${line}: ${error.message}`)
  }

  const body = {
    error: expose ? error.message : 'Internal server error',
    code,
    requestId: req.id,
  }
  if (isKnown && error.details !== undefined) body.details = error.details
  return res.status(status).json(body)
}

export default errorHandler
