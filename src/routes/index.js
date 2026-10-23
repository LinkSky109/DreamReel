import projectsRouter from './projects.js'
import scriptRouter from './script.js'
import videoRouter from './video.js'
import videoJobsRouter from './videoJobs.js'
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

/**
 * API 挂载表：/api 与 /api/v1 共用同一份定义，避免两套路由漂移。
 * auth 保持现状（authOptional），收紧到 authRequired 属于 Phase 5。
 */
export const apiMounts = [
  { path: '/auth', router: authRouter },
  { path: '/subscription', router: subscriptionRouter },
  { path: '/projects', router: projectsRouter },
  { path: '/projects', router: versionsRouter },
  { path: '/stats', router: statsRouter },
  { path: '/moderation', router: moderationRouter },
  { path: '/notifications', router: notificationsRouter },
  { path: '/script', router: scriptRouter },
  { path: '/video', router: videoJobsRouter },
  { path: '/video', router: videoRouter },
  { path: '/characters', router: charactersRouter },
  { path: '/dubbing', router: dubbingRouter },
  { path: '/export', router: exportRouter },
  { path: '/quota', router: quotaRouter },
  { path: '/templates', router: templatesRouter },
  { path: '/styles', router: stylesRouter },
  { path: '/analysis', router: analysisRouter },
  { path: '/collab', router: collaborationRouter },
  { path: '/providers', router: providersRouter },
  { path: '/providers', router: providerMetricsRouter },
  { path: '/system', router: systemRouter },
  { path: '/webhooks', router: webhooksRouter },
  { path: '/ai-assistant', router: aiAssistantRouter },
  { path: '/audio', router: audioRouter },
  { path: '/scenes', router: scenesRouter },
  { path: '/marketing', router: marketingRouter },
  { path: '/creators', router: creatorsRouter },
  { path: '/gallery', router: galleryRouter },
  { path: '/challenges', router: challengesRouter },
  { path: '/teams', router: teamsRouter },
  { path: '/open/v1', router: openApiRouter },
  { path: '/api-keys', router: apiKeysRouter },
  { path: '/store', router: storeRouter },
  { path: '/enterprise', router: enterpriseRouter },
  { path: '/title-sequences', router: titleSequencesRouter },
  { path: '/directors', router: directorsRouter },
  { path: '/studios', router: studiosRouter },
  { path: '/images', router: imagesRouter },
  { path: '/edit-plans', router: editPlansRouter },
  { path: '/community', router: communityRouter },
  { path: '/novels', router: novelsRouter },
  { path: '/cloud-drive', router: cloudDriveRouter },
]

export function mountApi(app, base = '/api') {
  for (const mount of apiMounts) {
    app.use(`${base}${mount.path}`, ...(mount.middleware || []), mount.router)
  }
}
