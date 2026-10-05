/**
 * 主题管理
 * 支持暗色/亮色主题切换，偏好持久化到 localStorage
 */

const THEME_KEY = 'dreamreel-theme'
const DEFAULT_THEME = 'dark'

/**
 * 获取当前主题
 */
export function getCurrentTheme() {
  return localStorage.getItem(THEME_KEY) || DEFAULT_THEME
}

/**
 * 设置主题
 */
export function setTheme(theme) {
  if (theme === 'light') {
    document.body.classList.add('light-theme')
  } else {
    document.body.classList.remove('light-theme')
  }
  localStorage.setItem(THEME_KEY, theme)

  // 触发主题变更事件
  document.dispatchEvent(new CustomEvent('theme-change', { detail: { theme } }))
}

/**
 * 切换主题
 */
export function toggleTheme() {
  const current = getCurrentTheme()
  const next = current === 'dark' ? 'light' : 'dark'
  setTheme(next)
  return next
}

/**
 * 初始化主题（页面加载时调用）
 */
export function initTheme() {
  const savedTheme = getCurrentTheme()

  // 如果没有保存的主题，检查系统偏好
  if (!localStorage.getItem(THEME_KEY)) {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    if (prefersLight) {
      setTheme('light')
      return
    }
  }

  setTheme(savedTheme)
}

/**
 * 获取主题图标
 */
export function getThemeIcon(theme) {
  return theme === 'light' ? '🌙' : '☀️'
}

/**
 * 获取主题名称
 */
export function getThemeName(theme) {
  return theme === 'light' ? '亮色' : '暗色'
}
