/**
 * 项目列表视图
 * 包含模板画廊 + 我的项目（支持搜索筛选）
 */

import { api } from '../api.js'
import { showToast, refreshQuota } from '../app.js'
import { i18n } from '../i18n.js'

// 筛选状态
const filterState = {
  search: '',
  status: 'all',
  style: 'all',
  platform: 'all',
  tag: 'all',
  favorite: 'all',
  archived: 'active',
  sort: 'updatedAt',
}

// 多选模式状态
const selectMode = {
  active: false,
  selected: new Set(),
}

// 所有标签（从 API 加载）
let allTags = []

const STYLE_OPTIONS = [
  { value: 'all', label: '全部风格' },
  { value: 'none', label: '无风格' },
  { value: 'nolan', label: '诺兰' },
  { value: 'wes-anderson', label: '韦斯·安德森' },
  { value: 'tarantino', label: '昆汀' },
  { value: 'wong-kar-wai', label: '王家卫' },
  { value: 'studio-ghibli', label: '吉卜力' },
  { value: 'blade-runner', label: '赛博朋克' },
  { value: 'minimalist', label: '极简主义' },
  { value: 'documentary', label: '纪录片' },
  { value: 'noir', label: '黑色电影' },
]

export async function renderProjectList(container, options = {}) {
  container.innerHTML = `
    <div class="loading-overlay">
      <div class="loading"></div>
      <span>加载中...</span>
    </div>
  `

  try {
    const templatesResult = await api.listTemplates()
    const templates = templatesResult.items || []

    // 加载最近访问项目
    let recentProjects = []
    try {
      const recentResult = await api.getRecentProjects(5)
      recentProjects = recentResult.projects || []
    } catch (e) {
      recentProjects = []
    }

    // 加载所有标签
    try {
      const tagsResult = await api.getAllTags()
      allTags = tagsResult.tags || []
    } catch (e) {
      allTags = []
    }

    container.innerHTML = `
      <!-- Hero 区 -->
      <section class="hero-section">
        <div class="hero-content">
          <h1 class="hero-title">从一句话到一部短片</h1>
          <p class="hero-desc">AI 帮你完成剧本、分镜、视频、配音、字幕，让创作像写一句话一样简单</p>
          <div class="hero-actions">
            <button class="hero-btn-primary" id="heroCreateBtn">
              <span>➕</span> 新建项目
            </button>
            <a href="#/templates" class="hero-btn-secondary">从模板开始</a>
          </div>
        </div>
        <div class="hero-visual">
          <div class="hero-card" onclick="location.hash='#/directors'" title="导演模式">
            <span>🎬</span>
            <span class="hero-card-label">导演</span>
          </div>
          <div class="hero-card" onclick="location.hash='#/title-sequences'" title="创意片头">
            <span>🎞️</span>
            <span class="hero-card-label">片头</span>
          </div>
          <div class="hero-card" onclick="location.hash='#/gallery'" title="作品广场">
            <span>🎭</span>
            <span class="hero-card-label">广场</span>
          </div>
        </div>
      </section>

      <!-- 快捷入口 -->
      <section class="quick-links-section">
        <div class="section-header">
          <h2 class="section-title">快捷创作</h2>
        </div>
        <div class="quick-links-scroll">
          <div class="quick-link-card" onclick="location.hash='#/project/new'">
            <div class="quick-link-icon">📝</div>
            <div class="quick-link-name">剧本生成</div>
          </div>
          <div class="quick-link-card" onclick="location.hash='#/directors'">
            <div class="quick-link-icon">👤</div>
            <div class="quick-link-name">角色造型</div>
          </div>
          <div class="quick-link-card" onclick="location.hash='#/project/new'">
            <div class="quick-link-icon">🎬</div>
            <div class="quick-link-name">视频生成</div>
          </div>
          <div class="quick-link-card" onclick="location.hash='#/project/new'">
            <div class="quick-link-icon">🎙️</div>
            <div class="quick-link-name">配音合成</div>
          </div>
          <div class="quick-link-card" onclick="location.hash='#/project/new'">
            <div class="quick-link-icon">📤</div>
            <div class="quick-link-name">字幕导出</div>
          </div>
          <div class="quick-link-card" onclick="location.hash='#/project/new'">
            <div class="quick-link-icon">🎞️</div>
            <div class="quick-link-name">一键成片</div>
          </div>
        </div>
      </section>

      <!-- 模板画廊 -->
      <section class="template-section">
        <div class="section-header">
          <h2 class="section-title">从模板开始</h2>
          <span class="section-subtitle">选择一个模板，快速开启创作</span>
        </div>
        <div class="template-grid" id="templateGrid">
          ${templates.map((t) => templateCardHtml(t)).join('')}
        </div>
      </section>

      ${recentProjects.length > 0 ? `
      <!-- 最近访问 -->
      <section class="recent-section">
        <div class="section-header">
          <h2 class="section-title">🕐 最近访问</h2>
          <span class="section-subtitle">继续你的创作</span>
        </div>
        <div class="recent-grid">
          ${recentProjects.map((p) => `
            <a href="#/project/${p.id}" class="recent-card">
              <div class="recent-cover" style="${p.coverUrl ? `background-image: url(${p.coverUrl});` : 'background: linear-gradient(135deg, #1a1a2e, #16213e);'}">
                ${p.coverUrl ? '' : '<span class="recent-cover-icon">🎬</span>'}
              </div>
              <div class="recent-info">
                <div class="recent-name">${escapeHtml(p.name)}</div>
                <div class="recent-meta">
                  <span>${p.shots ? p.shots.filter(s => s.status === 'completed').length : 0}/${p.shots ? p.shots.length : 0} 镜头</span>
                  <span>·</span>
                  <span>${formatRelativeTime(p.lastAccessedAt)}</span>
                </div>
              </div>
            </a>
          `).join('')}
        </div>
      </section>
      ` : ''}

      <!-- 我的项目 -->
      <section class="projects-section">
        <div class="section-header">
          <h2 class="section-title">${i18n.t('myProjects')}</h2>
          <button class="btn btn-primary btn-sm" id="createProjectBtn">+ ${i18n.t('newProject')}</button>
          <button class="btn btn-sm" id="importProjectBtn">📥 ${i18n.t('importProject')}</button>
          <a href="#/recycle-bin" class="btn btn-sm" title="回收站">🗑️</a>
          <input type="file" id="importFileInput" accept=".json" style="display: none;" />
        </div>

        <!-- 精简搜索筛选栏 -->
        <div class="filter-bar-compact">
          <div class="filter-search">
            <span class="filter-search-icon">🔍</span>
            <input type="text" id="searchInput" placeholder="${i18n.t('searchPlaceholder')}" value="${escapeHtml(filterState.search)}" />
          </div>
          <select class="filter-select" id="statusFilter">
            <option value="all" ${filterState.status === 'all' ? 'selected' : ''}>全部状态</option>
            <option value="in-progress" ${filterState.status === 'in-progress' ? 'selected' : ''}>${i18n.t('statusInProgress')}</option>
            <option value="completed" ${filterState.status === 'completed' ? 'selected' : ''}>${i18n.t('statusCompleted')}</option>
            <option value="empty" ${filterState.status === 'empty' ? 'selected' : ''}>${i18n.t('statusEmpty')}</option>
          </select>
          <select class="filter-select" id="styleFilter">
            ${STYLE_OPTIONS.map((o) => `<option value="${o.value}" ${filterState.style === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
          <select class="filter-select" id="sortFilter">
            <option value="updatedAt" ${filterState.sort === 'updatedAt' ? 'selected' : ''}>${i18n.t('sortUpdated')}</option>
            <option value="createdAt" ${filterState.sort === 'createdAt' ? 'selected' : ''}>${i18n.t('sortCreated')}</option>
            <option value="name" ${filterState.sort === 'name' ? 'selected' : ''}>${i18n.t('sortName')}</option>
          </select>
          <button class="btn btn-sm" id="moreFilterBtn">更多筛选 ▼</button>
          <button class="btn btn-sm" id="selectModeBtn">${selectMode.active ? `✓ ${i18n.t('exitSelectMode')}` : `☑️ ${i18n.t('selectMode')}`}</button>
        </div>

        <!-- 更多筛选面板（默认隐藏） -->
        <div class="filter-bar" id="moreFilterPanel" style="display: none;">
          <select class="filter-select" id="platformFilter">
            <option value="all" ${filterState.platform === 'all' ? 'selected' : ''}>${i18n.t('platformAll')}</option>
            <option value="landscape" ${filterState.platform === 'landscape' ? 'selected' : ''}>${i18n.t('platformLandscape')}</option>
            <option value="portrait" ${filterState.platform === 'portrait' ? 'selected' : ''}>${i18n.t('platformPortrait')}</option>
            <option value="square" ${filterState.platform === 'square' ? 'selected' : ''}>${i18n.t('platformSquare')}</option>
          </select>
          <select class="filter-select" id="tagFilter">
            <option value="all" ${filterState.tag === 'all' ? 'selected' : ''}>${i18n.t('tagAll')}</option>
            ${allTags.map((t) => `<option value="${escapeHtml(t)}" ${filterState.tag === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
          </select>
          <select class="filter-select" id="favoriteFilter">
            <option value="all" ${filterState.favorite === 'all' ? 'selected' : ''}>${i18n.t('favoriteAll')}</option>
            <option value="true" ${filterState.favorite === 'true' ? 'selected' : ''}>${i18n.t('favoriteOnly')}</option>
          </select>
          <select class="filter-select" id="archivedFilter">
            <option value="active" ${filterState.archived === 'active' ? 'selected' : ''}>${i18n.t('archivedActive')}</option>
            <option value="true" ${filterState.archived === 'true' ? 'selected' : ''}>${i18n.t('archivedOnly')}</option>
            <option value="all" ${filterState.archived === 'all' ? 'selected' : ''}>${i18n.t('archivedAll')}</option>
          </select>
        </div>

        <!-- 批量操作工具栏 -->
        <div class="batch-toolbar" id="batchToolbar" style="display: none;">
          <span class="batch-count">${i18n.t('selectedCount', { count: '<strong id="selectedCount">0</strong>' })}</span>
          <div class="batch-actions">
            <button class="btn btn-sm" id="batchSelectAllBtn">${i18n.t('selectAll')}</button>
            <button class="btn btn-sm" id="batchFavoriteBtn">⭐ ${i18n.t('favorite')}</button>
            <button class="btn btn-sm" id="batchUnfavoriteBtn">${i18n.t('unfavorite')}</button>
            <button class="btn btn-sm" id="batchArchiveBtn">🗄️ ${i18n.t('archive')}</button>
            <button class="btn btn-sm" id="batchUnarchiveBtn">${i18n.t('unarchive')}</button>
            <button class="btn btn-sm btn-danger" id="batchDeleteBtn">🗑️ ${i18n.t('delete')}</button>
          </div>
        </div>

        <div id="projectListContainer">
          <div class="loading-overlay">
            <div class="loading"></div>
            <span>${i18n.t('loading')}</span>
          </div>
        </div>
      </section>
    `

    // 模板卡片点击
    document.querySelectorAll('.template-card').forEach((card) => {
      card.addEventListener('click', () => {
        const templateId = card.dataset.templateId
        showTemplateModal(templateId, templates, container)
      })
    })

    // Hero 新建项目按钮
    const heroCreateBtn = document.getElementById('heroCreateBtn')
    if (heroCreateBtn) heroCreateBtn.addEventListener('click', () => showCreateModal(container))

    // 空白项目按钮
    const createBtn = document.getElementById('createProjectBtn')
    if (createBtn) createBtn.addEventListener('click', () => showCreateModal(container))

    // 如果传入 openCreate 参数，自动打开创建弹窗
    if (options.openCreate) {
      setTimeout(() => showCreateModal(container), 100)
    }

    // 导入项目按钮
    const importBtn = document.getElementById('importProjectBtn')
    const importFileInput = document.getElementById('importFileInput')
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => importFileInput.click())
      importFileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0]
        if (!file) return

        try {
          const text = await file.text()
          const projectData = JSON.parse(text)

          if (!projectData.name) {
            showToast('无效的项目文件：缺少名称', 'error')
            return
          }

          const result = await api.importProject(projectData)
          showToast(result.message || '项目导入成功')
          loadProjects(container)
        } catch (err) {
          showToast(`导入失败：${err.message}`, 'error')
        } finally {
          importFileInput.value = ''
        }
      })
    }

    // 绑定筛选事件
    bindFilterEvents(container)

    // 绑定多选和批量操作
    bindSelectModeEvents(container)

    // 加载项目列表
    loadProjects(container)
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">加载失败：${err.message}</div>
        <button class="btn" onclick="location.reload()">重试</button>
      </div>
    `
  }
}

/**
 * 绑定筛选器事件
 */
function bindFilterEvents(container) {
  const searchInput = document.getElementById('searchInput')
  const statusFilter = document.getElementById('statusFilter')
  const styleFilter = document.getElementById('styleFilter')
  const platformFilter = document.getElementById('platformFilter')
  const tagFilter = document.getElementById('tagFilter')
  const sortFilter = document.getElementById('sortFilter')

  let searchTimeout
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout)
    searchTimeout = setTimeout(() => {
      filterState.search = searchInput.value
      loadProjects(container)
    }, 300)
  })

  statusFilter.addEventListener('change', () => {
    filterState.status = statusFilter.value
    loadProjects(container)
  })

  styleFilter.addEventListener('change', () => {
    filterState.style = styleFilter.value
    loadProjects(container)
  })

  platformFilter.addEventListener('change', () => {
    filterState.platform = platformFilter.value
    loadProjects(container)
  })

  if (tagFilter) {
    tagFilter.addEventListener('change', () => {
      filterState.tag = tagFilter.value
      loadProjects(container)
    })
  }

  const favoriteFilter = document.getElementById('favoriteFilter')
  if (favoriteFilter) {
    favoriteFilter.addEventListener('change', () => {
      filterState.favorite = favoriteFilter.value
      loadProjects(container)
    })
  }

  const archivedFilter = document.getElementById('archivedFilter')
  if (archivedFilter) {
    archivedFilter.addEventListener('change', () => {
      filterState.archived = archivedFilter.value
      loadProjects(container)
    })
  }

  sortFilter.addEventListener('change', () => {
    filterState.sort = sortFilter.value
    loadProjects(container)
  })

  // 更多筛选面板开关
  const moreFilterBtn = document.getElementById('moreFilterBtn')
  const moreFilterPanel = document.getElementById('moreFilterPanel')
  if (moreFilterBtn && moreFilterPanel) {
    moreFilterBtn.addEventListener('click', () => {
      const isOpen = moreFilterPanel.style.display !== 'none'
      moreFilterPanel.style.display = isOpen ? 'none' : 'flex'
      moreFilterBtn.textContent = isOpen ? '更多筛选 ▼' : '收起筛选 ▲'
    })
  }
}

/**
 * 多选模式和批量操作事件绑定
 */
function bindSelectModeEvents(container) {
  const selectModeBtn = document.getElementById('selectModeBtn')
  const batchToolbar = document.getElementById('batchToolbar')

  if (selectModeBtn) {
    selectModeBtn.addEventListener('click', () => {
      selectMode.active = !selectMode.active
      selectMode.selected.clear()
      selectModeBtn.textContent = selectMode.active ? `✓ ${i18n.t('exitSelectMode')}` : `☑️ ${i18n.t('selectMode')}`
      if (batchToolbar) {
        batchToolbar.style.display = selectMode.active ? 'flex' : 'none'
      }
      updateSelectedCount()
      loadProjects(container)
    })
  }

  // 全选
  const batchSelectAllBtn = document.getElementById('batchSelectAllBtn')
  if (batchSelectAllBtn) {
    batchSelectAllBtn.addEventListener('click', () => {
      const checkboxes = document.querySelectorAll('.project-checkbox')
      const allSelected = Array.from(checkboxes).every((cb) => cb.checked)
      checkboxes.forEach((cb) => {
        cb.checked = !allSelected
        if (!allSelected) {
          selectMode.selected.add(cb.dataset.projectId)
        } else {
          selectMode.selected.delete(cb.dataset.projectId)
        }
      })
      updateSelectedCount()
      batchSelectAllBtn.textContent = allSelected ? '全选' : '取消全选'
    })
  }

  // 批量收藏
  document.getElementById('batchFavoriteBtn')?.addEventListener('click', async () => {
    if (selectMode.selected.size === 0) return
    try {
      await api.batchFavorite(Array.from(selectMode.selected), true)
      showToast(`已收藏 ${selectMode.selected.size} 个项目`)
      selectMode.selected.clear()
      loadProjects(container)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  // 批量取消收藏
  document.getElementById('batchUnfavoriteBtn')?.addEventListener('click', async () => {
    if (selectMode.selected.size === 0) return
    try {
      await api.batchFavorite(Array.from(selectMode.selected), false)
      showToast(`已取消收藏 ${selectMode.selected.size} 个项目`)
      selectMode.selected.clear()
      loadProjects(container)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  // 批量归档
  document.getElementById('batchArchiveBtn')?.addEventListener('click', async () => {
    if (selectMode.selected.size === 0) return
    try {
      await api.batchArchive(Array.from(selectMode.selected), true)
      showToast(`已归档 ${selectMode.selected.size} 个项目`)
      selectMode.selected.clear()
      loadProjects(container)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  // 批量取消归档
  document.getElementById('batchUnarchiveBtn')?.addEventListener('click', async () => {
    if (selectMode.selected.size === 0) return
    try {
      await api.batchArchive(Array.from(selectMode.selected), false)
      showToast(`已取消归档 ${selectMode.selected.size} 个项目`)
      selectMode.selected.clear()
      loadProjects(container)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  // 批量删除
  document.getElementById('batchDeleteBtn')?.addEventListener('click', async () => {
    if (selectMode.selected.size === 0) return
    if (!confirm(`确定删除选中的 ${selectMode.selected.size} 个项目吗？关联的视频和音频文件也会被清理。`)) return
    try {
      const result = await api.batchDelete(Array.from(selectMode.selected))
      showToast(`已删除 ${result.success.length} 个项目`)
      selectMode.selected.clear()
      loadProjects(container)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}

/**
 * 更新已选数量显示
 */
function updateSelectedCount() {
  const countEl = document.getElementById('selectedCount')
  if (countEl) {
    countEl.textContent = selectMode.selected.size
  }
}

/**
 * 根据筛选条件加载项目
 */
async function loadProjects(container) {
  const listContainer = document.getElementById('projectListContainer')
  if (!listContainer) return

  listContainer.innerHTML = `
    <div class="loading-overlay">
      <div class="loading"></div>
      <span>加载项目...</span>
    </div>
  `

  try {
    const result = await api.listProjects({
      search: filterState.search || undefined,
      status: filterState.status,
      style: filterState.style,
      platform: filterState.platform,
      tag: filterState.tag === 'all' ? undefined : filterState.tag,
      favorite: filterState.favorite === 'true' ? true : undefined,
      archived: filterState.archived === 'active' ? undefined : filterState.archived,
      sort: filterState.sort,
      limit: 100,
    })
    const projects = result.items || []

    if (projects.length === 0) {
      listContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🔍</div>
          <div class="empty-state-text">${i18n.t('noProjects')}</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">尝试调整搜索关键词或筛选条件</div>
        </div>
      `
      return
    }

    listContainer.innerHTML = `
      <div class="project-count">${i18n.t('projectCount', { count: result.total })}</div>
      <div class="project-grid" id="projectGrid">
        ${projects.map((p) => projectCardHtml(p)).join('')}
      </div>
    `

    // 项目卡片点击
    document.querySelectorAll('.project-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.project-card-delete')) return
        if (e.target.closest('.project-card-favorite')) return
        if (e.target.closest('.project-card-archive')) return
        if (e.target.closest('.project-card-duplicate')) return
        if (e.target.closest('.project-checkbox')) return
        if (selectMode.active) {
          const checkbox = card.querySelector('.project-checkbox')
          if (checkbox) {
            checkbox.checked = !checkbox.checked
            const id = card.dataset.projectId
            if (checkbox.checked) {
              selectMode.selected.add(id)
            } else {
              selectMode.selected.delete(id)
            }
            card.classList.toggle('selected', checkbox.checked)
            updateSelectedCount()
          }
          return
        }
        const id = card.dataset.projectId
        location.hash = `#/project/${id}`
      })
    })

    // 复选框点击
    document.querySelectorAll('.project-checkbox').forEach((checkbox) => {
      checkbox.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = checkbox.dataset.projectId
        if (checkbox.checked) {
          selectMode.selected.add(id)
        } else {
          selectMode.selected.delete(id)
        }
        checkbox.closest('.project-card')?.classList.toggle('selected', checkbox.checked)
        updateSelectedCount()
      })
    })

    // 删除按钮
    document.querySelectorAll('.project-card-delete').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.projectId
        if (confirm('确定删除这个项目吗？关联的视频和音频文件也会被清理。')) {
          try {
            await api.deleteProject(id)
            showToast('项目已删除')
            loadProjects(container)
          } catch (err) {
            showToast(err.message, 'error')
          }
        }
      })
    })

    // 收藏按钮
    document.querySelectorAll('.project-card-favorite').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.projectId
        try {
          const result = await api.toggleFavorite(id)
          btn.classList.toggle('active', result.isFavorite)
          btn.textContent = result.isFavorite ? '⭐' : '☆'
          btn.title = result.isFavorite ? '取消收藏' : '收藏'
          showToast(result.isFavorite ? '已收藏' : '已取消收藏')
        } catch (err) {
          showToast(err.message, 'error')
        }
      })
    })

    // 归档按钮
    document.querySelectorAll('.project-card-archive').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.projectId
        try {
          const result = await api.toggleArchive(id)
          showToast(result.isArchived ? '已归档' : '已取消归档')
          loadProjects(container)
        } catch (err) {
          showToast(err.message, 'error')
        }
      })
    })

    // 复制按钮
    document.querySelectorAll('.project-card-duplicate').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.projectId
        const card = btn.closest('.project-card')
        const projectName = card?.querySelector('.project-card-title')?.textContent || '项目'
        const newName = prompt('输入新项目名称：', `${projectName} (副本)`)
        if (newName === null) return // 用户取消

        try {
          const duplicated = await api.duplicateProject(id, newName.trim() || undefined)
          showToast(`已复制为「${duplicated.name}」`)
          loadProjects(container)
        } catch (err) {
          showToast(err.message, 'error')
        }
      })
    })

    // 上传封面按钮
    document.querySelectorAll('.btn-upload-cover').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.dataset.projectId
        const fileInput = document.createElement('input')
        fileInput.type = 'file'
        fileInput.accept = 'image/*'
        fileInput.addEventListener('change', async (ev) => {
          const file = ev.target.files[0]
          if (!file) return

          if (file.size > 5 * 1024 * 1024) {
            showToast('图片大小不能超过 5MB', 'error')
            return
          }

          try {
            showToast('正在上传封面...', 'info')
            const reader = new FileReader()
            reader.onload = async (event) => {
              const base64 = event.target.result
              const result = await api.uploadCover(id, base64)
              if (result.success) {
                showToast('封面上传成功', 'success')
                loadProjects(container)
              }
            }
            reader.onerror = () => {
              showToast('图片读取失败', 'error')
            }
            reader.readAsDataURL(file)
          } catch (err) {
            showToast(`上传失败: ${err.message}`, 'error')
          }
        })
        fileInput.click()
      })
    })
  } catch (err) {
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">加载失败：${err.message}</div>
      </div>
    `
  }
}

function templateCardHtml(template) {
  return `
    <div class="template-card" data-template-id="${template.id}" style="--template-color: ${template.color}">
      <div class="template-card-icon">${template.icon}</div>
      <div class="template-card-name">${template.name}</div>
      <div class="template-card-desc">${template.description}</div>
      <div class="template-card-tags">
        ${template.tags.map((tag) => `<span class="tag">${tag}</span>`).join('')}
      </div>
    </div>
  `
}

function projectCardHtml(project) {
  const shotCount = project.shots ? project.shots.length : 0
  const completedCount = project.shots
    ? project.shots.filter((s) => s.status === 'completed').length
    : 0
  const date = new Date(project.updatedAt).toLocaleDateString('zh-CN')
  const progress = shotCount > 0 ? Math.round((completedCount / shotCount) * 100) : 0
  const tagsHtml = project.tags && project.tags.length > 0
    ? `<div class="project-card-tags">${project.tags.slice(0, 3).map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}${project.tags.length > 3 ? `<span class="tag-chip tag-more">+${project.tags.length - 3}</span>` : ''}</div>`
    : ''

  return `
    <div class="project-card ${project.isArchived ? 'archived' : ''} ${selectMode.active ? 'selectable' : ''} ${selectMode.selected.has(project.id) ? 'selected' : ''}" data-project-id="${project.id}">
      ${selectMode.active ? `<input type="checkbox" class="project-checkbox" data-project-id="${project.id}" ${selectMode.selected.has(project.id) ? 'checked' : ''} />` : ''}
      <button class="btn btn-sm project-card-delete" data-project-id="${project.id}">删除</button>
      <button class="project-card-archive" data-project-id="${project.id}" title="${project.isArchived ? '取消归档' : '归档'}">
        ${project.isArchived ? '📦' : '🗄️'}
      </button>
      <button class="project-card-duplicate" data-project-id="${project.id}" title="复制项目">
        📋
      </button>
      <button class="project-card-favorite ${project.isFavorite ? 'active' : ''}" data-project-id="${project.id}" title="${project.isFavorite ? '取消收藏' : '收藏'}">
        ${project.isFavorite ? '⭐' : '☆'}
      </button>
      <div class="project-card-cover">
        ${
          project.coverUrl
            ? `<img src="${project.coverUrl}" alt="封面" class="project-card-cover-img" />`
            : '🎞️'
        }
        <div class="project-card-cover-overlay">
          <button class="btn btn-sm btn-upload-cover" data-project-id="${project.id}" title="上传封面">
            📷 上传封面
          </button>
        </div>
      </div>
      <div class="project-card-title">${escapeHtml(project.name)}</div>
      <div class="project-card-meta">
        <span>${shotCount} 镜</span>
        <span>${completedCount}/${shotCount} 完成</span>
        <span>${date}</span>
      </div>
      ${tagsHtml}
      ${
        shotCount > 0
          ? `<div class="project-card-progress"><div class="progress-bar" style="width:${progress}%"></div></div>`
          : ''
      }
    </div>
  `
}

/**
 * 模板创建弹窗
 */
function showTemplateModal(templateId, templates, container) {
  const template = templates.find((t) => t.id === templateId)
  if (!template) return

  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal modal-lg">
      <div class="modal-title">
        <span style="margin-right:8px">${template.icon}</span>
        从「${template.name}」模板创建
      </div>
      <div class="modal-desc">${template.description}</div>

      <div class="form-group">
        <label class="form-label">创作想法（可修改）</label>
        <select class="form-select" id="templateIdeaSelect">
          ${template.sampleIdeas.map((idea, i) => `<option value="${escapeHtml(idea)}">${escapeHtml(idea)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">或自己输入想法</label>
        <input class="form-input" id="templateCustomIdea" placeholder="留空则使用上方选择的想法" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">项目名称</label>
          <input class="form-input" id="templateProjectName" placeholder="自动生成，可修改" />
        </div>
        <div class="form-group">
          <label class="form-label">目标时长</label>
          <select class="form-select" id="templateDuration">
            <option value="15">15 秒</option>
            <option value="30" selected>30 秒</option>
            <option value="60">60 秒</option>
            <option value="90">90 秒</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="checkbox-label">
          <input type="checkbox" id="templateAutoScript" checked />
          创建后自动生成剧本和分镜
        </label>
      </div>
      <div class="modal-actions">
        <button class="btn" id="templateCancelBtn">取消</button>
        <button class="btn btn-primary" id="templateConfirmBtn">创建项目</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const close = () => modal.remove()
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close()
  })
  document.getElementById('templateCancelBtn').addEventListener('click', close)

  document.getElementById('templateConfirmBtn').addEventListener('click', async () => {
    const customIdea = document.getElementById('templateCustomIdea').value.trim()
    const selectedIdea = document.getElementById('templateIdeaSelect').value
    const idea = customIdea || selectedIdea
    const name = document.getElementById('templateProjectName').value.trim()
    const targetDuration = parseInt(document.getElementById('templateDuration').value, 10)
    const autoGenerateScript = document.getElementById('templateAutoScript').checked

    const btn = document.getElementById('templateConfirmBtn')
    btn.disabled = true
    btn.innerHTML = '<span class="loading"></span> 创建中...'

    try {
      const result = await api.createFromTemplate(templateId, {
        name: name || undefined,
        idea,
        targetDuration,
        autoGenerateScript,
      })
      showToast(autoGenerateScript ? '项目已创建，剧本生成中' : '项目已创建')
      refreshQuota()
      close()
      location.hash = `#/project/${result.project.id}`
    } catch (err) {
      showToast(err.message, 'error')
      btn.disabled = false
      btn.innerHTML = '创建项目'
    }
  })
}

