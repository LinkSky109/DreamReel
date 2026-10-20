/**
 * API 版本标记与旧版本弃用提示。
 * legacy：/api 保持兼容，返回 Deprecation 头指向 /api/v1。
 * v1：/api/v1，新客户端应使用该前缀。
 */
export function apiVersion(version) {
  return (_req, res, next) => {
    res.setHeader('x-api-version', version)
    if (version === 'legacy') {
      res.setHeader('deprecation', 'true')
      res.setHeader('link', '</api/v1>; rel="successor-version"')
    } else {
      // 外层 /api 中间件已写入 legacy 弃用头，v1 需要清掉
      res.removeHeader('deprecation')
      res.removeHeader('link')
    }
    next()
  }
}
