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
 * 除了 DB_DRIVER，小说域单独的 repo/write 开关也会让运行时依赖 PG，
 * 健康检查必须看到这些开关，否则会出现“探针绿、业务红”。
 */
export function isPostgresEnabled() {
  return (
    config.db.driver === 'postgres' ||
    config.db.driver === 'dual' ||
    config.novels.writeMode !== 'legacy'
  )
}