/**
 * 空白项目创建弹窗
 */
function showCreateModal(container) {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">新建空白项目</div>
      <div class="form-group">
        <label class="form-label">项目名称</label>
        <input class="form-input" id="projectNameInput" placeholder="例如：火星上的种花人" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">目标时长</label>
          <select class="form-select" id="projectDurationSelect">
            <option value="30">30 秒</option>
            <option value="60" selected>60 秒</option>
            <option value="90">90 秒</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">画面比例</label>
          <select class="form-select" id="projectPlatformSelect">
            <option value="landscape" selected>横屏 16:9</option>
            <option value="portrait">竖屏 9:16</option>
          </select>
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn" id="cancelCreateBtn">取消</button>
        <button class="btn btn-primary" id="confirmCreateBtn">创建</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const close = () => modal.remove()
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close()
  })
  document.getElementById('cancelCreateBtn').addEventListener('click', close)

  document.getElementById('confirmCreateBtn').addEventListener('click', async () => {
    const name = document.getElementById('projectNameInput').value.trim()
    if (!name) {
      showToast('请输入项目名称', 'error')
      return
    }
    const targetDuration = parseInt(document.getElementById('projectDurationSelect').value, 10)
    const platform = document.getElementById('projectPlatformSelect').value

    try {
      const project = await api.createProject({ name, targetDuration, platform })
      showToast('项目创建成功')
      close()
      location.hash = `#/project/${project.id}`
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  document.getElementById('projectNameInput').focus()
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function formatRelativeTime(isoString) {
  if (!isoString) return '从未'
  const date = new Date(isoString)
  const now = new Date()
  const diffMs = now - date
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN')
}
