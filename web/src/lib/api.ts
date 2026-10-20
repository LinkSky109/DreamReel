import type {
  AiMessage,
  AiQuickAction,
  AudioPreviewResult,
  BgmItem,
  Character,
  CommentItem,
  CurrentUser,
  DubbingResult,
  EditPlan,
  EditProfile,
  EditRenderResult,
  FilmAnalysis,
  ImageAsset,
  ImageProviderInfo,
  ModerationLog,
  NotificationItem,
  NotificationPreferences,
  NovelCharacter,
  NovelCharacterSet,
  CloudDriveStatus,
  NovelAsset,
  NovelAssetBulkResult,
  NovelAssetCategory,
  NovelAssetStats,
  NovelBulkResult,
  NovelDetail,
  NovelEpisode,
  NovelEpisodeAssets,
  NovelExtractJobs,
  NovelSchema,
  NovelSeason,
  NovelSeriesEstimate,
  NovelSeriesPlanResult,
  NovelManifest,
  NovelSeasonAssetSubset,
  NovelSyncLedger,
  NovelSyncResult,
  NovelSyncScope,
  NovelWorldEntity,
  NovelWorldRelation,
  NovelWorldSet,
  NovelWorldSummary,
  QuarkQrSession,
  QuarkQrStatus,
  NovelIngestResult,
  NovelProject,
  Project,
  ProjectListResponse,
  ProjectScript,
  ProjectVersion,
  ProviderStatus,
  SceneItem,
  SfxItem,
  ShareSettings,
  SubscriptionFeatures,
  SubscriptionPlan,
  SystemInfo,
  VersionCompare,
  Voice,
  QuotaOverview,
  TemplateListResponse,
} from '../domain/types'

const TOKEN_KEY = 'dreamreel_token'

export class ApiError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function apiBase(): string {
  const envBase = (window as Window & { ENV_API_URL?: string }).ENV_API_URL
  if (envBase) return envBase
  const saved = localStorage.getItem('dreamreel_api_url')
  if (saved) return saved
  if (window.location.port) return `${window.location.origin}/api`
  return 'http://localhost:3000/api'
}

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query.set(key, String(value))
  }
  const qs = query.toString()
  return qs ? `?${qs}` : ''
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown }

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) headers.Authorization = `Bearer ${token}`

  const response = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string> | undefined) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  const payload = (await response.json().catch(() => ({}))) as {
    error?: string | { code?: string; message?: string }
    message?: string
  }

  if (!response.ok) {
    const message =
      typeof payload.error === 'string'
        ? payload.error
        : payload.error?.message || payload.message || `请求失败（${response.status}）`
    const code = typeof payload.error === 'object' ? payload.error?.code : undefined
    throw new ApiError(message, response.status, code)
  }

  return payload as T
}

async function requestData<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const payload = await request<{ data: T }>(path, options)
  return payload.data
}

