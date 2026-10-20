import projectsRouter from './projects.js'
import scriptRouter from './script.js'
import videoRouter from './video.js'
import charactersRouter from './characters.js'
import dubbingRouter from './dubbing.js'
import exportRouter from './export.js'
import quotaRouter from './quota.js'
import templatesRouter from './templates.js'
import stylesRouter from './styles.js'
import analysisRouter from './analysis.js'
import collaborationRouter from './collaboration.js'
import authRouter from './auth.js'
import subscriptionRouter from './subscription.js'
import versionsRouter from './versions.js'
import statsRouter from './stats.js'
import moderationRouter from './moderation.js'
import notificationsRouter from './notifications.js'
import providersRouter from './providers.js'
import providerMetricsRouter from './providerMetrics.js'
import systemRouter from './system.js'
import webhooksRouter from './webhooks.js'
import aiAssistantRouter from './aiAssistant.js'
import audioRouter from './audio.js'
import scenesRouter from './scenes.js'
import marketingRouter from './marketing.js'
import creatorsRouter from './creators.js'
import galleryRouter from './gallery.js'
import challengesRouter from './challenges.js'
import teamsRouter from './teams.js'
import openApiRouter from './openApi.js'
import apiKeysRouter from './apiKeys.js'
import storeRouter from './store.js'
import enterpriseRouter from './enterprise.js'
import titleSequencesRouter from './titleSequences.js'
import directorsRouter from './directors.js'
import studiosRouter from './studios.js'
import imagesRouter from './images.js'
import editPlansRouter from './editPlans.js'
import communityRouter from './community.js'
import novelsRouter from './novels.js'
import cloudDriveRouter from './cloudDrive.js'
import { authOptional } from '../middleware/auth.js'

/**
 * API 挂载表：/api 与 /api/v1 共用同一份定义，避免两套路由漂移。
 * auth 保持现状（authOptional），收紧到 authRequired 属于 Phase 5。
 */
export const apiMounts = [
  { path: '/auth', router: authRouter },
  { path: '/subscription', router: subscriptionRouter },
  { path: '/projects', middleware: [authOptional], router: projectsRouter },
  { path: '/projects', middleware: [authOptional], router: versionsRouter },
  { path: '/stats', middleware: [authOptional], router: statsRouter },
  { path: '/moderation', middleware: [authOptional], router: moderationRouter },
  { path: '/notifications', middleware: [authOptional], router: notificationsRouter },
  { path: '/script', middleware: [authOptional], router: scriptRouter },
  { path: '/video', middleware: [authOptional], router: videoRouter },
  { path: '/characters', middleware: [authOptional], router: charactersRouter },
  { path: '/dubbing', middleware: [authOptional], router: dubbingRouter },
  { path: '/export', middleware: [authOptional], router: exportRouter },
  { path: '/quota', middleware: [authOptional], router: quotaRouter },
  { path: '/templates', middleware: [authOptional], router: templatesRouter },
  { path: '/styles', router: stylesRouter },
  { path: '/analysis', middleware: [authOptional], router: analysisRouter },
  { path: '/collab', middleware: [authOptional], router: collaborationRouter },
  { path: '/providers', router: providersRouter },
  { path: '/providers', router: providerMetricsRouter },
  { path: '/system', router: systemRouter },
  { path: '/webhooks', router: webhooksRouter },
  { path: '/ai-assistant', router: aiAssistantRouter },
  { path: '/audio', middleware: [authOptional], router: audioRouter },
  { path: '/scenes', middleware: [authOptional], router: scenesRouter },
  { path: '/marketing', middleware: [authOptional], router: marketingRouter },
  { path: '/creators', middleware: [authOptional], router: creatorsRouter },
  { path: '/gallery', middleware: [authOptional], router: galleryRouter },
  { path: '/challenges', middleware: [authOptional], router: challengesRouter },
  { path: '/teams', middleware: [authOptional], router: teamsRouter },
  { path: '/open/v1', router: openApiRouter },
  { path: '/api-keys', middleware: [authOptional], router: apiKeysRouter },
  { path: '/store', middleware: [authOptional], router: storeRouter },
  { path: '/enterprise', middleware: [authOptional], router: enterpriseRouter },
  { path: '/title-sequences', router: titleSequencesRouter },
  { path: '/directors', router: directorsRouter },
  { path: '/studios', router: studiosRouter },
  { path: '/images', middleware: [authOptional], router: imagesRouter },
  { path: '/edit-plans', middleware: [authOptional], router: editPlansRouter },
  { path: '/community', middleware: [authOptional], router: communityRouter },
  { path: '/novels', middleware: [authOptional], router: novelsRouter },
  { path: '/cloud-drive', middleware: [authOptional], router: cloudDriveRouter },
]

export function mountApi(app, base = '/api') {
  for (const mount of apiMounts) {
    app.use(`${base}${mount.path}`, ...(mount.middleware || []), mount.router)
  }
}
