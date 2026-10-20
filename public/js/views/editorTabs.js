/**
 * R31：五合一创作画布 tab 契约
 * 一级入口固定为 5 个；配置型功能收纳到“更多工具”。
 */

export const PRIMARY_TABS = [
  { id: 'script', label: '剧本', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-file-text"></use></svg>' },
  { id: 'shots', label: '分镜', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-film"></use></svg>' },
  { id: 'generate', label: '生成', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-sparkles"></use></svg>' },
  { id: 'dubbing', label: '配音', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-message"></use></svg>' },
  { id: 'edit', label: '剪辑', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-clapper"></use></svg>' },
]

export const MORE_TOOLS = [
  { id: 'images', label: '图片', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-template"></use></svg>' },
  { id: 'characters', label: '角色', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-user"></use></svg>' },
  { id: 'scenes', label: '场景库', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-compass"></use></svg>' },
  { id: 'analysis', label: 'AI 影评', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-chart"></use></svg>' },
  { id: 'collab', label: '协作', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-users"></use></svg>' },
  { id: 'versions', label: '版本', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-file-text"></use></svg>' },
  { id: 'settings', label: '项目设置', icon: '<svg width="16" height="16" aria-hidden="true"><use href="/icons/sprite.svg#i-settings"></use></svg>' },
]

const ALIASES = {
  video: 'shots',
  audio: 'dubbing',
  editing: 'edit',
  'smart-edit': 'edit',
  smartEdit: 'edit',
  generation: 'generate',
  render: 'generate',
}

const VALID_TABS = new Set([...PRIMARY_TABS, ...MORE_TOOLS].map((tab) => tab.id))
const LAST_TAB_KEY = 'dreamreel_last_editor_tab'
const PUBLIC_IDS = {
  shots: 'video',
  dubbing: 'audio',
}

export function normalizeTab(tabId) {
  if (!tabId) return 'script'
  const normalized = ALIASES[tabId] || tabId
  return VALID_TABS.has(normalized) ? normalized : 'script'
}

export function getTabFromUrl() {
  if (typeof window === 'undefined' || !window.location) return null
  const hash = window.location.hash || ''
  const query = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : ''
  const tab = new URLSearchParams(query).get('tab')
  return tab ? normalizeTab(tab) : null
}

export function getLastTab() {
  try {
    return normalizeTab(window.localStorage.getItem(LAST_TAB_KEY))
  } catch {
    return 'script'
  }
}

export function rememberTab(tabId) {
  try {
    window.localStorage.setItem(LAST_TAB_KEY, normalizeTab(tabId))
  } catch {
    // ignore storage failures
  }
}

export function setTabInUrl(tabId) {
  if (typeof window === 'undefined' || !window.location || !window.history) return
  const normalized = normalizeTab(tabId)
  const publicId = PUBLIC_IDS[normalized] || normalized
  const base = window.location.hash.split('?')[0] || ''
  const nextHash = `${base}?tab=${publicId}`
  window.history.replaceState(null, '', nextHash)
}

export function resolveInitialTab() {
  return getTabFromUrl() || getLastTab() || 'script'
}

export function renderTabNav(i18n) {
  const primary = PRIMARY_TABS.map((tab) => {
    const label = tab.label || (i18n ? i18n.t(`editorTabs.${tab.labelKey}`) : tab.labelKey)
    return `
      <div class="editor-nav-item" data-tab="${tab.id}">
        <span>${tab.icon}</span> ${label}
      </div>
    `
  }).join('')

  const more = MORE_TOOLS.map((tool) => {
    const label = tool.label || (i18n ? i18n.t(`editorTabs.${tool.labelKey}`) : tool.labelKey)
    return `
      <div class="editor-nav-item editor-nav-item-secondary" data-tab="${tool.id}">
        <span>${tool.icon}</span> ${label}
      </div>
    `
  }).join('')

  return `
    ${primary}
    <div class="editor-nav-divider"></div>
    <div class="editor-nav-group-title">更多工具</div>
    ${more}
  `
}
