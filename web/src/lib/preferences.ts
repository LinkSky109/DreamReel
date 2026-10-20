export type WorkspacePreferences = {
  workspaceName: string
  workspaceSlug: string
  defaultAspect: '16:9' | '9:16'
  autosave: boolean
  defaultStyle: string
  defaultVoice: string
  lockCharacters: boolean
  subtitles: boolean
}

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  workspaceName: '我的工作区',
  workspaceSlug: 'studio',
  defaultAspect: '16:9',
  autosave: true,
  defaultStyle: 'none',
  defaultVoice: '',
  lockCharacters: true,
  subtitles: true,
}

const KEY = 'dreamreel_workspace_settings'

export function readWorkspacePreferences(): WorkspacePreferences {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_WORKSPACE_PREFERENCES }
    const parsed = JSON.parse(raw) as Partial<WorkspacePreferences>
    return {
      ...DEFAULT_WORKSPACE_PREFERENCES,
      ...parsed,
      defaultAspect: parsed.defaultAspect === '9:16' ? '9:16' : '16:9',
    }
  } catch {
    return { ...DEFAULT_WORKSPACE_PREFERENCES }
  }
}

export function saveWorkspacePreferences(preferences: WorkspacePreferences): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(preferences))
  } catch {
    // 隐私模式下忽略
  }
}
