import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { fileURLToPath } from 'url'
import config from './config/index.js'
import logger from './utils/logger.js'

import projectsRouter from './routes/projects.js'
import scriptRouter from './routes/script.js'
import videoRouter from './routes/video.js'
import charactersRouter from './routes/characters.js'
import dubbingRouter from './routes/dubbing.js'
import exportRouter from './routes/export.js'
import quotaRouter from './routes/quota.js'
import templatesRouter from './routes/templates.js'
import stylesRouter from './routes/styles.js'
import analysisRouter from './routes/analysis.js'
import collaborationRouter from './routes/collaboration.js'
import authRouter from './routes/auth.js'
import subscriptionRouter from './routes/subscription.js'
import versionsRouter from './routes/versions.js'
import statsRouter from './routes/stats.js'
import moderationRouter from './routes/moderation.js'
import notificationsRouter from './routes/notifications.js'
import providersRouter from './routes/providers.js'
import providerMetricsRouter from './routes/providerMetrics.js'
import systemRouter from './routes/system.js'
import webhooksRouter from './routes/webhooks.js'
import aiAssistantRouter from './routes/aiAssistant.js'
import audioRouter from './routes/audio.js'
import scenesRouter from './routes/scenes.js'
import marketingRouter from './routes/marketing.js'
import creatorsRouter from './routes/creators.js'
import galleryRouter from './routes/gallery.js'
import challengesRouter from './routes/challenges.js'
import teamsRouter from './routes/teams.js'
import openApiRouter from './routes/openApi.js'
import apiKeysRouter from './routes/apiKeys.js'
import storeRouter from './routes/store.js'
import enterpriseRouter from './routes/enterprise.js'
import titleSequencesRouter from './routes/titleSequences.js'
import directorsRouter from './routes/directors.js'
import studiosRouter from './routes/studios.js'
import imagesRouter from './routes/images.js'
import editPlansRouter from './routes/editPlans.js'
import communityRouter from './routes/community.js'
import novelsRouter from './routes/novels.js'
import cloudDriveRouter from './routes/cloudDrive.js'
import { authOptional } from './middleware/auth.js'
import { mediaAccess } from './middleware/mediaAccess.js'
import { performanceMonitor } from './services/performanceMonitor.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const STORAGE_DIR = path.resolve(config.storage.path)

const app = express()
app.disable('x-powered-by')

// 请求 ID：优先沿用上游网关传入，便于链路追踪
app.use((req, res, next) => {
  const incoming = req.get('x-request-id')
  const id = incoming && incoming.length <= 128 ? incoming : randomUUID()
  req.id = id
  req.traceId = id
  res.setHeader('x-request-id', id)
  next()
})

// 基础安全响应头（不引入额外依赖，CSP 待前端资源清单稳定后单独启用）
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})

// CORS：显式白名单；未配置时开发环境放开、生产环境只允许同源
const corsOptions = config.corsOrigins.length
  ? {
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) return callback(null, true)
        return callback(new Error(`CORS origin not allowed: ${origin}`))
      },
      credentials: true,
    }
  : config.env === 'production'
    ? { origin: false }
    : { origin: true, credentials: true }
if (config.env === 'production' && !config.corsOrigins.length) {
  logger.warn('CORS_ORIGINS 未配置，生产环境仅允许同源请求')
}
app.use(cors(corsOptions))
app.use(express.json({ limit: '10mb' }))

