import { ERROR_CODES } from '../http/respond.js'

/**
 * 可预期的业务错误。
 * - status：HTTP 状态码；code：稳定错误码
 * - expose：是否把 message 返回给客户端（5xx 默认不暴露）
 */
export class AppError extends Error {
  constructor(status, code, message, { details, expose, cause } = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code || Object.keys(ERROR_CODES).find((key) => ERROR_CODES[key] === status) || 'INTERNAL_ERROR'
    this.details = details
    this.expose = expose ?? status < 500
    if (cause) this.cause = cause
  }

  static badRequest(message, options) {
    return new AppError(400, 'BAD_REQUEST', message, options)
  }

  static unauthorized(message = '未登录，请先登录', options) {
    return new AppError(401, 'UNAUTHORIZED', message, options)
  }

  static forbidden(message = '无权操作', options) {
    return new AppError(403, 'FORBIDDEN', message, options)
  }

  static notFound(message = '资源不存在', options) {
    return new AppError(404, 'NOT_FOUND', message, options)
  }

  static conflict(message, options) {
    return new AppError(409, 'CONFLICT', message, options)
  }

  static validation(message, details, options) {
    return new AppError(422, 'VALIDATION_ERROR', message, { ...options, details })
  }

  static internal(message = 'Internal server error', options) {
    return new AppError(500, 'INTERNAL_ERROR', message, { ...options, expose: false })
  }
}

export default AppError
