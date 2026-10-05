/**
 * DreamReel App — 主应用入口
 * Hash-based SPA 路由
 */

import { renderProjectList } from './views/projectList.js'
import { renderEditor } from './views/editor.js'
import { renderAuthPage, getCurrentUser, isLoggedIn, logout } from './views/auth.js'
import { renderPricingPage } from './views/pricing.js'
import { renderStatsPage } from './views/stats.js'
import { renderSettingsPage } from './views/settings.js'
import { renderTemplateMarket } from './views/templateMarket.js'
import { renderRecycleBin } from './views/recycleBin.js'
import { renderCreatorPage } from './views/creator.js'
import { renderGalleryPage } from './views/gallery.js'
import { renderChallengesPage } from './views/challenges.js'
import { renderTeamsPage } from './views/teams.js'
import { renderApiConsole } from './views/apiConsole.js'
import { renderStorePage } from './views/store.js'
import { renderEnterprise } from './views/enterprise.js'
import { renderTitleSequencesPage } from './views/titleSequences.js'
import { renderDirectorsPage } from './views/directors.js'
import { renderStudiosPage } from './views/studios.js'
import { initKeyboardShortcuts, toggleHelpModal } from './keyboard.js'
import { initTheme, toggleTheme, getCurrentTheme, getThemeIcon } from './theme.js'
import { i18n } from './i18n.js'
import { api } from './api.js'

const app = document.getElementById('app')

// 简单的全局状态
export const state = {
  currentProject: null,
  voices: [],
  userId: 'default',
}

// 加载并显示额度
export async function refreshQuota() {
  try {
    const quota = await api.getQuota('me')
    const remaining = quota.video.daily.remaining
    const limit = quota.video.daily.limit
    const text = document.getElementById('quotaText')
    const badge = document.getElementById('quotaBadge')
    if (text) {
      text.textContent = `${remaining}/${limit}`
    }
    if (badge) {
      badge.classList.toggle('low', remaining <= 1)
      badge.title = `今日剩余视频生成 ${remaining} 次，每日重置`
    }
  } catch (e) {
    // 静默失败
  }
}

// 更新头部用户信息
export function updateHeaderUser() {
  const user = getCurrentUser()
  const userInfo = document.getElementById('userInfo')
  const loginBtn = document.getElementById('loginBtn')
  const upgradeBtn = document.getElementById('upgradeBtn')
  if (userInfo) {
    if (user) {
      userInfo.style.display = 'flex'
      userInfo.querySelector('.user-name').textContent = user.username
    } else {
      userInfo.style.display = 'none'
    }
  }
  if (loginBtn) {
    loginBtn.style.display = user ? 'none' : 'block'
  }
  if (upgradeBtn) {
    upgradeBtn.style.display = user ? 'block' : 'none'
  }
}

// Toast 通知
export function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer')
  const toast = document.createElement('div')
  toast.className = `toast toast-${type}`
  toast.textContent = message
  container.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transition = 'opacity 0.3s'
    setTimeout(() => toast.remove(), 300)
  }, 3000)
}

