import express from 'express'
import cors from 'cors'
import path from 'path'
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
import { authOptional } from './middleware/auth.js'
import { performanceMonitor } from './services/performanceMonitor.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const STORAGE_DIR = path.resolve(config.storage.path)

const app = express()

// Middleware
app.use(cors())
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
app.use('/api/system', systemRouter)
app.use('/api/webhooks', webhooksRouter)
app.use('/api/ai-assistant', aiAssistantRouter)
app.use('/api/audio', authOptional, audioRouter)
app.use('/api/scenes', scenesRouter)
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

// Static files: only expose media subdirectories, never storage/data (DB, hashes, keys)
const PUBLIC_STORAGE_DIRS = ['videos', 'exports', 'thumbnails', 'title-sequences', 'images', 'audio', 'scenes']
for (const dir of PUBLIC_STORAGE_DIRS) {
  app.use(`/storage/${dir}`, express.static(path.join(STORAGE_DIR, dir)))
}
app.use('/storage', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Static files (audio - BGM and SFX)
app.use('/audio/bgm', express.static(path.join(STORAGE_DIR, 'audio', 'bgm')))
app.use('/audio/sfx', express.static(path.join(STORAGE_DIR, 'audio', 'sfx')))

// Static files (frontend)
app.use(express.static(PUBLIC_DIR))

// API 文档
app.get('/docs', (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'docs.html'))
})

// SPA fallback — 非 API 请求返回 index.html
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' })
  }
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'))
})

// Error handler
app.use((error, _req, res, _next) => {
  logger.error('Unhandled error:', error.message)
  res.status(500).json({
    error: 'Internal server error',
    message: config.env === 'development' ? error.message : undefined,
  })
})

export default app

// Start server only when run directly (not when imported for testing)
const isMainModule = import.meta.url === `file://${process.argv[1]}`
if (isMainModule) {
  app.listen(config.port, () => {
    logger.info(`DreamReel API server running on port ${config.port}`)
    logger.info(`Environment: ${config.env}`)
    logger.info(`Health check: http://localhost:${config.port}/health`)
  })
}
