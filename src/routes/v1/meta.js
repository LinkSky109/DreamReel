import { Router } from 'express'
import { ok, ERROR_CODES } from '../../http/respond.js'

const router = Router()

/**
 * v1 契约元信息。用于客户端探测版本、错误码与限流/幂等约定。
 */
router.get('/', (_req, res) => {
  ok(res, {
    version: 'v1',
    base: '/api/v1',
    legacyBase: '/api',
    status: 'compatible',
    note: 'v1 复用现有路由实现，响应体在迁移期保持旧结构；新接口使用统一 success/data/error 包装。',
    requestIdHeader: 'x-request-id',
    apiVersionHeader: 'x-api-version',
    idempotencyHeader: 'Idempotency-Key',
    errorCodes: Object.keys(ERROR_CODES),
  })
})

export default router
