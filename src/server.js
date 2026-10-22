import config from './config/index.js'
import logger from './utils/logger.js'
import app from './app.js'

export default app

// Start server only when run directly (not when imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  const server = app.listen(config.port, () => {
    logger.info(`DreamReel API server running on port ${config.port}`)
    logger.info(`Environment: ${config.env}`)
    logger.info(`Static frontend: ${config.serveStatic ? 'enabled' : 'disabled (API-only)'}`)
    logger.info(`Data driver: ${config.db.driver}`)
    logger.info(`Health check: http://localhost:${config.port}/health`)
  })

  // 角色/世界观抽取是一次性长任务（确认后不再修改），单个请求可能持续数分钟。
  // 关闭 socket 空闲超时与请求超时，避免长抽取被中断。
  server.timeout = 0
  server.requestTimeout = 0
  server.headersTimeout = 10 * 60 * 1000


  const shutdown = (signal) => {
    logger.info(`${signal} received, shutting down gracefully`)
    server.close(async (error) => {
      if (error) {
        logger.error('Graceful shutdown failed:', error.message)
        process.exit(1)
      }
      try {
        const { closeDb } = await import('./db/client.js')
        await closeDb()
      } catch {
        // 未启用数据库时忽略
      }
      logger.info('Server closed')
      process.exit(0)
    })
    // 兜底：30s 内未关闭则强制退出
    setTimeout(() => {
      logger.error('Forced shutdown after timeout')
      process.exit(1)
    }, 30000).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}
