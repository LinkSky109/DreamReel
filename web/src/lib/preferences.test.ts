import { beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  readWorkspacePreferences,
  saveWorkspacePreferences,
} from './preferences'

describe('workspace preferences', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('默认值', () => {
    expect(readWorkspacePreferences()).toEqual(DEFAULT_WORKSPACE_PREFERENCES)
  })

  it('保存后可读回', () => {
    saveWorkspacePreferences({
      ...DEFAULT_WORKSPACE_PREFERENCES,
      workspaceName: '火星工作室',
      defaultAspect: '9:16',
      defaultVoice: 'zh_male_calm',
    })
    const prefs = readWorkspacePreferences()
    expect(prefs.workspaceName).toBe('火星工作室')
    expect(prefs.defaultAspect).toBe('9:16')
    expect(prefs.defaultVoice).toBe('zh_male_calm')
  })

  it('非法画幅回退到 16:9', () => {
    localStorage.setItem(
      'dreamreel_workspace_settings',
      JSON.stringify({ ...DEFAULT_WORKSPACE_PREFERENCES, defaultAspect: '4:3' })
    )
    expect(readWorkspacePreferences().defaultAspect).toBe('16:9')
  })

  it('损坏 JSON 回退到默认值', () => {
    localStorage.setItem('dreamreel_workspace_settings', '{not-json')
    expect(readWorkspacePreferences()).toEqual(DEFAULT_WORKSPACE_PREFERENCES)
  })
})
