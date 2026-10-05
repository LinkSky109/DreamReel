import { api } from '../api.js'
import { showToast } from '../app.js'

let currentCategory = 'all'
let currentSearch = ''
let currentType = 'all'

export async function renderTemplateMarket(container) {
  try {
    const [templatesData, categoriesData] = await Promise.all([
      api.listTemplates({ category: currentCategory === 'all' ? undefined : currentCategory, search: currentSearch || undefined, type: currentType }),
      api.listTemplates({}), // 获取所有模板用于分类统计
    ])

    const templates = templatesData.items || []
    const allTemplates = categoriesData.items || []

    // 计算分类统计
    const categoryCounts = {}
    allTemplates.forEach((t) => {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1
    })

    container.innerHTML = `
      <div class="template-market-page">
        <div class="page-header">
          <div>
            <h1 class="page-title">🎨 模板市场</h1>
            <p class="page-subtitle">从精选模板快速开始创作，或分享你的项目模板</p>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-primary btn-sm" id="createTemplateBtn">+ 从项目创建模板</button>
          </div>
        </div>

        <div class="template-toolbar">
          <div class="template-search">
            <input type="text" id="templateSearchInput" placeholder="搜索模板..." value="${currentSearch}" />
          </div>
          <div class="template-type-filter">
            <button class="template-type-btn ${currentType === 'all' ? 'active' : ''}" data-type="all">全部</button>
            <button class="template-type-btn ${currentType === 'builtin' ? 'active' : ''}" data-type="builtin">内置</button>
            <button class="template-type-btn ${currentType === 'user' ? 'active' : ''}" data-type="user">用户分享</button>
          </div>
        </div>

        <div class="template-categories">
          <button class="template-cat-btn ${currentCategory === 'all' ? 'active' : ''}" data-category="all">
            全部 <span class="cat-count">${allTemplates.length}</span>
          </button>
          ${Object.entries(categoryCounts).map(([cat, count]) => `
            <button class="template-cat-btn ${currentCategory === cat ? 'active' : ''}" data-category="${cat}">
              ${cat} <span class="cat-count">${count}</span>
            </button>
          `).join('')}
        </div>

        <div class="template-grid" id="templateGrid">
          ${templates.length === 0 ? `
            <div class="empty-state" style="grid-column: 1/-1; padding: 60px;">
              <div class="empty-state-icon">🎨</div>
              <div class="empty-state-text">没有找到匹配的模板</div>
            </div>
          ` : templates.map((t) => renderTemplateCard(t)).join('')}
        </div>
      </div>

      <!-- 创建模板弹窗 -->
      <div class="modal-overlay" id="createTemplateModal" style="display: none;">
        <div class="modal-content" style="max-width: 500px;">
          <h3>从项目创建模板</h3>
          <div class="form-group">
            <label>选择项目 *</label>
            <select id="templateProjectSelect">
              <option value="">加载中...</option>
            </select>
          </div>
          <div class="form-group">
            <label>模板名称 *</label>
            <input type="text" id="templateNameInput" placeholder="给模板起个名字" />
          </div>
          <div class="form-group">
            <label>模板描述</label>
            <textarea id="templateDescInput" placeholder="描述这个模板的特点和用途" rows="3"></textarea>
          </div>
          <div class="form-group">
            <label>分类</label>
            <select id="templateCategorySelect">
              <option value="自定义">自定义</option>
              <option value="商业">商业</option>
              <option value="生活">生活</option>
              <option value="创意">创意</option>
              <option value="教育">教育</option>
            </select>
          </div>
          <div class="modal-actions">
            <button class="btn" onclick="document.getElementById('createTemplateModal').style.display='none'">取消</button>
            <button class="btn btn-primary" id="submitTemplateBtn">创建模板</button>
          </div>
        </div>
      </div>
    `

    // 绑定事件
    bindTemplateMarketEvents()
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

function renderTemplateCard(template) {
  const isUser = template.type === 'user' || template.isBuiltin === false
  return `
    <div class="template-card" data-template-id="${template.id}">
      <div class="template-card-header" style="background: linear-gradient(135deg, ${template.color || '#6366f1'}, ${template.color || '#6366f1'}99);">
        <span class="template-icon">${template.icon || '🎬'}</span>
        ${isUser ? '<span class="template-badge">用户分享</span>' : '<span class="template-badge builtin">内置</span>'}
      </div>
      <div class="template-card-body">
        <h3 class="template-name">${escapeHtml(template.name)}</h3>
        <p class="template-desc">${escapeHtml(template.description || '')}</p>
        <div class="template-meta">
          <span class="template-category">${template.category || '自定义'}</span>
          ${template.useCount ? `<span class="template-uses">📥 ${template.useCount} 次使用</span>` : ''}
          ${template.createdAt ? `<span class="template-date">${new Date(template.createdAt).toLocaleDateString()}</span>` : ''}
        </div>
        ${template.tags && template.tags.length > 0 ? `
          <div class="template-tags">
            ${template.tags.slice(0, 3).map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}
          </div>
        ` : ''}
        <div class="template-actions">
          <button class="btn btn-primary btn-sm template-use-btn" data-template-id="${template.id}">使用模板</button>
          ${isUser ? `<button class="btn btn-sm btn-danger template-delete-btn" data-template-id="${template.id}">删除</button>` : ''}
        </div>
      </div>
    </div>
  `
}

function bindTemplateMarketEvents() {
  // 搜索
  const searchInput = document.getElementById('templateSearchInput')
  if (searchInput) {
    let searchTimer
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer)
      searchTimer = setTimeout(() => {
        currentSearch = searchInput.value
        renderTemplateMarket(document.querySelector('.template-market-page').parentElement)
      }, 300)
    })
  }

  // 类型筛选
  document.querySelectorAll('.template-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentType = btn.dataset.type
      renderTemplateMarket(document.querySelector('.template-market-page').parentElement)
    })
  })

  // 分类筛选
  document.querySelectorAll('.template-cat-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentCategory = btn.dataset.category
      renderTemplateMarket(document.querySelector('.template-market-page').parentElement)
    })
  })

  // 使用模板
  document.querySelectorAll('.template-use-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const templateId = btn.dataset.templateId
      try {
        const result = await api.createFromTemplate(templateId, { autoGenerateScript: true })
        showToast('项目创建成功，正在生成剧本...', 'success')
        setTimeout(() => {
          location.hash = `#/editor/${result.project.id}`
        }, 1000)
      } catch (err) {
        showToast(`创建失败: ${err.message}`, 'error')
      }
    })
  })

  // 删除模板
  document.querySelectorAll('.template-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const templateId = btn.dataset.templateId
      if (confirm('确定要删除这个模板吗？')) {
        try {
          await api.deleteUserTemplate(templateId)
          showToast('模板已删除', 'success')
          renderTemplateMarket(document.querySelector('.template-market-page').parentElement)
        } catch (err) {
          showToast(`删除失败: ${err.message}`, 'error')
        }
      }
    })
  })

  // 创建模板按钮
  const createBtn = document.getElementById('createTemplateBtn')
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const modal = document.getElementById('createTemplateModal')
      modal.style.display = 'flex'

      // 加载项目列表
      try {
        const result = await api.listProjects({ limit: 50 })
        const select = document.getElementById('templateProjectSelect')
        select.innerHTML = result.items.length === 0
          ? '<option value="">暂无项目</option>'
          : '<option value="">请选择项目</option>' + result.items.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')
      } catch (err) {
        showToast(`加载项目失败: ${err.message}`, 'error')
      }
    })
  }

  // 提交创建模板
  const submitBtn = document.getElementById('submitTemplateBtn')
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const projectId = document.getElementById('templateProjectSelect').value
      const name = document.getElementById('templateNameInput').value.trim()
      const description = document.getElementById('templateDescInput').value.trim()
      const category = document.getElementById('templateCategorySelect').value

      if (!projectId) {
        showToast('请选择项目', 'error')
        return
      }
      if (!name) {
        showToast('请输入模板名称', 'error')
        return
      }

      try {
        await api.createTemplateFromProject({ projectId, name, description, category })
        showToast('模板创建成功', 'success')
        document.getElementById('createTemplateModal').style.display = 'none'
        renderTemplateMarket(document.querySelector('.template-market-page').parentElement)
      } catch (err) {
        showToast(`创建失败: ${err.message}`, 'error')
      }
    })
  }
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
