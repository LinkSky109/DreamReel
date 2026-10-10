import { api } from '../api.js'
import { showToast } from '../app.js'

export async function renderRecycleBin(container) {
  try {
    const [data] = await Promise.all([
      api.getRecycleBin({ limit: 50 }),
      api.getRecycleBinStats(),
    ])

    const items = data.items || []
    const total = data.total || 0

    container.innerHTML = `
      <div class="recycle-bin-page">
        <div class="page-header">
          <div>
            <h1 class="page-title">🗑️ 回收站</h1>
            <p class="page-subtitle">已删除的项目会保留在这里，可恢复或永久删除</p>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span style="color: var(--text-muted); font-size: 13px;">共 ${total} 个项目</span>
            ${total > 0 ? `<button class="btn btn-danger btn-sm" id="emptyRecycleBinBtn">清空回收站</button>` : ''}
            <a href="#/" class="btn btn-sm">← 返回项目</a>
          </div>
        </div>

        ${total === 0 ? `
          <div class="empty-state" style="padding: 80px 20px;">
            <div class="empty-state-icon" style="font-size: 64px;">🗑️</div>
            <div class="empty-state-text" style="font-size: 16px; margin-top: 16px;">回收站是空的</div>
            <div class="empty-state-text" style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">删除的项目会出现在这里，可随时恢复</div>
            <a href="#/" class="btn btn-primary" style="margin-top: 24px;">去创建项目</a>
          </div>
        ` : `
          <div class="recycle-bin-list">
            ${items.map((item) => renderRecycleItem(item)).join('')}
          </div>
        `}
      </div>
    `

    // 绑定事件
    bindRecycleBinEvents(container)
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">加载失败: ${err.message}</div>
        <button class="btn" onclick="location.reload()">重试</button>
      </div>
    `
  }
}

function renderRecycleItem(item) {
  const deletedDate = item.deletedAt ? new Date(item.deletedAt) : null
  const timeAgo = deletedDate ? getTimeAgo(deletedDate) : '未知时间'

  return `
    <div class="recycle-item" data-project-id="${item.id}">
      <div class="recycle-item-icon">
        ${item.coverUrl ? `<img src="${item.coverUrl}" alt="" />` : `<span>🎬</span>`}
      </div>
      <div class="recycle-item-info">
        <h3 class="recycle-item-name">${escapeHtml(item.name)}</h3>
        <p class="recycle-item-desc">${escapeHtml(item.description || '暂无描述')}</p>
        <div class="recycle-item-meta">
          <span>🗑️ 删除于 ${timeAgo}</span>
          ${item.targetDuration ? `<span>⏱️ ${item.targetDuration}秒</span>` : ''}
          ${item.style ? `<span>🎨 ${item.style}</span>` : ''}
          ${item.shots && item.shots.length > 0 ? `<span>🎬 ${item.shots.length} 镜头</span>` : ''}
        </div>
      </div>
      <div class="recycle-item-actions">
        <button class="btn btn-primary btn-sm recycle-restore-btn" data-project-id="${item.id}">↩️ 恢复</button>
        <button class="btn btn-danger btn-sm recycle-delete-btn" data-project-id="${item.id}">永久删除</button>
      </div>
    </div>
  `
}

function bindRecycleBinEvents(container) {
  // 恢复项目
  container.querySelectorAll('.recycle-restore-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const projectId = btn.dataset.projectId
      try {
        await api.restoreFromRecycleBin(projectId)
        showToast('项目已恢复', 'success')
        renderRecycleBin(container)
      } catch (err) {
        showToast(`恢复失败: ${err.message}`, 'error')
      }
    })
  })

  // 永久删除
  container.querySelectorAll('.recycle-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const projectId = btn.dataset.projectId
      if (confirm('确定要永久删除这个项目吗？此操作不可撤销！')) {
        try {
          await api.permanentlyDeleteProject(projectId)
          showToast('项目已永久删除', 'success')
          renderRecycleBin(container)
        } catch (err) {
          showToast(`删除失败: ${err.message}`, 'error')
        }
      }
    })
  })

  // 清空回收站
  const emptyBtn = document.getElementById('emptyRecycleBinBtn')
  if (emptyBtn) {
    emptyBtn.addEventListener('click', async () => {
      if (confirm('确定要清空回收站吗？所有项目将被永久删除，此操作不可撤销！')) {
        try {
          const result = await api.emptyRecycleBin()
          showToast(`已清空 ${result.deletedCount} 个项目`, 'success')
          renderRecycleBin(container)
        } catch (err) {
          showToast(`清空失败: ${err.message}`, 'error')
        }
      }
    })
  }
}

function getTimeAgo(date) {
  const now = new Date()
  const diff = now - date
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}天前`
  if (hours > 0) return `${hours}小时前`
  if (minutes > 0) return `${minutes}分钟前`
  return '刚刚'
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
