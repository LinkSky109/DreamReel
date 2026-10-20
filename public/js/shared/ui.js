/**
 * 共享 UI 辅助（供 legacy 页面桥接使用）
 * React Shell 不依赖本模块；这里只保留 legacy 视图需要的 Toast 与额度刷新。
 */
import { api } from '../api.js'

export async function refreshQuota() {
  try {
    const quota = await api.getQuota('me')
    const remaining = quota.video.daily.remaining
    const limit = quota.video.daily.limit
    const text = document.getElementById('quotaText')
    const badge = document.getElementById('quotaBadge')
    if (text) text.textContent = `${remaining}/${limit}`
    if (badge) {
      badge.classList.toggle('low', remaining <= 1)
      badge.title = `今日剩余视频生成 ${remaining} 次，每日重置`
    }
  } catch {
    // 静默失败
  }
}

export function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer')
  if (!container) return
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
