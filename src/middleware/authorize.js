import config from '../config/index.js'
import { can } from '../security/policy.js'

/**
 * 权限校验中间件。
 * REQUIRE_AUTH=false 时直接放行（开发/迁移期）；开启后按权限矩阵拒绝。
 */
export function requirePermission(permission) {
  return (req, res, next) => {
    if (!config.auth.enforce) return next()
    if (!req.auth) return res.status(401).json({ error: '未登录，请先登录' })
    if (!can(req.auth, permission)) {
      return res.status(403).json({ error: '权限不足', permission })
    }
    return next()
  }
}

export default { requirePermission }
