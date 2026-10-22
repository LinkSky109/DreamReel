import config from '../config/index.js'

/**
 * 匿名身份占位值。仅当 config.auth.allowAnonymous 显式开启时使用，
 * 生产环境默认关闭（见 config/authEnforce.js）。
 */
export const ANONYMOUS_USER_ID = 'default'

/**
 * 从已解析的认证上下文取用户 ID（token 为唯一来源）。
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function resolveRequestUserId(req) {
  return req.auth?.userId || req.user?.id || null
}

/**
 * 归一化请求身份：req.userId 是路由层唯一身份来源。
 * 未登录且允许匿名时固定为 ANONYMOUS_USER_ID，否则为 null。
 */
export function identity(req, _res, next) {
  req.userId = resolveRequestUserId(req) || (config.auth.allowAnonymous ? ANONYMOUS_USER_ID : null)
  next()
}

/**
 * 强制身份存在；用于必须登录的写路径。
 */
export function requireUserId(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: '未登录，请先登录' })
  }
  next()
}
