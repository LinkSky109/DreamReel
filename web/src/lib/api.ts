import type {
  BgmItem,
  Character,
  CurrentUser,
  DubbingResult,
  EditPlan,
  EditProfile,
  EditRenderResult,
  ImageAsset,
  ImageProviderInfo,
  ModerationLog,
  NotificationItem,
  Project,
  ProjectListResponse,
  ProjectScript,
  SceneItem,
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
    request<{ items: BgmItem[] }>(`/audio/bgm${buildQuery(params)}`),

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

  // System
  getSystemInfo: () =>
    request<{ llm?: { provider?: string }; video?: { provider?: string }; tts?: { provider?: string } }>(
      '/system/info'
    ),
}

export function hasToken(): boolean {
  return Boolean(localStorage.getItem(TOKEN_KEY))
}