// 性能监控中间件
app.use((req, res, next) => {
  performanceMonitor.startRequest(req)
  res.on('finish', () => performanceMonitor.endRequest(req, res))
  next()
})

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`)
  next()
})

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'DreamReel API',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
})

// 存活探针：进程在即可
app.get('/health/live', (_req, res) => {
  res.json({ status: 'ok' })
})

// 就绪探针：存储可用才接流量；数据库接入后在此追加 DB/Redis 检查
app.get('/health/ready', (_req, res) => {
  try {
    fs.accessSync(STORAGE_DIR, fs.constants.R_OK | fs.constants.W_OK)
    res.json({ status: 'ready', storage: 'ok', db: config.db.driver })
  } catch (error) {
    res.status(503).json({ status: 'not_ready', storage: 'error', message: error.message })
  }
})

// API routes
app.use('/api/auth', authRouter)
app.use('/api/subscription', subscriptionRouter)
app.use('/api/projects', authOptional, projectsRouter)
app.use('/api/projects', authOptional, versionsRouter)
app.use('/api/stats', authOptional, statsRouter)
app.use('/api/moderation', authOptional, moderationRouter)
app.use('/api/notifications', authOptional, notificationsRouter)
app.use('/api/script', authOptional, scriptRouter)
app.use('/api/video', authOptional, videoRouter)
app.use('/api/characters', authOptional, charactersRouter)
app.use('/api/dubbing', authOptional, dubbingRouter)
app.use('/api/export', authOptional, exportRouter)
app.use('/api/quota', authOptional, quotaRouter)
app.use('/api/templates', authOptional, templatesRouter)
app.use('/api/styles', stylesRouter)
app.use('/api/analysis', authOptional, analysisRouter)
app.use('/api/collab', authOptional, collaborationRouter)
app.use('/api/providers', providersRouter)
app.use('/api/providers', providerMetricsRouter) // /metrics /compare /costs（Phase 0 指标）
app.use('/api/system', systemRouter)
app.use('/api/webhooks', webhooksRouter)
app.use('/api/ai-assistant', aiAssistantRouter)
app.use('/api/audio', authOptional, audioRouter)
app.use('/api/scenes', authOptional, scenesRouter)
app.use('/api/marketing', authOptional, marketingRouter)
app.use('/api/creators', authOptional, creatorsRouter)
app.use('/api/gallery', authOptional, galleryRouter)
app.use('/api/challenges', authOptional, challengesRouter)
app.use('/api/teams', authOptional, teamsRouter)
app.use('/api/open/v1', openApiRouter)
app.use('/api/api-keys', authOptional, apiKeysRouter)
app.use('/api/store', authOptional, storeRouter)
app.use('/api/enterprise', authOptional, enterpriseRouter)
app.use('/api/title-sequences', titleSequencesRouter)
app.use('/api/directors', directorsRouter)
app.use('/api/studios', studiosRouter)
app.use('/api/images', authOptional, imagesRouter)
app.use('/api/edit-plans', authOptional, editPlansRouter)
app.use('/api/community', authOptional, communityRouter)
app.use('/api/novels', authOptional, novelsRouter)
app.use('/api/cloud-drive', authOptional, cloudDriveRouter)

// Static files: only expose media subdirectories, never storage/data (DB, hashes, keys)
// R37：公开素材库保持直接访问
app.use('/storage/audio/bgm', express.static(path.join(STORAGE_DIR, 'audio', 'bgm')))
app.use('/storage/audio/sfx', express.static(path.join(STORAGE_DIR, 'audio', 'sfx')))
app.use('/storage/scenes', express.static(path.join(STORAGE_DIR, 'scenes')))

// R37：用户生成媒体目录需经访问控制中间件
const PROTECTED_STORAGE_DIRS = [
  'videos',
  'exports',
  'images',
  'audio/previews',
  'audio/voices',
  'thumbnails',
  'title-sequences',
]
for (const dir of PROTECTED_STORAGE_DIRS) {
  app.use(`/storage/${dir}`, mediaAccess, express.static(path.join(STORAGE_DIR, dir)))
}

// 兜底：/storage 下其他路径返回 404
app.use('/storage', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Static files (audio - BGM and SFX)
app.use('/audio/bgm', express.static(path.join(STORAGE_DIR, 'audio', 'bgm')))
app.use('/audio/sfx', express.static(path.join(STORAGE_DIR, 'audio', 'sfx')))

// 前端静态资源（前后端分离部署时通过 SERVE_STATIC=false 关闭）
if (config.serveStatic) {
  app.use(express.static(PUBLIC_DIR))

  // API 文档
  app.get('/docs', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'docs.html'))
  })
}

// 404：API 永远返回 JSON；未托管前端时其他路径也返回 JSON
app.use((req, res) => {
  if (req.path.startsWith('/api/') || !config.serveStatic) {
    return res.status(404).json({ error: 'Not found', requestId: req.id })
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
})

// Error handler
app.use((error, _req, res, _next) => {
  if (/^CORS origin not allowed/.test(error.message)) {
    return res.status(403).json({ error: 'Forbidden', message: error.message })
  }
  logger.error('Unhandled error:', error.message)
  res.status(500).json({
    error: 'Internal server error',
    message: config.env === 'development' ? error.message : undefined,
  })
})

export default app