// 路由
function router() {
  const hash = location.hash.slice(1).replace(/^\//, '')
  const [path, param] = hash.split('/')

  if (path === 'login') {
    renderAuthPage(app)
  } else if (path === 'logout') {
    logout()
  } else if (path === 'pricing') {
    renderPricingPage(app)
  } else if (path === 'stats') {
    renderStatsPage(app)
  } else if (path === 'settings') {
    renderSettingsPage(app)
  } else if (path === 'templates') {
    renderTemplateMarket(app)
  } else if (path === 'recycle-bin') {
    renderRecycleBin(app)
  } else if (path === 'gallery') {
    renderGalleryPage(app)
  } else if (path === 'challenges') {
    renderChallengesPage(app)
  } else if (path === 'teams') {
    renderTeamsPage(app)
  } else if (path === 'team' && param) {
    renderTeamsPage(app, param)
  } else if (path === 'api-console' || path === 'developer') {
    renderApiConsole(app)
  } else if (path === 'store' || path === 'marketplace') {
    renderStorePage(app)
  } else if (path === 'enterprise' || path === 'admin') {
    renderEnterprise(app)
  } else if (path === 'creator' && param) {
    renderCreatorPage(app, param)
  } else if (path === 'title-sequences') {
    renderTitleSequencesPage(app)
  } else if (path === 'directors') {
    renderDirectorsPage(app)
  } else if (path === 'studios') {
    renderStudiosPage(app)
  } else if (path === 'studio' && param) {
    renderStudiosPage(app, param)
  } else if (path === 'project' && param) {
    if (param === 'new') {
      // 新建项目：直接渲染项目列表并触发创建弹窗
      renderProjectList(app, { openCreate: true })
    } else {
      renderEditor(app, param)
    }
  } else {
    renderProjectList(app)
  }
  updateHeaderUser()
  updateSidebarActive()
}

// 侧边栏导航高亮
function updateSidebarActive() {
  const hash = location.hash.slice(1).replace(/^\//, '')
  const [path] = hash.split('/')

  document.querySelectorAll('.sidebar-link').forEach((link) => {
    const route = link.dataset.route || ''
    const isActive = route === hash || (route && hash.startsWith(route + '/'))
    link.classList.toggle('active', isActive)
  })
}

// 移动端侧边栏开关
function toggleSidebar() {
  const sidebar = document.getElementById('appSidebar')
  const overlay = document.getElementById('sidebarOverlay')
  sidebar.classList.toggle('open')
  overlay.classList.toggle('open')
}

window.addEventListener('hashchange', router)

// ========== 通知管理 ==========
let notificationPollTimer = null
let currentNotificationFilter = 'all'

// 通知类型分组
const NOTIFICATION_TYPE_GROUPS = {
  video: ['video_completed', 'video_failed', 'export_completed', 'export_failed'],
  comment: ['mention', 'comment_reply', 'collaboration'],
  system: ['script_completed', 'analysis_completed', 'system'],
}

export async function refreshNotifications() {
  try {
    const result = await api.listNotifications({ limit: 50 })
    const badge = document.getElementById('notificationBadge')
    const list = document.getElementById('notificationList')

    if (badge) {
      if (result.unreadCount > 0) {
        badge.style.display = 'flex'
        badge.textContent = result.unreadCount > 99 ? '99+' : result.unreadCount
      } else {
        badge.style.display = 'none'
      }
    }

    if (list) {
      // 客户端筛选
      let filteredItems = result.items
      if (currentNotificationFilter === 'unread') {
        filteredItems = filteredItems.filter((n) => !n.read)
      } else if (NOTIFICATION_TYPE_GROUPS[currentNotificationFilter]) {
        const groupTypes = NOTIFICATION_TYPE_GROUPS[currentNotificationFilter]
        filteredItems = filteredItems.filter((n) => groupTypes.includes(n.type))
      }

      if (filteredItems.length === 0) {
        const filterLabels = { all: '暂无通知', unread: '暂无未读通知', video: '暂无视频相关通知', comment: '暂无评论相关通知', system: '暂无系统通知' }
        list.innerHTML = `<div class="notification-empty">${filterLabels[currentNotificationFilter] || '暂无通知'}</div>`
      } else {
        list.innerHTML = filteredItems.map((n) => `
          <div class="notification-item ${n.read ? '' : 'unread'}" data-id="${n.id}" data-project-id="${n.projectId || ''}" data-type="${n.type || ''}" data-comment-id="${n.data?.commentId || ''}">
            <div class="notification-icon">${n.icon || '🔔'}</div>
            <div class="notification-content">
              <div class="notification-title">${escapeHtml(n.title)}</div>
              <div class="notification-message">${escapeHtml(n.message)}</div>
              <div class="notification-time">${formatTime(n.createdAt)}</div>
            </div>
          </div>
        `).join('')

        // 点击通知标记已读并跳转
        list.querySelectorAll('.notification-item').forEach((item) => {
          item.addEventListener('click', async () => {
            const id = item.dataset.id
            const projectId = item.dataset.projectId
            const type = item.dataset.type
            try {
              await api.markNotificationRead(id)
            } catch (e) {}
            if (projectId) {
              location.hash = `#/editor/${projectId}`
              // 根据通知类型切换到对应标签页
              const tabMap = {
                video_completed: 'editor-tab-shots',
                video_failed: 'editor-tab-shots',
                script_completed: 'editor-tab-script',
                analysis_completed: 'editor-tab-analysis',
                mention: 'editor-tab-collab',
                comment_reply: 'editor-tab-collab',
                collaboration: 'editor-tab-collab',
                export_completed: 'editor-tab-shots',
                export_failed: 'editor-tab-shots',
              }
              const tabEvent = tabMap[type]
              if (tabEvent) {
                // 延迟发送事件，等待编辑器加载完成
                setTimeout(() => {
                  document.dispatchEvent(new CustomEvent(tabEvent))
                }, 300)
              }
            }
            closeNotificationPanel()
            refreshNotifications()
          })
        })
      }
    }
  } catch (e) {
    // 静默失败
  }
}

function openNotificationPanel() {
  const panel = document.getElementById('notificationPanel')
  if (panel) panel.style.display = 'flex'
  refreshNotifications()
}

function closeNotificationPanel() {
  const panel = document.getElementById('notificationPanel')
  if (panel) panel.style.display = 'none'
}

function formatTime(isoString) {
  const date = new Date(isoString)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return date.toLocaleDateString('zh-CN')
}

function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

// 启动通知轮询（每 30 秒）
function startNotificationPolling() {
  if (notificationPollTimer) clearInterval(notificationPollTimer)
  refreshNotifications()
  notificationPollTimer = setInterval(refreshNotifications, 30000)
}

window.addEventListener('DOMContentLoaded', () => {
  // 先初始化主题，避免闪烁
  initTheme()
  updateThemeButton()

  router()
  refreshQuota()
  initKeyboardShortcuts()
  startNotificationPolling()

  // 侧边栏开关（移动端）
  const sidebarToggle = document.getElementById('sidebarToggle')
  const sidebarOverlay = document.getElementById('sidebarOverlay')
  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar)
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', toggleSidebar)
  }

  // 通知铃铛
  const notificationBell = document.getElementById('notificationBell')
  const notificationPanel = document.getElementById('notificationPanel')
  if (notificationBell) {
    notificationBell.addEventListener('click', (e) => {
      e.stopPropagation()
      if (notificationPanel.style.display === 'none' || !notificationPanel.style.display) {
        openNotificationPanel()
      } else {
        closeNotificationPanel()
      }
    })
  }

  // 点击外部关闭通知面板
  document.addEventListener('click', (e) => {
    if (notificationPanel && !notificationPanel.contains(e.target) && e.target !== notificationBell) {
      closeNotificationPanel()
    }
  })

  // 全部已读
  const markAllReadBtn = document.getElementById('markAllReadBtn')
  if (markAllReadBtn) {
    markAllReadBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      try {
        await api.markAllNotificationsRead()
        refreshNotifications()
      } catch (err) {}
    })
  }

  // 清空通知
  const clearNotificationsBtn = document.getElementById('clearNotificationsBtn')
  if (clearNotificationsBtn) {
    clearNotificationsBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (confirm('确定要清空所有通知吗？此操作不可撤销。')) {
        try {
          await api.clearNotifications()
          refreshNotifications()
        } catch (err) {}
      }
    })
  }

  // 通知类型筛选
  const filterBtns = document.querySelectorAll('.notification-filter-btn')
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      filterBtns.forEach((b) => b.classList.remove('active'))
      btn.classList.add('active')
      currentNotificationFilter = btn.dataset.filter
      refreshNotifications()
    })
  })

  // 键盘提示点击
  const keyboardHint = document.getElementById('keyboardHint')
  if (keyboardHint) {
    keyboardHint.addEventListener('click', toggleHelpModal)
  }

  // 主题切换
  const themeToggleBtn = document.getElementById('themeToggleBtn')
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      toggleTheme()
      updateThemeButton()
    })
  }

  // 监听主题变更
  document.addEventListener('theme-change', () => {
    updateThemeButton()
  })

  // 语言切换
  const langToggleBtn = document.getElementById('langToggleBtn')
  if (langToggleBtn) {
    updateLangButton()
    langToggleBtn.addEventListener('click', () => {
      const currentLang = i18n.getLanguage()
      const newLang = currentLang === 'zh' ? 'en' : 'zh'
      i18n.setLanguage(newLang)
      updateLangButton()
      // 重新渲染当前页面
      router()
    })
  }
})

function updateLangButton() {
  const btn = document.getElementById('langToggleBtn')
  if (btn) {
    const lang = i18n.getLanguage()
    btn.textContent = lang === 'zh' ? '🌐 中' : '🌐 EN'
    btn.title = lang === 'zh' ? 'Switch to English' : '切换到中文'
  }
}

function updateThemeButton() {
  const btn = document.getElementById('themeToggleBtn')
  if (btn) {
    const theme = getCurrentTheme()
    btn.textContent = getThemeIcon(theme)
    btn.title = theme === 'light' ? '切换到暗色' : '切换到亮色'
  }
}

// 如果没有 hash，触发默认路由
if (!location.hash) {
  router()
}
refreshQuota()