export const api = {
  // Auth
  getMe: () => request<{ user: CurrentUser }>('/auth/me'),
  login: (body: { username: string; password: string }) =>
    request<{ token: string; user: CurrentUser }>('/auth/login', { method: 'POST', body }),

  // Quota
  getQuota: () => request<QuotaOverview>('/quota/me'),

  // Projects
  listProjects: (params: {
    search?: string
    status?: string
    style?: string
    platform?: string
    tag?: string
    favorite?: string
    archived?: string
    sort?: string
    limit?: number
    offset?: number
  } = {}) => request<ProjectListResponse>(`/projects${buildQuery(params)}`),
  getRecentProjects: (limit = 6) =>
    request<{ projects: Project[] }>(`/projects/recent${buildQuery({ limit })}`),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  createProject: (body: {
    name: string
    description?: string
    targetDuration?: number
    platform?: string
    style?: string
    templateId?: string
  }) => request<Project>('/projects', { method: 'POST', body }),
  updateProject: (id: string, body: Partial<Project>) =>
    request<Project>(`/projects/${id}`, { method: 'PUT', body }),
  deleteProject: (id: string) => request<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
  toggleFavorite: (id: string) =>
    request<{ isFavorite: boolean }>(`/projects/${id}/favorite`, { method: 'POST' }),
  toggleArchive: (id: string) =>
    request<{ isArchived: boolean }>(`/projects/${id}/archive`, { method: 'POST' }),
  duplicateProject: (id: string) =>
    request<Project>(`/projects/${id}/duplicate`, { method: 'POST', body: {} }),
  batchDelete: (projectIds: string[]) =>
    request<{ deleted: number }>('/projects/batch/delete', {
      method: 'POST',
      body: { projectIds },
    }),
  batchArchive: (projectIds: string[], archive: boolean) =>
    request<{ updated: number }>('/projects/batch/archive', {
      method: 'POST',
      body: { projectIds, archive },
    }),
  batchFavorite: (projectIds: string[], favorite: boolean) =>
    request<{ updated: number }>('/projects/batch/favorite', {
      method: 'POST',
      body: { projectIds, favorite },
    }),
  importProject: (data: unknown) =>
    request<{ message?: string }>('/projects/import', { method: 'POST', body: data }),
  exportProject: (id: string) => {
    window.open(`${apiBase()}/projects/${id}/export`, '_blank', 'noopener')
  },

  // Script & shots
  generateScript: (body: {
    idea: string
    targetDuration?: number
    platform?: string
    style?: string
    projectId?: string
  }) => request<ProjectScript>('/script/generate', { method: 'POST', body }),
  updateShot: (
    projectId: string,
    shotId: string,
    data: { description?: string; duration?: number; dialogue?: string; narration?: string }
  ) =>
    request<{ success: boolean }>(`/video/shots/${shotId}`, {
      method: 'PUT',
      body: { projectId, ...data },
    }),
  lockShot: (projectId: string, shotId: string, locked: boolean) =>
    request<{ success: boolean }>(`/video/shots/${shotId}/lock`, {
      method: 'PUT',
      body: { projectId, locked },
    }),
  switchShotVersion: (projectId: string, shotId: string, versionIndex: number) =>
    request<{ success: boolean }>(`/video/shots/${shotId}/version/${versionIndex}`, {
      method: 'POST',
      body: { projectId },
    }),
  generateVideo: (body: {
    projectId: string
    shotId: string
    prompt: string
    duration: number
    aspectRatio: string
    styleId?: string
  }) => request<{ success?: boolean }>('/video/generate', { method: 'POST', body }),
  regenerateVideo: (body: { projectId: string; shotId: string; styleId?: string }) =>
    request<{ success?: boolean }>('/video/regenerate', { method: 'POST', body }),
  generateAllVideos: (projectId: string, options: { styleId?: string } = {}) =>
    request<{ success?: boolean }>(`/video/generate-all/${projectId}`, { method: 'POST', body: options }),
  listStyles: () =>
    request<{ items: { id: string; name: string; icon?: string }[] }>('/styles'),
  exportProjectVideo: (projectId: string) =>
    request<{ status: string; message: string }>(`/export/project/${projectId}`, {
      method: 'POST',
      body: {},
    }),

  // Images
  getImageProviders: () => request<ImageProviderInfo>('/images/providers'),
  generateImages: (body: {
    projectId: string
    prompt: string
    aspectRatio?: string
    style?: string
    count?: number
  }) =>
    request<{ count: number; assets: ImageAsset[] }>('/images/generate', {
      method: 'POST',
      body,
    }),
  listImageAssets: (params: { projectId?: string; status?: string } = {}) =>
    request<{ items: ImageAsset[]; total?: number }>(`/images/assets${buildQuery(params)}`),
  applyImageAsset: (
    assetId: string,
    body: { targetType: 'shot' | 'character' | 'scene'; targetId: string; projectId: string }
  ) => request<{ targetType: string; targetId: string }>(`/images/assets/${assetId}/apply`, { method: 'POST', body }),
  deleteImageAsset: (assetId: string) =>
    request<{ success: boolean }>(`/images/assets/${assetId}`, { method: 'DELETE' }),

  // Characters
  listCharacters: (projectId: string) =>
    request<{ total: number; items: Character[] }>(`/characters?projectId=${encodeURIComponent(projectId)}`),
  createCharacter: (body: { name: string; description?: string; projectId: string; referenceImages?: string[] }) =>
    request<Character>('/characters', { method: 'POST', body }),
  lockCharacter: (characterId: string, body: { projectId: string; referenceImages: string[] }) =>
    request<Character>(`/characters/${characterId}/lock`, { method: 'POST', body }),

  // Scenes
  listScenes: (params: { category?: string; search?: string } = {}) =>
    request<{ items: SceneItem[]; total?: number }>(`/scenes${buildQuery(params)}`),
  createScene: (body: { name: string; description?: string; category?: string; tags?: string[] }) =>
    request<SceneItem>('/scenes', { method: 'POST', body }),

  // Dubbing
  getVoices: () => request<{ voices: Voice[] }>('/dubbing/voices'),
  previewVoice: (body: { text: string; language?: string; voiceId?: string; speed?: number; projectId?: string }) =>
    request<{ audioUrl?: string; duration?: number; placeholder?: boolean }>('/dubbing/preview', {
      method: 'POST',
      body,
    }),
  generateDubbing: (body: {
    projectId: string
    language?: string
    voiceId?: string
    speed?: number
    burnSubtitles?: boolean
    dialogueAssignments?: Record<string, string>
    pauseSeconds?: number
  }) => request<DubbingResult>('/dubbing/generate', { method: 'POST', body }),

  // Edit plans
  getEditProfiles: () => request<{ items: EditProfile[] }>('/edit-plans/profiles'),
  generateEditPlan: (body: {
    projectId: string
    profile?: string
    targetDuration?: number
    bgmId?: string | null
  }) => request<EditPlan>('/edit-plans/generate', { method: 'POST', body }),
  getEditPlan: (projectId: string) => request<EditPlan>(`/edit-plans/${projectId}`),
  clearEditPlan: (projectId: string) =>
    request<{ cleared: boolean }>(`/edit-plans/${projectId}`, { method: 'DELETE' }),
  renderEditPlan: (projectId: string) =>
    request<EditRenderResult>(`/edit-plans/${projectId}/render`, { method: 'POST', body: {} }),
  getTransitionSupport: (projectId: string) =>
    request<{ xfade: boolean }>(`/edit-plans/${projectId}/transition-support`),
  listBgm: (params: { emotion?: string; search?: string } = {}) =>
    request<{
      items: BgmItem[]
      total?: number
      emotions?: { id: string; name: string; icon?: string }[]
    }>(`/audio/bgm${buildQuery(params)}`),
  listSfx: (params: { category?: string; search?: string } = {}) =>
    request<{
      items: SfxItem[]
      total?: number
      categories?: { id: string; name: string; icon?: string }[]
    }>(`/audio/sfx${buildQuery(params)}`),
  recommendBgm: (scriptText: string) =>
    request<{
      emotion: string
      emotionName: string
      recommendations: BgmItem[]
    }>('/audio/bgm/recommend', { method: 'POST', body: { scriptText } }),
  previewAudioMix: (body: {
    projectId: string
    language?: string
    voiceId?: string
    speed?: number
  }) => request<AudioPreviewResult>('/audio/preview', { method: 'POST', body }),

  // Templates
  listTemplates: (params: { category?: string; search?: string; type?: string } = {}) =>
    request<TemplateListResponse>(`/templates${buildQuery(params)}`),
  createFromTemplate: (templateId: string, body: Record<string, unknown> = {}) =>
    request<Project>(`/templates/${templateId}/create`, {
      method: 'POST',
      body,
    }),

  // Notifications
  listNotifications: (limit = 20) =>
    request<{ items: NotificationItem[]; unreadCount: number }>(
      `/notifications${buildQuery({ limit })}`
    ),
  markNotificationRead: (id: string) =>
    request<{ success: boolean }>(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request<{ success: boolean }>('/notifications/read-all', { method: 'POST' }),
  clearNotifications: () =>
    request<{ success: boolean }>('/notifications', { method: 'DELETE' }),

  // Moderation
  checkText: (text: string, context?: string) =>
    request<{ passed: boolean; level: string; categories: string[]; matchedKeywords: string[] }>(
      '/moderation/check',
      { method: 'POST', body: { text, context } }
    ),
  getModerationStats: () => request<Record<string, number>>('/moderation/stats'),
  getModerationLogs: (limit = 50) =>
    request<{ logs: ModerationLog[]; total: number }>(`/moderation/logs${buildQuery({ limit })}`),

  // Analysis
  analyzeProject: (projectId: string) =>
    request<{ status: string; message: string }>(`/analysis/project/${projectId}`, { method: 'POST', body: {} }),
  getAnalysis: (projectId: string) => request<FilmAnalysis>(`/analysis/project/${projectId}`),

  // Collaboration
  getComments: (projectId: string, shotId?: string) =>
    request<{ total: number; items: CommentItem[] }>(
      `/collab/${projectId}/comments${shotId ? `?shotId=${encodeURIComponent(shotId)}` : ''}`
    ),
  addComment: (
    projectId: string,
    body: { content: string; userName?: string; userId?: string; shotId?: string | null }
  ) => request<CommentItem>(`/collab/${projectId}/comments`, { method: 'POST', body }),
  resolveComment: (projectId: string, commentId: string, resolved: boolean) =>
    request<CommentItem>(`/collab/${projectId}/comments/${commentId}/resolve`, {
      method: 'PATCH',
      body: { resolved },
    }),
  deleteComment: (projectId: string, commentId: string) =>
    request<{ success: boolean }>(`/collab/${projectId}/comments/${commentId}`, { method: 'DELETE' }),
  getCommentStats: (projectId: string) =>
    request<{ total?: number; resolved?: number; open?: number; unresolved?: number }>(
      `/collab/${projectId}/comments/stats`
    ),
  getShareSettings: (projectId: string) =>
    request<ShareSettings>(`/collab/${projectId}/share`),
  getSharedProject: (token: string) =>
    request<{ projectId: string; share: ShareSettings }>(`/collab/shared/${encodeURIComponent(token)}`),
  updateShareSettings: (
    projectId: string,
    body: { isPublic?: boolean; allowComments?: boolean; password?: string | null }
  ) => request<ShareSettings>(`/collab/${projectId}/share`, { method: 'PUT', body }),

  // Versions
  getVersions: (projectId: string) =>
    request<{ total: number; items: ProjectVersion[] }>(`/projects/${projectId}/versions`),
  saveVersion: (projectId: string, body: { label?: string; description?: string }) =>
    request<ProjectVersion>(`/projects/${projectId}/versions`, { method: 'POST', body }),
  rollbackVersion: (projectId: string, versionId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/versions/${versionId}/rollback`, {
      method: 'POST',
      body: {},
    }),
  deleteVersion: (projectId: string, versionId: string) =>
    request<{ success: boolean }>(`/projects/${projectId}/versions/${versionId}`, { method: 'DELETE' }),
  compareVersions: (projectId: string, from: string, to: string) =>
    request<VersionCompare>(
      `/projects/${projectId}/versions/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    ),

  // AI assistant
  getAiQuickActions: () => request<{ actions: AiQuickAction[] }>('/ai-assistant/quick-actions'),
  getAiConversation: (projectId: string) =>
    request<{ conversation: AiMessage[]; total: number }>(`/ai-assistant/conversation/${projectId}`),
  sendAiMessage: (projectId: string, message: string) =>
    request<AiMessage>(`/ai-assistant/chat/${projectId}`, { method: 'POST', body: { message } }),
  runAiQuickAction: (projectId: string, actionId: string) =>
    request<AiMessage>(`/ai-assistant/quick-action/${projectId}`, { method: 'POST', body: { actionId } }),
  clearAiConversation: (projectId: string) =>
    request<{ success: boolean }>(`/ai-assistant/conversation/${projectId}`, { method: 'DELETE' }),

  // Novel theater
  listNovels: () => requestData<NovelProject[]>('/novels'),
  createNovel: (body: { title: string; author?: string; sourceRef?: string; sourceType?: string }) =>
    requestData<NovelProject>('/novels', { method: 'POST', body }),
  deleteNovel: (id: string) =>
    requestData<{ deleted?: boolean }>(`/novels/${id}`, { method: 'DELETE' }),
  getNovel: (id: string) => requestData<NovelDetail>(`/novels/${id}`),
  advanceNovel: (id: string, to?: string) =>
    requestData<{ stage: string }>(`/novels/${id}/advance`, { method: 'POST', body: to ? { to } : {} }),
  ingestNovel: (
    id: string,
    body: { sourceType: 'qishuxia-txt' | 'text'; url?: string; text?: string }
  ) => requestData<NovelIngestResult>(`/novels/${id}/ingest`, { method: 'POST', body }),
  getNovelSchema: (id: string) => requestData<NovelSchema>(`/novels/${id}/schema`),
  listNovelCharacters: (id: string) => requestData<NovelCharacter[]>(`/novels/${id}/characters`),
  listNovelCharacterSets: (id: string) =>
    requestData<NovelCharacterSet[]>(`/novels/${id}/characters/sets`),
  getNovelReviewStats: (id: string) =>
    requestData<{ approved?: number; revisionRate?: number; characters?: number }>(
      `/novels/${id}/review-stats`
    ),
  getNovelExtractStatus: (id: string) => requestData<NovelExtractJobs>(`/novels/${id}/extract/status`),
  extractNovelCharacters: (id: string, body: { provider: string; minFreq?: number }) =>
    requestData<{ provider: string; degraded?: boolean; characters: NovelCharacter[] }>(
      `/novels/${id}/extract`,
      { method: 'POST', body }
    ),
  extractNovelAll: (id: string, body: { provider: string }) =>
    requestData<{ provider: string; degraded?: boolean; characters: NovelCharacter[] }>(
      `/novels/${id}/extract-all`,
      { method: 'POST', body }
    ),
  selectNovelCharacterSet: (id: string, setId: string) =>
    requestData<unknown>(`/novels/${id}/characters/select`, { method: 'POST', body: { setId } }),
  approveNovelCharacter: (id: string, cid: string) =>
    requestData<NovelCharacter>(`/novels/${id}/characters/${cid}/approve`, {
      method: 'POST',
      body: {},
    }),
  listNovelSeasons: (id: string) => requestData<NovelSeason[]>(`/novels/${id}/seasons`),
  getNovelSeriesEstimate: (id: string) =>
    requestData<NovelSeriesEstimate>(`/novels/${id}/series/estimate`),
  planNovelSeries: (id: string, body: Record<string, unknown> = {}) =>
    requestData<NovelSeriesPlanResult>(`/novels/${id}/series/plan`, { method: 'POST', body }),
  generateNovelStyle: (id: string) =>
    requestData<unknown>(`/novels/${id}/style/generate`, { method: 'POST', body: {} }),
  getNovelSyncScopes: (id: string) => requestData<NovelSyncScope[]>(`/novels/${id}/sync/scopes`),
  getNovelManifest: (id: string, scope?: string) =>
    requestData<NovelManifest>(
      `/novels/${id}/manifest${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`
    ),
  getNovelSyncLedger: (id: string) => requestData<NovelSyncLedger>(`/novels/${id}/sync/ledger`),
  syncNovel: (id: string, body: Record<string, unknown>) =>
    requestData<NovelSyncResult>(`/novels/${id}/sync`, { method: 'POST', body }),
  getCloudDriveStatus: (verify = false) =>
    requestData<CloudDriveStatus>(`/cloud-drive/quark/status${verify ? '?verify=1' : ''}`),
  createQuarkQr: () =>
    requestData<QuarkQrSession>('/cloud-drive/quark/qr', { method: 'POST', body: {} }),
  getQuarkQrStatus: (token: string) =>
    requestData<QuarkQrStatus>(`/cloud-drive/quark/qr/${encodeURIComponent(token)}/status`),
  logoutCloudDrive: () =>
    requestData<unknown>('/cloud-drive/quark/logout', { method: 'POST', body: {} }),
  listNovelAssets: (id: string) =>
    requestData<{ assets: NovelAsset[]; stats: NovelAssetStats }>(`/novels/${id}/assets`),
  createNovelAsset: (
    id: string,
    body: { category: NovelAssetCategory; name: string; prompt?: string }
  ) => requestData<NovelAsset>(`/novels/${id}/assets`, { method: 'POST', body }),
  updateNovelAsset: (id: string, aid: string, body: { name?: string; prompt?: string }) =>
    requestData<NovelAsset>(`/novels/${id}/assets/${aid}`, { method: 'PATCH', body }),
  deleteNovelAsset: (id: string, aid: string) =>
    requestData<unknown>(`/novels/${id}/assets/${aid}`, { method: 'DELETE' }),
  generateNovelAsset: (id: string, aid: string) =>
    requestData<NovelAsset>(`/novels/${id}/assets/${aid}/generate`, { method: 'POST', body: {} }),
  bulkGenerateNovelAssets: (
    id: string,
    body: { categories?: string[]; onlyMissing?: boolean; limit?: number; concurrency?: number; reset?: boolean }
  ) => requestData<NovelAssetBulkResult>(`/novels/${id}/assets/bulk-generate`, { method: 'POST', body }),
  cancelNovelAssetBulk: (id: string) =>
    requestData<{ cancelled: boolean }>(`/novels/${id}/assets/bulk-cancel`, { method: 'POST', body: {} }),
  suggestNovelAssets: (id: string) =>
    requestData<{ created: number }>(`/novels/${id}/assets/suggest`, { method: 'POST', body: {} }),
  listNovelEpisodes: (id: string, seasonId?: string) =>
    requestData<NovelEpisode[]>(
      `/novels/${id}/episodes${seasonId ? `?seasonId=${encodeURIComponent(seasonId)}` : ''}`
    ),
  getSeasonAssetSubset: (id: string, seasonId: string) =>
    requestData<NovelSeasonAssetSubset>(`/novels/${id}/seasons/${seasonId}/assets`),
  bulkGenerateSeason: (id: string, seasonId: string, body: Record<string, unknown>) =>
    requestData<NovelBulkResult>(`/novels/${id}/seasons/${seasonId}/bulk`, { method: 'POST', body }),
  bulkGenerateSeasonAssets: (id: string, seasonId: string, body: Record<string, unknown>) =>
    requestData<NovelSeasonAssetSubset & { processed: number; ok: number; failed: number }>(
      `/novels/${id}/seasons/${seasonId}/assets/bulk-generate`,
      { method: 'POST', body }
    ),
  generateEpisodeScript: (id: string, eid: string, body: Record<string, unknown> = {}) =>
    requestData<NovelEpisode>(`/novels/${id}/episodes/${eid}/script`, { method: 'POST', body }),
  generateEpisodeAssets: (id: string, eid: string, body: Record<string, unknown> = {}) =>
    requestData<{ episodeId: string; status?: string; assets?: NovelEpisodeAssets }>(
      `/novels/${id}/episodes/${eid}/assets`,
      { method: 'POST', body }
    ),
  composeEpisode: (id: string, eid: string, body: Record<string, unknown> = {}) =>
    requestData<{ fileName?: string; [key: string]: unknown }>(
      `/novels/${id}/episodes/${eid}/compose`,
      { method: 'POST', body }
    ),
  exportEpisodeHandoff: (id: string, eid: string) =>
    requestData<{ dir?: string; [key: string]: unknown }>(`/novels/${id}/episodes/${eid}/handoff`, {
      method: 'POST',
      body: {},
    }),
  getNovelWorld: (id: string) => requestData<NovelWorldSummary>(`/novels/${id}/world`),
  listNovelWorldEntities: (id: string, type?: string) =>
    requestData<NovelWorldEntity[]>(`/novels/${id}/world/entities${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  listNovelWorldRelations: (id: string) =>
    requestData<NovelWorldRelation[]>(`/novels/${id}/world/relations`),
  listNovelWorldSets: (id: string) => requestData<NovelWorldSet[]>(`/novels/${id}/world/sets`),
  selectNovelWorldSet: (id: string, setId: string) =>
    requestData<unknown>(`/novels/${id}/world/select`, { method: 'POST', body: { setId } }),
  extractNovelWorld: (id: string, body: { provider: string }) =>
    requestData<{ provider: string; degraded?: boolean; entities: number; summary: NovelWorldSummary }>(
      `/novels/${id}/world/extract`,
      { method: 'POST', body }
    ),
  patchNovelCharacter: (
    id: string,
    cid: string,
    patch: { name?: string; card?: Record<string, string> }
  ) =>
    requestData<NovelCharacter>(`/novels/${id}/characters/${cid}`, {
      method: 'PATCH',
      body: patch,
    }),

  // Settings & system
  getSystemInfo: () => request<SystemInfo>('/system/info'),
  getProviderStatus: () => request<ProviderStatus>('/providers/status'),
  getNotificationPreferences: () =>
    request<{ preferences: NotificationPreferences }>('/notifications/preferences'),
  updateNotificationPreferences: (updates: NotificationPreferences) =>
    request<{ preferences: NotificationPreferences }>('/notifications/preferences', {
      method: 'PATCH',
      body: updates,
    }),
  getPlans: () => request<{ plans: SubscriptionPlan[] }>('/subscription/plans'),
  getCurrentSubscription: () => request<SubscriptionFeatures>('/subscription/current'),
  getPerformance: () => request<Record<string, unknown>>('/system/performance'),
}

export function hasToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY))
}
