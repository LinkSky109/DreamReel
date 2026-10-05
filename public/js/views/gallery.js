import { api } from '../api.js'
import { showToast } from '../app.js'

/**
 * R09：作品广场（UI v2 — 横向滚动 tab + 创作者徽章 + 复刻入口）
 */
export async function renderGalleryPage(container) {
  container.innerHTML = '<div class="loading"></div>'

  let category = 'all'
  let sort = 'latest'

  async function load() {
    const data = await api.listGallery({ category, sort })
    return { data }
  }

  try {
    const { data } = await load()
    const categories = [
      { id: 'all', name: '全部' },
      { id: 'short', name: '故事短片' },
      { id: 'ad', name: '产品广告' },
      { id: 'vlog', name: '旅行 Vlog' },
      { id: 'knowledge', name: '知识科普' },
      { id: 'music', name: '音乐' },
      { id: 'promo', name: '社媒推广' },
    ]

    container.innerHTML = `
      <div style="max-width:1200px;margin:0 auto;padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:20px;">
          <h2 style="font-size:22px;font-weight:700;">🎬 作品广场</h2>
          <select class="form-control" id="gallerySort" style="width:auto;padding:6px 12px;border-radius:8px;background:var(--bg-secondary);border:1px solid var(--border);color:var(--text-primary);">
            <option value="latest">最新发布</option>
            <option value="popular">最多点赞</option>
          </select>
        </div>

        <!-- 横向滚动分类 tab -->
        <div class="gallery-tabs-scroll" id="galleryTabs">
          ${categories.map((c) => `
            <button class="gallery-tab ${c.id === category ? 'active' : ''}" data-cat="${c.id}">${c.name}</button>
          `).join('')}
        </div>

        <div id="galleryGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:18px;">
          ${renderGrid(data.items)}
        </div>
      </div>
    `

    document.getElementById('gallerySort').value = sort
    document.getElementById('gallerySort').addEventListener('change', async (e) => {
      sort = e.target.value
      const d = await api.listGallery({ category, sort })
      document.getElementById('galleryGrid').innerHTML = renderGrid(d.items)
      bindCardActions(container)
    })

    document.querySelectorAll('.gallery-tab').forEach((btn) => {
      btn.addEventListener('click', async () => {
        category = btn.dataset.cat
        document.querySelectorAll('.gallery-tab').forEach((b) => {
          b.classList.toggle('active', b.dataset.cat === category)
        })
        const d = await api.listGallery({ category, sort })
        document.getElementById('galleryGrid').innerHTML = renderGrid(d.items)
        bindCardActions(container)
      })
    })

    bindCardActions(container)
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${error.message}</div></div>`
  }
}

function renderGrid(items) {
  if (!items.length) {
    return '<div style="grid-column:1/-1;color:var(--text-secondary);padding:40px;text-align:center;">广场还没有作品，去发布你的第一部作品吧</div>'
  }

  // Mock 创作者等级映射（实际应由后端提供）
  const levelMap = {}
  items.forEach((w, i) => {
    const hash = (w.authorId || 'user').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const levels = [null, 'pioneer', 'pro', 'honor']
    levelMap[w.authorId || 'user'] = levels[hash % 4]
  })

  return items.map((w) => {
    const level = levelMap[w.authorId || 'user']
    const badgeHtml = level
      ? `<span class="creator-badge creator-badge-${level}">${level === 'pioneer' ? '先锋' : level === 'pro' ? '专业' : '荣誉'}</span>`
      : ''

    return `
    <div class="card gallery-card" data-id="${w.id}" style="overflow:hidden;cursor:pointer;border-radius:var(--radius-lg);">
      <div style="position:relative;height:150px;background:linear-gradient(135deg,#0f172a,#334155) center/cover ${w.previewUrl ? `url(${w.previewUrl})` : ''};border-radius:var(--radius-lg) var(--radius-lg) 0 0;overflow:hidden;">
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);transition:background 0.2s;" class="gallery-card-overlay">
          <span style="font-size:36px;opacity:0.9;">▶️</span>
        </div>
      </div>
      <div style="padding:14px;">
        <div class="gallery-card-author-row">
          <div class="gallery-card-author-avatar">👤</div>
          <span class="gallery-card-author-name">${w.authorId || '创作者'}</span>
          ${badgeHtml}
        </div>
        <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:4px;">${w.name}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.description || ''}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <span class="gallery-remix" data-id="${w.id}" style="cursor:pointer;font-size:12px;padding:4px 10px;border-radius:12px;background:var(--bg-tertiary);border:1px solid var(--border);transition:all 0.15s;" title="一键复刻为我的项目">🔄 复刻</span>
          <div style="display:flex;gap:10px;font-size:12px;color:var(--text-muted);align-items:center;">
            <span class="gallery-like" data-id="${w.id}" style="cursor:pointer;transition:color 0.15s;">❤️ ${w.likeCount}</span>
            <span>👁️ ${w.viewCount}</span>
          </div>
        </div>
      </div>
    </div>
  `}).join('')
}

function bindCardActions(container) {
  container.querySelectorAll('.gallery-card').forEach((card) => {
    card.addEventListener('click', async (e) => {
      if (e.target.closest('.gallery-like') || e.target.closest('.gallery-author') || e.target.closest('.gallery-remix')) return
      await api.recordGalleryView(card.dataset.id).catch(() => {})
      location.hash = `#/project/${card.dataset.id}`
    })
  })
  container.querySelectorAll('.gallery-like').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      const r = await api.likeGalleryWork(el.dataset.id)
      showToast(r.liked ? '已点赞' : '已取消')
      const d = await api.listGallery({ category: 'all' })
      container.querySelector('#galleryGrid').innerHTML = renderGrid(d.items)
      bindCardActions(container)
    })
  })
  // R25: 一键复刻
  container.querySelectorAll('.gallery-remix').forEach((el) => {
    el.addEventListener('click', async (e) => {
      e.stopPropagation()
      try {
        const r = await fetch(`/api/gallery/${el.dataset.id}/remix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }).then((x) => x.json())
        if (r.success) {
          showToast(`已复刻为「${r.sourceName}」（${r.copiedShots} 个镜头）`)
          setTimeout(() => { location.hash = `#/project/${r.remixId}` }, 800)
        } else {
          showToast(r.error || '复刻失败')
        }
      } catch (err) {
        showToast('复刻失败：' + err.message)
      }
    })
  })
  container.querySelectorAll('.gallery-author').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      location.hash = `#/creator/${el.dataset.author}`
    })
  })
}
