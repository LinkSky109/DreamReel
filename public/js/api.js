/**
 * DreamReel API Client
 * 封装所有后端 API 调用
 */

// 前后端分离：API 地址可配置
// 优先级：window.ENV_API_URL > localStorage > 同源 /api（本地开发） > http://localhost:3000/api
const API_BASE = (typeof window !== 'undefined' && window.ENV_API_URL)
  || (typeof localStorage !== 'undefined' && localStorage.getItem('dreamreel_api_url'))
  || (typeof window !== 'undefined' && window.location && window.location.port
      ? `${window.location.origin}/api`
      : 'http://localhost:3000/api')

// 构建 query string，自动过滤 undefined/null/空字符串
function buildQueryString(params = {}) {
  const clean = {}
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      clean[key] = value
    }
  })
  const qs = new URLSearchParams(clean).toString()
  return qs ? '?' + qs : ''
}

// 从 localStorage 获取 token
function getToken() {
  return localStorage.getItem('dreamreel_token')
}

async function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE}${path}`, {
    headers,
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`)
  }
  return data
}

export const api = {
  // Auth
  register: (data) => request('/auth/register', { method: 'POST', body: data }),
  login: (data) => request('/auth/login', { method: 'POST', body: data }),
  getMe: () => request('/auth/me'),

  // Subscription
  getPlans: () => request('/subscription/plans'),
  getCurrentSubscription: () => request('/subscription/current'),
  subscribe: (data) => request('/subscription/subscribe', { method: 'POST', body: data }),
  cancelSubscription: () => request('/subscription/cancel', { method: 'POST' }),
  reactivateSubscription: () => request('/subscription/reactivate', { method: 'POST' }),

  // Projects
  listProjects: (params = {}) => {
    const query = new URLSearchParams()
    if (params.search) query.set('search', params.search)
    if (params.status) query.set('status', params.status)
    if (params.style) query.set('style', params.style)
    if (params.platform) query.set('platform', params.platform)
    if (params.tag) query.set('tag', params.tag)
    if (params.favorite) query.set('favorite', params.favorite)
    if (params.archived) query.set('archived', params.archived)
    if (params.sort) query.set('sort', params.sort)
    if (params.limit) query.set('limit', params.limit)
    if (params.offset) query.set('offset', params.offset)
    const qs = query.toString()
    return request(`/projects${qs ? '?' + qs : ''}`)
  },
  getRecentProjects: (limit = 5) => request(`/projects/recent?limit=${limit}`),
  getAllTags: () => request('/projects/tags'),
  toggleFavorite: (projectId) => request(`/projects/${projectId}/favorite`, { method: 'POST' }),
  toggleArchive: (projectId) => request(`/projects/${projectId}/archive`, { method: 'POST' }),
  duplicateProject: (projectId, newName) =>
    request(`/projects/${projectId}/duplicate`, { method: 'POST', body: { newName } }),
  batchDelete: (projectIds) =>
    request('/projects/batch/delete', { method: 'POST', body: { projectIds } }),
  batchArchive: (projectIds, archive) =>
    request('/projects/batch/archive', { method: 'POST', body: { projectIds, archive } }),
  batchFavorite: (projectIds, favorite) =>
    request('/projects/batch/favorite', { method: 'POST', body: { projectIds, favorite } }),
  getRecycleBin: (params = {}) =>
    request(`/projects/recycle-bin/list${buildQueryString(params)}`),
  getRecycleBinStats: () => request('/projects/recycle-bin/stats'),
  restoreFromRecycleBin: (projectId) => request(`/projects/recycle-bin/${projectId}/restore`, { method: 'POST' }),
  permanentlyDeleteProject: (projectId) => request(`/projects/recycle-bin/${projectId}`, { method: 'DELETE' }),
  emptyRecycleBin: () => request('/projects/recycle-bin', { method: 'DELETE' }),
  getProject: (id) => request(`/projects/${id}`),
  createProject: (data) => request('/projects', { method: 'POST', body: data }),
  updateProject: (id, data) => request(`/projects/${id}`, { method: 'PUT', body: data }),
  updateShotOrder: (projectId, shotIds) =>
    request(`/projects/${projectId}/shots/order`, { method: 'PUT', body: { shotIds } }),
  updateShotDuration: (projectId, shotId, duration) =>
    request(`/projects/${projectId}/shots/${shotId}/duration`, { method: 'PUT', body: { duration } }),
  deleteProject: (id) => request(`/projects/${id}`, { method: 'DELETE' }),
  generateThumbnail: (id) => request(`/projects/${id}/thumbnail`, { method: 'POST' }),
  uploadCover: (id, imageBase64) => request(`/projects/${id}/cover`, { method: 'POST', body: { image: imageBase64 } }),
  exportProject: (id) => {
    // 直接触发浏览器下载
    window.open(`${API_BASE}/projects/${id}/export`, '_blank')
  },
  importProject: (projectData) => request('/projects/import', { method: 'POST', body: { projectData } }),

  // Versions
  getVersions: (projectId) => request(`/projects/${projectId}/versions`),
  saveVersion: (projectId, data) => request(`/projects/${projectId}/versions`, { method: 'POST', body: data }),
  getVersion: (projectId, versionId) => request(`/projects/${projectId}/versions/${versionId}`),
  rollbackVersion: (projectId, versionId) =>
    request(`/projects/${projectId}/versions/${versionId}/rollback`, { method: 'POST' }),
  deleteVersion: (projectId, versionId) =>
    request(`/projects/${projectId}/versions/${versionId}`, { method: 'DELETE' }),

  // Stats
  getDashboard: () => request('/stats/dashboard'),
  getStatsOverview: () => request('/stats/overview'),
  getStatsTrend: (days = 14) => request(`/stats/trend?days=${days}`),
  getStatsStyles: () => request('/stats/styles'),
  getStatsQuota: () => request('/stats/quota'),

  // Script
  generateScript: (data) => request('/script/generate', { method: 'POST', body: data }),
  reviseScript: (script, feedback) =>
    request('/script/revise', { method: 'POST', body: { script, feedback } }),

  // Video
  generateVideo: (data) => request('/video/generate', { method: 'POST', body: data }),
  generateAllVideos: (projectId, options = {}) =>
    request(`/video/generate-all/${projectId}`, { method: 'POST', body: options }),
  regenerateVideo: (data) => request('/video/regenerate', { method: 'POST', body: data }),
  generateCandidates: (data) => request('/video/candidates', { method: 'POST', body: data }),
  lockShot: (projectId, shotId, locked) =>
    request(`/video/shots/${shotId}/lock`, { method: 'PUT', body: { projectId, locked } }),
  updateShot: (projectId, shotId, data) =>
    request(`/video/shots/${shotId}`, { method: 'PUT', body: { projectId, ...data } }),
  switchShotVersion: (projectId, shotId, versionIndex) =>
    request(`/video/shots/${shotId}/version/${versionIndex}`, { method: 'POST', body: { projectId } }),
  getGenerationHistory: (projectId, params = {}) => {
    const query = new URLSearchParams()
    if (params.limit) query.set('limit', params.limit)
    if (params.offset) query.set('offset', params.offset)
    if (params.status) query.set('status', params.status)
    if (params.provider) query.set('provider', params.provider)
    const qs = query.toString()
    return request(`/video/history/${projectId}${qs ? '?' + qs : ''}`)
  },
  getShotGenerationHistory: (shotId, limit = 20) =>
    request(`/video/history/shot/${shotId}?limit=${limit}`),
  getGenerationStats: (projectId) => request(`/video/history/${projectId}/stats`),
  clearGenerationHistory: (projectId) => request(`/video/history/${projectId}`, { method: 'DELETE' }),
  getVideoQueue: () => request('/video/queue'),
  getProjectVideoQueue: (projectId) => request(`/video/queue/project/${projectId}`),
  cancelVideoTask: (taskId) => request(`/video/queue/cancel/${taskId}`, { method: 'POST' }),
  cancelProjectVideoTasks: (projectId) => request(`/video/queue/cancel-project/${projectId}`, { method: 'POST' }),
  getVideoTaskHistory: (params = {}) => {
    const query = new URLSearchParams()
    if (params.projectId) query.set('projectId', params.projectId)
    if (params.shotId) query.set('shotId', params.shotId)
    if (params.status) query.set('status', params.status)
    if (params.limit) query.set('limit', params.limit)
    const qs = query.toString()
    return request(`/video/queue/history${qs ? '?' + qs : ''}`)
  },

  // Characters
  listCharacters: (projectId) => request(`/characters?projectId=${projectId}`),
  createCharacter: (data) => request('/characters', { method: 'POST', body: data }),
  lockCharacter: (characterId, data) =>
    request(`/characters/${characterId}/lock`, { method: 'POST', body: data }),
  evaluateCharacter: (characterId, data) =>
    request(`/characters/${characterId}/evaluate`, { method: 'POST', body: data }),
  updateCharacterStyling: (characterId, data) =>
    request(`/characters/${characterId}/styling`, { method: 'PATCH', body: data }),

  // Title Sequences (R28)
  listTitleSequences: () => request('/title-sequences'),
  generateTitleSequence: (id, data) =>
    request(`/title-sequences/${id}/generate`, { method: 'POST', body: data }),

  // R29：导演模式
  listDirectors: () => request('/directors'),
  getDirector: (id) => request(`/directors/${id}`),
  applyDirector: (directorId, projectId) =>
    request(`/directors/${directorId}/apply`, { method: 'POST', body: { projectId } }),
  disableDirector: (projectId) =>
    request('/directors/disable', { method: 'POST', body: { projectId } }),

  // R30：剧场计划厂牌
  listStudios: () => request('/studios'),
  createStudio: (data) => request('/studios', { method: 'POST', body: data }),
  getStudio: (id) => request(`/studios/${id}`),
  updateStudio: (id, data) => request(`/studios/${id}`, { method: 'PUT', body: data }),
  signMember: (studioId, data) =>
    request(`/studios/${studioId}/members`, { method: 'POST', body: data }),
  removeMember: (studioId, userId) =>
    request(`/studios/${studioId}/members/${userId}`, { method: 'DELETE' }),
  createShow: (studioId, data) =>
    request(`/studios/${studioId}/shows`, { method: 'POST', body: data }),
  listShows: (studioId) => request(`/studios/${studioId}/shows`),
  getShow: (studioId, showId) => request(`/studios/${studioId}/shows/${showId}`),
  addProjectToShow: (studioId, showId, projectId) =>
    request(`/studios/${studioId}/shows/${showId}/projects/${projectId}`, { method: 'POST' }),
  addProjectToStudio: (studioId, projectId) =>
    request(`/studios/${studioId}/projects/${projectId}`, { method: 'POST' }),
  listStudioWorks: (studioId) => request(`/studios/${studioId}/projects`),

  // Dubbing
  generateDubbing: (data) => request('/dubbing/generate', { method: 'POST', body: data }),
  getVoices: () => request('/dubbing/voices'),

  // Audio (BGM/SFX)
  listBgm: (params = {}) => {
    const qs = buildQueryString(params)
    return request(`/audio/bgm${qs ? '?' + qs : ''}`)
  },
  recommendBgm: (scriptText) => request('/audio/bgm/recommend', { method: 'POST', body: { scriptText } }),
  listSfx: (params = {}) => {
    const qs = buildQueryString(params)
    return request(`/audio/sfx${qs ? '?' + qs : ''}`)
  },

  // Scenes
  listScenes: (params = {}) => {
    const qs = buildQueryString(params)
    return request(`/scenes${qs ? '?' + qs : ''}`)
  },
  getScene: (id) => request(`/scenes/${id}`),
  createScene: (data) => request('/scenes', { method: 'POST', body: data }),
  updateScene: (id, data) => request(`/scenes/${id}`, { method: 'PUT', body: data }),
  deleteScene: (id) => request(`/scenes/${id}`, { method: 'DELETE' }),

  // R32: 图片生成
  getImageProviders: () => request('/images/providers'),
  generateImages: (data) => request('/images/generate', { method: 'POST', body: data }),
  listImageAssets: (params = {}) => request(`/images/assets${buildQueryString(params)}`),
  getImageAsset: (id) => request(`/images/assets/${id}`),
  deleteImageAsset: (id) => request(`/images/assets/${id}`, { method: 'DELETE' }),
  applyImageAsset: (id, data) => request(`/images/assets/${id}/apply`, { method: 'POST', body: data }),

  // R33: 音频混音预听
  previewAudioMix: (data) => request('/audio/preview', { method: 'POST', body: data }),

  // R34: 智能剪辑
  getEditProfiles: () => request('/edit-plans/profiles'),
  generateEditPlan: (data) => request('/edit-plans/generate', { method: 'POST', body: data }),
  getEditPlan: (projectId) => request(`/edit-plans/${projectId}`),
  clearEditPlan: (projectId) => request(`/edit-plans/${projectId}`, { method: 'DELETE' }),
  renderEditPlan: (projectId) => request(`/edit-plans/${projectId}/render`, { method: 'POST' }),
  getTransitionSupport: (projectId) => request(`/edit-plans/${projectId}/transition-support`),
  previewVoice: (data) => request('/dubbing/preview', { method: 'POST', body: data }),

  // R08：连续性检查
  checkContinuity: (projectId) =>
    request(`/video/continuity/check?projectId=${encodeURIComponent(projectId)}`),

  // R16：海报
  getPosterOptions: () => request('/marketing/poster/options'),
  generatePoster: (data) =>
    request('/marketing/poster/generate', { method: 'POST', body: data }),

  // R15：预告片
  generateTrailer: (data) =>
    request('/marketing/trailer/generate', { method: 'POST', body: data }),

  // R11：创作者主页
  getCreatorPage: (userId) => request(`/creators/${encodeURIComponent(userId)}`),
  updateCreatorProfile: (userId, data) =>
    request(`/creators/${encodeURIComponent(userId)}`, { method: 'PUT', body: data }),

  // R09：作品广场
  listGallery: (params = {}) => {
    const qs = buildQueryString(params)
    return request(`/gallery/${qs ? `?${qs}` : ''}`)
  },
  publishToGallery: (projectId, category) =>
    request(`/gallery/${projectId}/publish`, { method: 'POST', body: { category } }),
  unpublishFromGallery: (projectId) =>
    request(`/gallery/${projectId}/unpublish`, { method: 'POST' }),
  recordGalleryView: (projectId) =>
    request(`/gallery/${projectId}/view`, { method: 'POST' }),
  likeGalleryWork: (projectId, userId) =>
    request(`/gallery/${projectId}/like`, { method: 'POST', body: { userId } }),

  // R10：创作挑战
  listChallenges: (status) =>
    request(`/challenges/${status ? `?status=${status}` : ''}`),
  getChallengeDetail: (challengeId) => request(`/challenges/${challengeId}`),
  joinChallenge: (challengeId, data) =>
    request(`/challenges/${challengeId}/join`, { method: 'POST', body: data }),
  submitChallenge: (challengeId, projectId) =>
    request(`/challenges/${challengeId}/submit/${projectId}`, { method: 'POST' }),

  // R12：团队协作
  listTeams: (userId) => request(`/teams/${userId ? `?userId=${userId}` : ''}`),
  createTeam: (data) => request('/teams', { method: 'POST', body: data }),
  getTeam: (teamId) => request(`/teams/${teamId}`),
  updateTeam: (teamId, data) => request(`/teams/${teamId}`, { method: 'PUT', body: data }),
  addTeamMember: (teamId, data) =>
    request(`/teams/${teamId}/members`, { method: 'POST', body: data }),
  updateTeamMemberRole: (teamId, userId, role) =>
    request(`/teams/${teamId}/members/${userId}`, { method: 'PUT', body: { role } }),
  removeTeamMember: (teamId, userId) =>
    request(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
  addTeamProject: (teamId, projectId) =>
    request(`/teams/${teamId}/projects/${projectId}`, { method: 'POST' }),
  listTeamProjects: (teamId) => request(`/teams/${teamId}/projects`),

  // R13：API 开放平台（Key 管理）
  listApiKeys: (userId) => request(`/api-keys/${userId ? `?userId=${userId}` : ''}`),
  createApiKey: (data) => request('/api-keys', { method: 'POST', body: data }),
  revokeApiKey: (id) => request(`/api-keys/${id}`, { method: 'DELETE' }),

  // R14：素材商城
  listStorePacks: (type) => request(`/store/packs/${type ? `?type=${type}` : ''}`),
  purchasePack: (packId) => request(`/store/packs/${packId}/purchase`, { method: 'POST' }),
  myStoreAssets: () => request('/store/my-assets'),

  // R20：企业版
  enterpriseOverview: () => request('/enterprise/overview'),
  enterpriseConfig: () => request('/enterprise/config'),
  updateEnterpriseConfig: (data) =>
    request('/enterprise/config', { method: 'PUT', body: data }),
  enterpriseAudit: (params = {}) => {
    const qs = buildQueryString(params)
    return request(`/enterprise/audit${qs ? `?${qs}` : ''}`)
  },
  enterpriseDeployment: () => request('/enterprise/deployment'),

  // Export
  exportProject: (projectId, options) =>
    request(`/export/project/${projectId}`, { method: 'POST', body: options }),
  exportProjectSync: (projectId, options) =>
    request(`/export/project/${projectId}/sync`, { method: 'POST', body: options }),
  getExportHistory: (projectId) => request(`/export/project/${projectId}/history`),

  // Quota
  getQuota: (userId = 'default') => request(`/quota/${userId}`),

  // Templates
  listTemplates: (params = {}) =>
    request(`/templates${buildQueryString(params)}`),
  getTemplate: (id) => request(`/templates/${id}`),
  createFromTemplate: (templateId, data) =>
    request(`/templates/${templateId}/create`, { method: 'POST', body: data }),
  createTemplateFromProject: (data) =>
    request('/templates/user/create-from-project', { method: 'POST', body: data }),
  getUserTemplates: () => request('/templates/user/mine'),
  deleteUserTemplate: (templateId) =>
    request(`/templates/user/${templateId}`, { method: 'DELETE' }),

  // Styles
  listStyles: () => request('/styles'),
  getStyle: (id) => request(`/styles/${id}`),
  previewStyle: (prompt, styleId) =>
    request('/styles/preview', { method: 'POST', body: { prompt, styleId } }),

  // Film Analysis
  analyzeProject: (projectId) => request(`/analysis/project/${projectId}`, { method: 'POST' }),
  analyzeProjectSync: (projectId) => request(`/analysis/project/${projectId}/sync`, { method: 'POST' }),
  getAnalysis: (projectId) => request(`/analysis/project/${projectId}`),

  // Collaboration
  getComments: (projectId, shotId) =>
    request(`/collab/${projectId}/comments${shotId ? `?shotId=${shotId}` : ''}`),
  addComment: (projectId, data) =>
    request(`/collab/${projectId}/comments`, { method: 'POST', body: data }),
  resolveComment: (projectId, commentId, resolved) =>
    request(`/collab/${projectId}/comments/${commentId}/resolve`, { method: 'PATCH', body: { resolved } }),
  deleteComment: (projectId, commentId) =>
    request(`/collab/${projectId}/comments/${commentId}`, { method: 'DELETE' }),
  likeComment: (projectId, commentId, userId) =>
    request(`/collab/${projectId}/comments/${commentId}/like`, { method: 'POST', body: { userId } }),
  unlikeComment: (projectId, commentId, userId) =>
    request(`/collab/${projectId}/comments/${commentId}/like`, { method: 'DELETE', body: { userId } }),
  getCommentReplies: (projectId, commentId) =>
    request(`/collab/${projectId}/comments/${commentId}/replies`),
  getCommentStats: (projectId) => request(`/collab/${projectId}/comments/stats`),
  getActivities: (projectId) => request(`/collab/${projectId}/activities`),
  getShareSettings: (projectId) => request(`/collab/${projectId}/share`),
  updateShareSettings: (projectId, data) =>
    request(`/collab/${projectId}/share`, { method: 'PUT', body: data }),

  // Notifications
  listNotifications: (params = {}) => {
    const query = new URLSearchParams()
    if (params.unread) query.set('unread', 'true')
    if (params.limit) query.set('limit', params.limit)
    const qs = query.toString()
    return request(`/notifications${qs ? '?' + qs : ''}`)
  },
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'POST' }),
  deleteNotification: (id) => request(`/notifications/${id}`, { method: 'DELETE' }),
  clearNotifications: () => request('/notifications', { method: 'DELETE' }),
  getNotificationPreferences: () => request('/notifications/preferences'),
  updateNotificationPreferences: (updates) => request('/notifications/preferences', { method: 'PATCH', body: updates }),

  // AI Assistant
  getAIQuickActions: () => request('/ai-assistant/quick-actions'),
  getAIConversation: (projectId) => request(`/ai-assistant/conversation/${projectId}`),
  sendAIMessage: (projectId, message, userId) => request(`/ai-assistant/chat/${projectId}`, { method: 'POST', body: { message, userId } }),
  runAIQuickAction: (projectId, actionId, userId) => request(`/ai-assistant/quick-action/${projectId}`, { method: 'POST', body: { actionId, userId } }),
  clearAIConversation: (projectId) => request(`/ai-assistant/conversation/${projectId}`, { method: 'DELETE' }),

  // Phase 1: Provider 配置
  getAvailableProviderCatalog: (stage) => request(`/providers/available${stage ? `?stage=${stage}` : ''}`),
  getProjectModelConfig: (projectId) => request(`/projects/${projectId}/model-config`),
  updateProjectModelConfig: (projectId, data) => request(`/projects/${projectId}/model-config`, { method: 'PUT', body: data }),
  getUserModelPreferences: () => request('/auth/me/model-preferences'),
  updateUserModelPreferences: (data) => request('/auth/me/model-preferences', { method: 'PUT', body: data }),

  // System & Providers
  getSystemInfo: () => request('/system/info'),
  getProviderStatus: () => request('/providers/status'),
  getAvailableProviders: () => request('/providers/available'),
  getPerformance: () => request('/system/performance'),
  getPerformanceResources: () => request('/system/performance/resources'),
  getPerformanceRequests: () => request('/system/performance/requests'),
  getPerformanceHistory: () => request('/system/performance/history'),
  resetPerformance: () => request('/system/performance/reset', { method: 'POST' }),

  // Webhooks
  listWebhooks: () => request('/webhooks'),
  getWebhookEvents: () => request('/webhooks/events'),
  createWebhook: (data) => request('/webhooks', { method: 'POST', body: data }),
  updateWebhook: (id, data) => request(`/webhooks/${id}`, { method: 'PUT', body: data }),
  deleteWebhook: (id) => request(`/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id) => request(`/webhooks/${id}/test`, { method: 'POST' }),
  getWebhookDeliveries: (id) => request(`/webhooks/${id}/deliveries`),
}

export default api
