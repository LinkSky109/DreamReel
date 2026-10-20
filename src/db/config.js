import config from '../config/index.js'

export function databaseUrl() {
  const url = process.env.DATABASE_URL || config.db.url
  if (!url) {
    throw new Error('DATABASE_URL 未配置，无法连接 PostgreSQL')
  }
  return url
}

export function isPostgresEnabled() {
  return Boolean(process.env.DATABASE_URL || config.db.url) && config.db.driver !== 'json'
}
