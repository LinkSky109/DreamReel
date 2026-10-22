/**
 * 解析「是否强制登录」开关。
 *
 * 安全默认值：生产环境默认开启，开发/测试环境默认关闭。
 * 显式设置 REQUIRE_AUTH 时以显式值为准（生产可用 false 临时降级，但启动会告警）。
 *
 * @param {Record<string, string|undefined>} [env=process.env]
 * @returns {boolean}
 */
export function resolveAuthEnforce(env = process.env) {
  const raw = env.REQUIRE_AUTH
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return env.NODE_ENV === 'production'
}

export default resolveAuthEnforce

/**
 * 解析「允许匿名使用 default 身份」开关。
 *
 * 安全默认值：生产环境关闭（必须登录），开发/测试环境开启以保留本地无登录体验。
 * 显式设置 ALLOW_ANONYMOUS 时以显式值为准。
 *
 * @param {Record<string, string|undefined>} [env=process.env]
 * @returns {boolean}
 */
export function resolveAllowAnonymous(env = process.env) {
  const raw = env.ALLOW_ANONYMOUS
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return env.NODE_ENV !== 'production'
}
