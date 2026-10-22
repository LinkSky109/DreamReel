import config from '../config/index.js'

export function databaseUrl() {
  const url = process.env.DATABASE_URL || config.db.url
  if (!url) {
    throw new Error('DATABASE_URL 未配置，无法连接 PostgreSQL')
  }
  return url
}

/**
 * 是否需要 PostgreSQL 连接。
 * 小说域已固定为 PostgreSQL 单源（无 legacy/dual 写模式），
 * 运行时始终依赖 PG；健康检查必须探测连接，避免“探针绿、业务红”。
 */
export function isPostgresEnabled() {
  return true
}
