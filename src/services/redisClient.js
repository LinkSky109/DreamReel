import { createClient } from 'redis'
import config from '../config/index.js'
import logger from '../utils/logger.js'

/**
 * 可选 Redis 客户端（R3-T3.8）。
 * 未配置 REDIS_URL 时返回 null；连接失败只告警并回退进程内实现。
 */
let client = null
let connecting = null

export function isRedisConfigured() {
  return Boolean(config.redis.url)
}

export async function getRedisClient() {
  if (!config.redis.url) return null
  if (client?.isReady) return client
  if (connecting) return connecting
  connecting = (async () => {
    try {
      const instance = createClient({ url: config.redis.url })
      instance.on('error', (error) => logger.warn(`Redis error: ${error.message}`))
      await instance.connect()
      client = instance
      logger.info('Redis connected')
      return client
    } catch (error) {
      logger.warn(`Redis connect failed, falling back to in-memory: ${error.message}`)
      return null
    } finally {
      connecting = null
    }
  })()
  return connecting
}

export async function closeRedis() {
  if (!client) return
  await client.quit().catch(() => {})
  client = null
}

export default getRedisClient
