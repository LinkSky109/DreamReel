import type {
  CurrentUser,
  ModerationLog,
  NotificationItem,
  Project,
  ProjectListResponse,
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
