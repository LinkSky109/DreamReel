/**
 * 项目编辑器视图
 * 包含：剧本 / 角色 / 镜头 / 配音 四个标签页
 */

import { api } from '../api.js'
import { showToast, state, refreshQuota } from '../app.js'
import { i18n } from '../i18n.js'
import { ProviderSelector } from '../components/providerSelector.js'
import {
  resolveInitialTab,
  normalizeTab,
  rememberTab,
  setTabInUrl,
  renderTabNav,
} from './editorTabs.js'
import { renderImagesTab } from './images.js'

/**
 * 防抖函数
 */
function debounce(fn, delay = 300) {
  let timer = null
  return function (...args) {
    clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}

let currentTab = 'script'

export async function renderEditor(container, projectId) {
  container.innerHTML = `
    <div class="loading-overlay">
      <div class="loading"></div>
      <span>${i18n.t('loading')}</span>
    </div>
  `

  try {
    const project = await api.getProject(projectId)
    state.currentProject = project

    // 预加载音色列表
    if (state.voices.length === 0) {
      try {
        const voiceData = await api.getVoices()
        state.voices = voiceData.voices || []
      } catch (_) {
        // 忽略音色加载失败
      }
    }

    // 预加载风格列表
    if (!state.availableStyles || state.availableStyles.length === 0) {
      try {
        const styleData = await api.listStyles()
        state.availableStyles = styleData.items || []
      } catch (_) {
        state.availableStyles = [{ id: 'none', name: '无风格', icon: '🎯' }]
      }
    }

    renderEditorLayout(container, project)
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">项目加载失败：${err.message}</div>
        <button class="btn" onclick="location.hash=''">返回列表</button>
      </div>
    `
  }
}

function renderEditorLayout(container, project) {
  currentTab = normalizeTab(resolveInitialTab())

  container.innerHTML = `
    <div class="page-header editor-page-header">
      <div style="display: flex; align-items: center; gap: 16px;">
        <button class="btn btn-sm" onclick="location.hash=''">← 返回</button>
        <div>
          <h1 class="page-title" id="projectTitle">${escapeHtml(project.name)}</h1>
          <div class="project-tags-inline" id="projectTagsInline">
            ${project.tags && project.tags.length > 0
              ? project.tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')
              : '<span style="color: var(--text-muted); font-size: 12px;">暂无标签</span>'
            }
            <button class="btn btn-sm btn-link" id="editTagsBtn" style="font-size: 12px; padding: 0 4px;">+ 编辑</button>
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-sm" id="saveAsTemplateBtn" title="保存为模板">📋 存为模板</button>
        <button class="btn btn-sm" id="renameProjectBtn">重命名</button>
        <button class="btn btn-sm" id="exportDataBtn" title="${i18n.t('export')}">💾 ${i18n.t('export')}</button>
        <button class="btn btn-primary btn-sm" id="exportProjectBtn">📤 ${i18n.t('exportVideo')}</button>
        <button class="btn btn-sm" id="posterBtn" title="AI海报封面">🖼️ 海报</button>
        <button class="btn btn-sm" id="trailerBtn" title="AI预告片">🎞️ 预告片</button>
        <button class="btn btn-sm" id="publishGalleryBtn" title="发布到作品广场">📢 发布广场</button>
      </div>
    </div>

    <div class="editor-layout">
      <aside class="editor-sidebar" id="editorSidebar">
        ${renderTabNav(i18n)}
      </aside>

      <div class="editor-content">
        <div class="tab-panel" id="tab-script"></div>
        <div class="tab-panel" id="tab-images"></div>
        <div class="tab-panel" id="tab-shots"></div>
        <div class="tab-panel" id="tab-dubbing"></div>
        <div class="tab-panel" id="tab-edit"></div>
        <div class="tab-panel" id="tab-characters"></div>
        <div class="tab-panel" id="tab-scenes"></div>
        <div class="tab-panel" id="tab-analysis"></div>
        <div class="tab-panel" id="tab-collab"></div>
        <div class="tab-panel" id="tab-versions"></div>
        <div class="tab-panel" id="tab-settings"></div>
      </div>
    </div>

    <!-- AI 助手浮动按钮 -->
    <button class="ai-assistant-fab" id="aiAssistantFab" title="AI 创作助手">
      <span class="ai-fab-icon">🤖</span>
      <span class="ai-fab-pulse"></span>
    </button>

    <!-- AI 助手聊天面板 -->
    <div class="ai-assistant-panel" id="aiAssistantPanel">
      <div class="ai-panel-header">
        <div class="ai-panel-title">
          <span>🤖</span>
          <span>AI 创作助手</span>
        </div>
        <div class="ai-panel-actions">
          <button class="ai-panel-btn" id="aiClearChatBtn" title="清空对话">🗑️</button>
          <button class="ai-panel-btn" id="aiClosePanelBtn" title="关闭">✕</button>
        </div>
      </div>
      <div class="ai-quick-actions" id="aiQuickActions">
        <!-- 快捷操作按钮动态生成 -->
      </div>
      <div class="ai-messages" id="aiMessages">
        <div class="ai-message ai-message-system">
          <div class="ai-message-avatar">🤖</div>
          <div class="ai-message-content">
            你好！我是 DreamReel AI 创作助手。我可以帮你改进剧本、设计镜头、深化角色、优化配音等。有什么我可以帮你的吗？
          </div>
        </div>
      </div>
      <div class="ai-input-area">
        <textarea class="ai-input" id="aiMessageInput" placeholder="输入你的问题，按 Enter 发送，Shift+Enter 换行..." rows="1"></textarea>
        <button class="ai-send-btn" id="aiSendBtn">发送</button>
      </div>
    </div>
  `

  applyTabState(container)

  // 标签切换
  container.querySelectorAll('.editor-nav-item').forEach((item) => {
    item.addEventListener('click', () => switchTab(item.dataset.tab))
  })

  // 重命名
  document.getElementById('renameProjectBtn').addEventListener('click', () => {
    const newName = prompt('输入新的项目名称：', project.name)
    if (newName && newName.trim()) {
      api
        .updateProject(project.id, { name: newName.trim() })
        .then(() => {
          project.name = newName.trim()
          document.getElementById('projectTitle').textContent = newName.trim()
          showToast('项目已重命名')
        })
        .catch((err) => showToast(err.message, 'error'))
    }
  })

  // 编辑标签
  const editTagsBtn = document.getElementById('editTagsBtn')
  if (editTagsBtn) {
    editTagsBtn.addEventListener('click', () => {
      showTagsModal(project)
    })
  }

  // 导出成片
  document.getElementById('exportProjectBtn').addEventListener('click', () => {
    showExportModal(project)
  })

  // R16：AI 海报封面
  document.getElementById('posterBtn').addEventListener('click', () => {
    showPosterModal(project)
  })

  // R15：AI 预告片
  document.getElementById('trailerBtn').addEventListener('click', () => {
    showTrailerModal(project)
  })

  document.getElementById('publishGalleryBtn').addEventListener('click', async () => {
    const btn = document.getElementById('publishGalleryBtn')
    btn.disabled = true
    try {
      const r = await api.publishToGallery(project.id, project.galleryCategory || 'short')
      showToast('已发布到作品广场')
      btn.textContent = '✅ 已发布'
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      btn.disabled = false
    }
  })

  // 导出项目数据
  const exportDataBtn = document.getElementById('exportDataBtn')
  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', () => {
      api.exportProject(project.id)
      showToast('项目数据已导出')
    })
  }

  // 保存为模板
  const saveAsTemplateBtn = document.getElementById('saveAsTemplateBtn')
  if (saveAsTemplateBtn) {
    saveAsTemplateBtn.addEventListener('click', () => {
      showSaveAsTemplateModal(project)
    })
  }

  // 绑定键盘快捷键事件
  bindKeyboardShortcuts(project)

  // 初始化 AI 助手
  initAIAssistant(project)

  renderActiveTab(project)
}

function applyTabState(container = document) {
  const normalized = normalizeTab(currentTab)
  currentTab = normalized
  container.querySelectorAll('.editor-nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.tab === normalized)
  })
  container.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${normalized}`)
  })
}

function switchTab(tabId) {
  currentTab = normalizeTab(tabId)
  rememberTab(currentTab)
  setTabInUrl(currentTab)
  applyTabState()
  if (state.currentProject) renderActiveTab(state.currentProject)
}

/**
 * 绑定键盘快捷键事件
 */
function bindKeyboardShortcuts(project) {
  // 保存版本
  document.addEventListener('editor-save-version', () => {
    const saveBtn = document.getElementById('saveVersionBtn')
    if (saveBtn) saveBtn.click()
    else {
      // 如果在其他标签页，切换到版本标签页并保存
      switchTab('versions')
      setTimeout(() => {
        const btn = document.getElementById('saveVersionBtn')
        if (btn) btn.click()
      }, 100)
    }
  })

  // 导出视频
  document.addEventListener('editor-export', () => {
    const exportBtn = document.getElementById('exportProjectBtn')
    if (exportBtn) exportBtn.click()
  })

  // 生成剧本
  document.addEventListener('editor-generate-script', () => {
    switchTab('script')
    setTimeout(() => {
      const generateBtn = document.getElementById('generateScriptBtn')
      if (generateBtn) generateBtn.click()
    }, 100)
  })

  // 批量生成视频
  document.addEventListener('editor-generate-all', () => {
    switchTab('shots')
    setTimeout(() => {
      const generateAllBtn = document.getElementById('generateAllBtn')
      if (generateAllBtn) generateAllBtn.click()
    }, 100)
  })

  // 切换标签页
  const tabEvents = {
    'editor-tab-script': 'script',
    'editor-tab-images': 'images',
    'editor-tab-characters': 'characters',
    'editor-tab-shots': 'shots',
    'editor-tab-video': 'shots',
    'editor-tab-dubbing': 'dubbing',
    'editor-tab-audio': 'dubbing',
    'editor-tab-edit': 'edit',
    'editor-tab-analysis': 'analysis',
    'editor-tab-collab': 'collab',
    'editor-tab-versions': 'versions',
    'editor-tab-settings': 'settings',
  }

  Object.entries(tabEvents).forEach(([event, tab]) => {
    document.addEventListener(event, () => switchTab(tab))
  })
}

// ========== AI 创作助手 ==========
let aiPanelOpen = false
let aiLoading = false

function initAIAssistant(project) {
  const fab = document.getElementById('aiAssistantFab')
  const panel = document.getElementById('aiAssistantPanel')
  const closeBtn = document.getElementById('aiClosePanelBtn')
  const clearBtn = document.getElementById('aiClearChatBtn')
  const sendBtn = document.getElementById('aiSendBtn')
  const input = document.getElementById('aiMessageInput')
  const quickActionsContainer = document.getElementById('aiQuickActions')

  if (!fab || !panel) return

  // 打开/关闭面板
  fab.addEventListener('click', () => toggleAIPanel())
  closeBtn.addEventListener('click', () => toggleAIPanel(false))

  // 清空对话
  clearBtn.addEventListener('click', async () => {
    if (confirm('确定要清空当前对话吗？')) {
      try {
        await api.clearAIConversation(project.id)
        const messages = document.getElementById('aiMessages')
        messages.innerHTML = `
          <div class="ai-message ai-message-system">
            <div class="ai-message-avatar">🤖</div>
            <div class="ai-message-content">对话已清空。有什么新的问题我可以帮你吗？</div>
          </div>
        `
        showToast('对话已清空', 'success')
      } catch (err) {
        showToast(`清空失败: ${err.message}`, 'error')
      }
    }
  })

  // 发送消息
  const sendMessage = async () => {
    if (aiLoading) return
    const text = input.value.trim()
    if (!text) return

    input.value = ''
    input.style.height = 'auto'
    await sendAIMessage(project.id, text)
  }

  sendBtn.addEventListener('click', sendMessage)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  })

  // 自动调整输入框高度
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  })

  // 加载快捷操作
  loadAIQuickActions(project.id, quickActionsContainer)

  // 加载历史对话
  loadAIConversationHistory(project.id)
}

function toggleAIPanel(force) {
  const panel = document.getElementById('aiAssistantPanel')
  const fab = document.getElementById('aiAssistantFab')
  aiPanelOpen = typeof force === 'boolean' ? force : !aiPanelOpen

  if (aiPanelOpen) {
    panel.classList.add('open')
    fab.classList.add('active')
    setTimeout(() => document.getElementById('aiMessageInput')?.focus(), 300)
  } else {
    panel.classList.remove('open')
    fab.classList.remove('active')
  }
}

async function loadAIQuickActions(projectId, container) {
  try {
    const result = await api.getAIQuickActions()
    const actions = result.actions || []
    container.innerHTML = actions.map((a) => `
      <button class="ai-quick-action-btn" data-action-id="${a.id}" title="${a.prompt}">
        ${a.label}
      </button>
    `).join('')

    container.querySelectorAll('.ai-quick-action-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (aiLoading) return
        const actionId = btn.dataset.actionId
        btn.disabled = true
        btn.textContent = '思考中...'
        try {
          const response = await api.runAIQuickAction(projectId, actionId)
          addAIMessage('assistant', response.content)
        } catch (err) {
          addAIMessage('assistant', `抱歉，操作失败: ${err.message}`)
        } finally {
          btn.disabled = false
          const action = (await api.getAIQuickActions()).actions.find((a) => a.id === actionId)
          btn.textContent = action ? action.label : actionId
        }
      })
    })
  } catch (err) {
    console.warn('Failed to load AI quick actions:', err)
  }
}

async function loadAIConversationHistory(projectId) {
  try {
    const result = await api.getAIConversation(projectId)
    const conversation = result.conversation || []
    if (conversation.length > 0) {
      const messages = document.getElementById('aiMessages')
      messages.innerHTML = ''
      conversation.forEach((msg) => {
        addAIMessage(msg.role, msg.content, false)
      })
      scrollAIMessages()
    }
  } catch (err) {
    console.warn('Failed to load AI conversation history:', err)
  }
}

async function sendAIMessage(projectId, text) {
  addAIMessage('user', text)
  aiLoading = true

  const loadingId = 'ai-loading-' + Date.now()
  addAIMessage('assistant', '<div class="ai-typing"><span></span><span></span><span></span></div>', false, loadingId)

  try {
    const response = await api.sendAIMessage(projectId, text)
    removeAIMessage(loadingId)
    addAIMessage('assistant', response.content)
  } catch (err) {
    removeAIMessage(loadingId)
    addAIMessage('assistant', `抱歉，出错了: ${err.message}`)
  } finally {
    aiLoading = false
  }
}

function addAIMessage(role, content, scroll = true, id = null) {
  const messages = document.getElementById('aiMessages')
  if (!messages) return

  const msgDiv = document.createElement('div')
  msgDiv.className = `ai-message ai-message-${role}`
  if (id) msgDiv.id = id

  const avatar = role === 'user' ? '🧑' : '🤖'
  msgDiv.innerHTML = `
    <div class="ai-message-avatar">${avatar}</div>
    <div class="ai-message-content">${content}</div>
  `
  messages.appendChild(msgDiv)

  if (scroll) scrollAIMessages()
}

function removeAIMessage(id) {
  const msg = document.getElementById(id)
  if (msg) msg.remove()
}

function scrollAIMessages() {
  const messages = document.getElementById('aiMessages')
  if (messages) {
    setTimeout(() => {
      messages.scrollTop = messages.scrollHeight
    }, 50)
  }
}

function renderActiveTab(project) {
  switch (currentTab) {
    case 'script':
      renderScriptTab(project)
      break
    case 'images':
      renderImagesTab(document.getElementById('tab-images'), { project, showToast })
        .catch((error) => showToast(error.message, 'error'))
      break
    case 'characters':
      renderCharactersTab(project)
      break
    case 'scenes':
      renderScenesTab()
      break
    case 'shots':
      renderShotsTab(project)
      break
    case 'dubbing':
      renderDubbingTab(project)
      break
    case 'edit':
      renderEditTab(project)
      break
    case 'analysis':
      renderAnalysisTab(project)
      break
    case 'collab':
      renderCollabTab(project)
      break
    case 'versions':
      renderVersionsTab(project)
      break
    case 'settings':
      renderProjectSettingsTab(project)
      break
  }
}

async function renderEditTab(project) {
  const panel = document.getElementById('tab-edit')
  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">智能剪辑</h2>
      <div class="section-subtitle">按目标时长与节奏自动生成剪辑方案，再渲染成片。</div>
    </div>
    <div class="loading-overlay"><div class="loading"></div><span>加载剪辑能力…</span></div>
  `

  let profiles = []
  let plan = null
  let xfadeSupported = false
  let bgms = []

  try {
    const [profileRes, bgmRes, supportRes] = await Promise.all([
      api.getEditProfiles(),
      api.listBgm({ emotion: 'all', search: '' }),
      api.getTransitionSupport(project.id).catch(() => ({ xfade: false })),
    ])
    profiles = profileRes.items || []
    bgms = bgmRes.items || []
    xfadeSupported = supportRes.xfade === true
  } catch (error) {
    panel.innerHTML = `<div class="empty-state"><div class="empty-state-text">剪辑能力加载失败：${escapeHtml(error.message)}</div></div>`
    return
  }

  try {
    plan = await api.getEditPlan(project.id)
  } catch {
    plan = null
  }

  const bgmOptions = [
    `<option value="">不指定 BGM</option>`,
    ...bgms.map((b) => `<option value="${escapeHtml(b.id)}" ${project.audioConfig?.bgmId === b.id ? 'selected' : ''}>${escapeHtml(b.name)}${b.available ? '' : '（文件缺失）'}</option>`),
  ].join('')

  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">智能剪辑</h2>
      <div class="section-subtitle">规则驱动剪辑方案，不做 ML 内容理解或自动高光识别。</div>
    </div>
    <div class="image-provider-note">
      <span>转场能力：<strong>${xfadeSupported ? 'xfade 淡入淡出可用' : '当前 ffmpeg 不支持 xfade，将降级硬切'}</strong></span>
      <span class="image-provider-badge ${xfadeSupported ? 'real' : 'placeholder'}">${xfadeSupported ? '支持交叉溶解' : '硬切降级'}</span>
    </div>
    <div class="image-gen-form">
      <div class="image-gen-controls">
        <label class="image-gen-control">剪辑风格
          <select class="form-select form-select-sm" id="editProfileSelect">
            ${profiles.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name)} — ${escapeHtml(p.description)}</option>`).join('')}
          </select>
        </label>
        <label class="image-gen-control">目标时长（秒）
          <input type="number" class="form-input form-input-sm" id="editTargetDuration" min="3" max="180" value="${Number(project.targetDuration) || 30}" style="width:120px;" />
        </label>
        <label class="image-gen-control">BGM（用于 BPM 切点）
          <select class="form-select form-select-sm" id="editBgmSelect">${bgmOptions}</select>
        </label>
        <button class="btn btn-primary" id="generateEditPlanBtn">✂️ 生成剪辑方案</button>
        <button class="btn btn-sm" id="clearEditPlanBtn">清除方案</button>
      </div>
    </div>
    <div id="editPlanSection"></div>
  `

  const planSection = panel.querySelector('#editPlanSection')

  function renderPlanSection() {
    if (!plan) {
      planSection.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✂️</div><div class="empty-state-text">还没有剪辑方案，先生成一个。</div></div>'
      return
    }
    planSection.innerHTML = `
      <div class="card" style="margin-top:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
          <div>
            <div style="font-weight:600;">${escapeHtml(plan.summary)}</div>
            <div class="image-asset-meta">
              ${plan.bpm ? `${plan.bpm} BPM · beat ${plan.beatGrid?.toFixed(2)}s` : '无 BPM'} ·
              ${plan.transition === 'fade' ? '淡入淡出' : '硬切'} ·
              总时长 ${plan.totalDuration}s
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="renderEditPlanBtn">🎬 渲染剪辑成片</button>
        </div>
        <table class="edit-plan-table">
          <thead><tr><th>#</th><th>镜头</th><th>入/出</th><th>时长</th><th>转场</th><th>说明</th></tr></thead>
          <tbody>
            ${plan.shots.map((shot) => `
              <tr>
                <td>${shot.index + 1}</td>
                <td>${escapeHtml(shot.shotId)}</td>
                <td>${shot.in}s → ${shot.out}s</td>
                <td>${shot.duration}s</td>
                <td>${shot.transition === 'fade' ? '淡入淡出' : '硬切'}</td>
                <td>${escapeHtml(shot.reason)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div id="editRenderResult" style="margin-top:12px;"></div>
      </div>
    `

    planSection.querySelector('#renderEditPlanBtn').addEventListener('click', async () => {
      const btn = planSection.querySelector('#renderEditPlanBtn')
      btn.disabled = true
      btn.textContent = '渲染中...'
      try {
        const result = await api.renderEditPlan(project.id)
        planSection.querySelector('#editRenderResult').innerHTML = `
          <video controls src="${escapeHtml(result.outputUrl)}" style="width:100%;max-height:360px;border-radius:8px;"></video>
          <div class="image-asset-meta" style="margin-top:6px;">
            ${result.shotCount} 个镜头 · ${Number(result.duration || plan.totalDuration).toFixed(1)}s ·
            转场：${result.transitionApplied === 'xfade' ? 'xfade' : 'cut'}
            ${result.transitionFallback ? '（已降级硬切）' : ''}
            ${result.hasAudio ? ' · 含混音音轨' : ' · 无音轨'}
          </div>
        `
        showToast('剪辑成片渲染完成')
      } catch (error) {
        showToast(error.message, 'error')
      } finally {
        btn.disabled = false
        btn.textContent = '🎬 渲染剪辑成片'
      }
    })
  }

  renderPlanSection()

  panel.querySelector('#generateEditPlanBtn').addEventListener('click', async () => {
    const btn = panel.querySelector('#generateEditPlanBtn')
    btn.disabled = true
    btn.textContent = '生成中...'
    try {
      plan = await api.generateEditPlan({
        projectId: project.id,
        profile: panel.querySelector('#editProfileSelect').value,
        targetDuration: Number(panel.querySelector('#editTargetDuration').value),
        bgmId: panel.querySelector('#editBgmSelect').value || null,
      })
      renderPlanSection()
      showToast('剪辑方案已生成')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '✂️ 生成剪辑方案'
    }
  })

  panel.querySelector('#clearEditPlanBtn').addEventListener('click', async () => {
    try {
      await api.clearEditPlan(project.id)
      plan = null
      renderPlanSection()
      showToast('剪辑方案已清除')
    } catch (error) {
      showToast(error.message, 'error')
    }
  })
}

async function renderScenesTab() {
  const panel = document.getElementById('tab-scenes')
  panel.innerHTML = '<div class="loading-overlay"><div class="loading"></div><span>加载场景库…</span></div>'
  try {
    const data = await api.listScenes()
    const scenes = data.items || []
    panel.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">场景库</h2>
        <div class="section-subtitle">场景在镜头编辑中选择；图片生成页的图片可回填为项目场景参考图。</div>
      </div>
      <div class="scene-library-grid">
        ${scenes.map((scene) => `
          <div class="scene-card">
            ${scene.referenceImage ? `<img class="scene-card-image" src="${escapeHtml(scene.referenceImage)}" alt="${escapeHtml(scene.name)}" loading="lazy" />` : `<div class="scene-card-image scene-card-placeholder">${escapeHtml(scene.category || 'scene')}</div>`}
            <div class="scene-card-body">
              <div class="scene-card-title">${escapeHtml(scene.name)}</div>
              <div class="scene-card-meta">${escapeHtml(scene.category || '')} · ${escapeHtml(scene.lighting || '')} ${scene.isBuiltin ? '· 内置' : '· 自定义'}</div>
              <div class="scene-card-desc">${escapeHtml(scene.description || '')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `
  } catch (error) {
    panel.innerHTML = `<div class="empty-state"><div class="empty-state-text">场景库加载失败：${escapeHtml(error.message)}</div></div>`
  }
}

// ========== 剧本标签 ==========
function renderScriptTab(project) {
  const panel = document.getElementById('tab-script')
  const hasScript = project.script && project.script.shots && project.script.shots.length > 0

  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${i18n.t('generateScript')}</h2>
    </div>

    <div class="script-idea-input">
      <input class="form-input" id="ideaInput" placeholder="${i18n.t('scriptPlaceholder')}" 
        value="${hasScript ? '' : ''}" />
      <button class="btn btn-primary" id="generateScriptBtn">✨ ${i18n.t('generateScript')}</button>
    </div>

    <div id="scriptContent">
      ${hasScript ? renderScriptContent(project.script) : renderScriptEmpty()}
    </div>
  `

  document.getElementById('generateScriptBtn').addEventListener('click', async () => {
    const idea = document.getElementById('ideaInput').value.trim()
    if (!idea) {
      showToast('请输入你的想法', 'error')
      return
    }

    const btn = document.getElementById('generateScriptBtn')
    btn.disabled = true
    btn.innerHTML = '<span class="loading"></span> 生成中...'

    try {
      const script = await api.generateScript({
        idea,
        targetDuration: project.targetDuration,
        platform: project.platform,
        projectId: project.id,
      })

      // 刷新项目数据
      const updated = await api.getProject(project.id)
      Object.assign(project, updated)
      state.currentProject = updated

      document.getElementById('scriptContent').innerHTML = renderScriptContent(script)
      showToast(`剧本生成完成：${script.shots.length} 个分镜，${script.characters.length} 个角色`)
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = '✨ AI 生成剧本'
    }
  })
}

function renderScriptEmpty() {
  return `
    <div class="empty-state" style="padding: 40px;">
      <div class="empty-state-icon">💭</div>
      <div class="empty-state-text">输入一个想法，AI 将为你生成完整的分镜脚本</div>
      <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
        包含：故事梗概、角色设定、分镜表（景别/画面/台词/运镜）
      </div>
    </div>
  `
}

function renderScriptContent(script) {
  return `
    ${
      script.synopsis
        ? `<div class="script-synopsis">📖 ${escapeHtml(script.synopsis)}</div>`
        : ''
    }

    ${
      script.characters && script.characters.length > 0
        ? `
      <div class="section-header" style="margin-top: 20px;">
        <h3 style="font-size: 15px; font-weight: 600;">角色设定</h3>
      </div>
      <div style="display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px;">
        ${script.characters
          .map(
            (c) => `
          <div class="card" style="padding: 14px; flex: 1; min-width: 200px;">
            <div style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(c.name)}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(c.description || '')}</div>
            ${c.personality ? `<div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${escapeHtml(c.personality)}</div>` : ''}
          </div>
        `
          )
          .join('')}
      </div>
    `
        : ''
    }

    <div class="section-header">
      <h3 style="font-size: 15px; font-weight: 600;">分镜表（${script.shots.length} 镜）</h3>
    </div>
    <div class="shot-list">
      ${script.shots.map((shot, i) => renderShotItem(shot, i)).join('')}
    </div>
  `
}

function renderShotItem(shot, index) {
  const shotTypeLabels = {
    'close-up': '特写',
    medium: '中景',
    wide: '远景',
    'extreme-wide': '大远景',
  }
  const cameraLabels = {
    static: '固定',
    slow_push_in: '缓慢推进',
    pull_back: '拉远',
    pan_left: '左摇',
    pan_right: '右摇',
    handheld: '手持',
  }

  return `
    <div class="shot-item">
      <div class="shot-index">${index + 1}</div>
      <div class="shot-body">
        <div class="shot-description">${escapeHtml(shot.description)}</div>
        <div class="shot-meta">
          <span>${shotTypeLabels[shot.shotType] || shot.shotType}</span>
          <span>${cameraLabels[shot.cameraMovement] || shot.cameraMovement}</span>
          <span>${shot.duration}s</span>
        </div>
        ${shot.dialogue ? `<div class="shot-dialogue">💬 ${escapeHtml(shot.dialogue)}</div>` : ''}
        ${shot.narration ? `<div class="shot-dialogue" style="border-left: 2px solid var(--accent);">🎙️ ${escapeHtml(shot.narration)}</div>` : ''}
      </div>
    </div>
  `
}

// ========== 角色标签 ==========
function renderCharactersTab(project) {
  const panel = document.getElementById('tab-characters')
  const characters = project.characters || []

  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${i18n.t('addCharacter')}</h2>
      <button class="btn btn-primary btn-sm" id="addCharacterBtn">+ ${i18n.t('addCharacter')}</button>
    </div>
    <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
      上传参考图锁定角色，AI 将在多镜头中保持角色外貌一致
    </div>

    ${
      characters.length === 0
        ? `
      <div class="empty-state" style="padding: 40px;">
        <div class="empty-state-icon">👤</div>
        <div class="empty-state-text">还没有角色，先去生成剧本或手动创建</div>
      </div>
    `
        : `
      <div class="character-grid">
        ${characters.map((c) => renderCharacterCard(c, project.id)).join('')}
      </div>
    `
    }
  `

  const addBtn = document.getElementById('addCharacterBtn')
  if (addBtn) {
    addBtn.addEventListener('click', () => showCharacterModal(project.id))
  }

  // 锁定角色按钮
  document.querySelectorAll('.lock-character-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      showLockModal(btn.dataset.characterId, project.id)
    })
  })

  // 保存造型按钮（R27）
  document.querySelectorAll('.save-styling-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const characterId = btn.dataset.characterId
      const pid = btn.dataset.projectId
      const card = btn.closest('.character-card')
      const wardrobe = card.querySelector('.styling-wardrobe').value.trim()
      const makeup = card.querySelector('.styling-makeup').value.trim()
      const styling = card.querySelector('.styling-styling').value.trim()
      btn.disabled = true
      const originalText = btn.textContent
      btn.textContent = '保存中…'
      try {
        await api.updateCharacterStyling(characterId, { projectId: pid, wardrobe, makeup, styling })
        showToast('造型已保存')
        const updated = await api.getProject(pid)
        Object.assign(state.currentProject, updated)
        renderCharactersTab(state.currentProject)
      } catch (err) {
        showToast(err.message || '保存失败', 'error')
        btn.disabled = false
        btn.textContent = originalText
      }
    })
  })
}

function renderCharacterCard(character, projectId) {
  const initial = character.name ? character.name[0] : '?'
  return `
    <div class="character-card">
      <div class="character-card-header">
        <div class="character-avatar">${initial}</div>
        <div>
          <div class="character-name">${escapeHtml(character.name)}</div>
          ${
            character.isLocked
              ? '<span class="character-lock-badge">🔒 已锁定</span>'
              : '<span class="character-unlock-badge">未锁定</span>'
          }
        </div>
      </div>
      <div class="character-desc">${escapeHtml(character.description || '暂无描述')}</div>
      ${
        character.referenceImages && character.referenceImages.length > 0
          ? `
        <div class="character-ref-images">
          ${character.referenceImages
            .map(() => '<div class="character-ref-img">🖼️</div>')
            .join('')}
        </div>
      `
          : ''
      }
      <div style="margin-top: 12px;">
        ${
          character.isLocked
            ? `<span class="consistency-score consistency-high">✓ 一致性已启用</span>`
            : `<button class="btn btn-sm lock-character-btn" data-character-id="${character.id}">🔒 上传参考图锁定</button>`
        }
      </div>

      <div class="styling-form" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border, rgba(255,255,255,0.08));">
        <div style="font-size: 12px; font-weight: 600; color: var(--text-secondary); margin-bottom: 10px;">🎨 角色造型</div>
        <div class="form-group">
          <label class="form-label">服装</label>
          <input class="form-input styling-wardrobe" type="text" placeholder="例如：米色风衣+白衬衫+黑色西裤" value="${escapeHtml(character.wardrobe || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">妆容</label>
          <input class="form-input styling-makeup" type="text" placeholder="例如：素颜感、淡眉、裸色唇" value="${escapeHtml(character.makeup || '')}" />
        </div>
        <div class="form-group">
          <label class="form-label">整体造型</label>
          <textarea class="form-textarea styling-styling" rows="2" placeholder="例如：通勤干练 / 古风仙侠 / 赛博朋克">${escapeHtml(character.styling || '')}</textarea>
        </div>
        <button class="btn btn-primary btn-sm btn-block save-styling-btn" data-character-id="${character.id}" data-project-id="${projectId}">💾 保存造型</button>
      </div>
    </div>
  `
}

function showCharacterModal(projectId) {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">新建角色</div>
      <div class="form-group">
        <label class="form-label">角色名称</label>
        <input class="form-input" id="charNameInput" placeholder="例如：小明" />
      </div>
      <div class="form-group">
        <label class="form-label">外貌描述</label>
        <textarea class="form-textarea" id="charDescInput" placeholder="年龄、体型、发型、服装、显著特征..."></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" id="cancelCharBtn">取消</button>
        <button class="btn btn-primary" id="confirmCharBtn">创建</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const close = () => modal.remove()
  modal.addEventListener('click', (e) => e.target === modal && close())
  document.getElementById('cancelCharBtn').addEventListener('click', close)

  document.getElementById('confirmCharBtn').addEventListener('click', async () => {
    const name = document.getElementById('charNameInput').value.trim()
    const description = document.getElementById('charDescInput').value.trim()
    if (!name) {
      showToast('请输入角色名称', 'error')
      return
    }
    try {
      await api.createCharacter({ name, description, projectId })
      showToast('角色创建成功')
      close()
      const updated = await api.getProject(projectId)
      Object.assign(state.currentProject, updated)
      renderCharactersTab(state.currentProject)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}

function showLockModal(characterId, projectId) {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">锁定角色</div>
      <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 16px;">
        上传 1-3 张角色参考图（正面/侧面/全身），AI 将据此保持多镜头角色一致性
      </div>
      <div class="form-group">
        <label class="form-label">参考图 URL（每行一个，MVP 阶段使用 URL）</label>
        <textarea class="form-textarea" id="refImagesInput" placeholder="https://example.com/character-front.jpg&#10;https://example.com/character-side.jpg"></textarea>
      </div>
      <div class="modal-actions">
        <button class="btn" id="cancelLockBtn">取消</button>
        <button class="btn btn-primary" id="confirmLockBtn">锁定角色</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const close = () => modal.remove()
  modal.addEventListener('click', (e) => e.target === modal && close())
  document.getElementById('cancelLockBtn').addEventListener('click', close)

  document.getElementById('confirmLockBtn').addEventListener('click', async () => {
    const urls = document
      .getElementById('refImagesInput')
      .value.split('\n')
      .map((u) => u.trim())
      .filter((u) => u)
    if (urls.length === 0) {
      showToast('请至少输入一张参考图 URL', 'error')
      return
    }
    try {
      await api.lockCharacter(characterId, { referenceImages: urls, projectId })
      showToast('角色锁定成功')
      close()
      const updated = await api.getProject(projectId)
      Object.assign(state.currentProject, updated)
      renderCharactersTab(state.currentProject)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}

// ========== 镜头标签 ==========
function renderShotsTab(project) {
  const panel = document.getElementById('tab-shots')
  const shots = project.shots || []
  const currentStyle = project.style || 'none'
  const totalDuration = shots.reduce((sum, s) => sum + (s.duration || 0), 0)

  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${i18n.t('editorTabs.shots')}</h2>
      <div class="shots-toolbar">
        <div class="style-selector">
          <label class="style-label">${i18n.t('style')}</label>
          <select class="form-select form-select-sm" id="styleSelect">
            ${(state.availableStyles || []).map((s) => `
              <option value="${s.id}" ${s.id === currentStyle ? 'selected' : ''}>
                ${s.icon} ${s.name}
              </option>
            `).join('')}
          </select>
        </div>
        ${
          shots.length > 0
            ? `<button class="btn btn-primary btn-sm" id="generateAllBtn">🎬 ${i18n.t('batchGenerate')}</button>`
            : ''
        }
      </div>
    </div>

    <div id="stylePreview" class="style-preview" style="display:none;"></div>

    ${
      shots.length === 0
        ? `
      <div class="empty-state" style="padding: 40px;">
        <div class="empty-state-icon">🎬</div>
        <div class="empty-state-text">还没有镜头，请先在「剧本」标签生成剧本</div>
      </div>
    `
        : `
      <!-- 时间轴视图 -->
      <div class="storyboard-timeline" id="storyboardTimeline">
        <div class="timeline-header">
          <span style="font-size:13px;color:var(--text-muted);">📋 故事板时间轴（拖拽调整顺序）</span>
          <span style="font-size:13px;color:var(--text-muted);">总时长：<strong style="color:var(--text-primary);">${totalDuration}s</strong> · ${shots.length}个镜头</span>
        </div>
        <div class="timeline-track" id="timelineTrack">
          ${shots.map((shot, idx) => `
            <div class="timeline-clip" draggable="true" data-shot-id="${shot.id}" data-index="${idx}">
              <div class="timeline-clip-thumb">
                ${shot.videoUrl
                  ? `<img src="${shot.videoUrl}#t=0.1" alt="shot ${idx + 1}" style="width:100%;height:100%;object-fit:cover;" />`
                  : `<div class="timeline-clip-placeholder">🎬</div>`
                }
                ${shot.locked ? '<div class="timeline-clip-lock">🔒</div>' : ''}
              </div>
              <div class="timeline-clip-info">
                <span class="timeline-clip-num">${idx + 1}</span>
                <span class="timeline-clip-dur">${shot.duration}s</span>
              </div>
              <div class="timeline-clip-status status-${shot.status}"></div>
            </div>
          `).join('')}
        </div>
      </div>

      <div style="font-size: 13px; color: var(--text-muted); margin: 16px 0 8px;">
        共 ${shots.length} 个镜头，已生成 ${shots.filter((s) => s.status === 'completed').length} 个
      </div>
      <div class="shot-list" id="shotsList">
        ${shots.map((shot) => renderVideoShotItem(shot)).join('')}
      </div>
    `
    }
  `

  // 风格选择
  const styleSelect = document.getElementById('styleSelect')
  if (styleSelect) {
    styleSelect.addEventListener('change', async () => {
      const styleId = styleSelect.value
      try {
        await api.updateProject(project.id, { style: styleId })
        project.style = styleId
        showStylePreview(styleId)
        showToast(`风格已切换为 ${styleSelect.options[styleSelect.selectedIndex].text}`)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  }

  // 显示当前风格预览
  if (currentStyle && currentStyle !== 'none') {
    showStylePreview(currentStyle)
  }

  // 时间轴拖拽排序
  const timelineTrack = document.getElementById('timelineTrack')
  if (timelineTrack) {
    let draggedEl = null
    let draggedShotId = null

    timelineTrack.querySelectorAll('.timeline-clip').forEach((clip) => {
      clip.addEventListener('dragstart', (e) => {
        draggedEl = clip
        draggedShotId = clip.dataset.shotId
        clip.style.opacity = '0.5'
        e.dataTransfer.effectAllowed = 'move'
      })

      clip.addEventListener('dragend', () => {
        clip.style.opacity = '1'
        timelineTrack.querySelectorAll('.timeline-clip').forEach((c) => {
          c.style.border = ''
        })
      })

      clip.addEventListener('dragover', (e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        if (draggedEl && draggedEl !== clip) {
          clip.style.border = '2px solid var(--primary)'
        }
      })

      clip.addEventListener('dragleave', () => {
        clip.style.border = ''
      })

      clip.addEventListener('drop', async (e) => {
        e.preventDefault()
        clip.style.border = ''
        if (!draggedEl || draggedEl === clip) return

        const targetShotId = clip.dataset.shotId
        const clips = Array.from(timelineTrack.querySelectorAll('.timeline-clip'))
        const draggedIndex = clips.findIndex((c) => c.dataset.shotId === draggedShotId)
        const targetIndex = clips.findIndex((c) => c.dataset.shotId === targetShotId)

        if (draggedIndex === -1 || targetIndex === -1) return

        // 重新排列
        const newOrder = shots.map((s) => s.id)
        const [movedId] = newOrder.splice(draggedIndex, 1)
        newOrder.splice(targetIndex, 0, movedId)

        try {
          await api.updateShotOrder(project.id, newOrder)
          showToast('镜头顺序已更新')
          const updated = await api.getProject(project.id)
          Object.assign(state.currentProject, updated)
          renderShotsTab(state.currentProject)
        } catch (err) {
          showToast(err.message, 'error')
        }
      })
    })
  }

  const generateAllBtn = document.getElementById('generateAllBtn')
  if (generateAllBtn) {
    generateAllBtn.addEventListener('click', async () => {
      generateAllBtn.disabled = true
      generateAllBtn.innerHTML = '<span class="loading"></span> 生成中...'
      try {
        await api.generateAllVideos(project.id, { styleId: project.style || 'none' })
        showToast('批量生成已启动（并行模式，约需数秒）')
        refreshQuota()
        // 轮询刷新
        setTimeout(async () => {
          const updated = await api.getProject(project.id)
          Object.assign(state.currentProject, updated)
          renderShotsTab(state.currentProject)
        }, 3000)
      } catch (err) {
        showToast(err.message, 'error')
      } finally {
        generateAllBtn.disabled = false
        generateAllBtn.innerHTML = '🎬 一键生成全部镜头'
      }
    })
  }

  // 单镜头生成
  document.querySelectorAll('.generate-shot-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shotId = btn.dataset.shotId
      const shot = project.shots.find((s) => s.id === shotId)
      if (!shot) return
      if (shot.locked) {
        showToast('该镜头已锁定，请先解锁', 'error')
        return
      }

      btn.disabled = true
      btn.innerHTML = '<span class="loading"></span>'

      try {
        if (shot.status === 'completed') {
          // 已完成镜头：调用重生成 API
          await api.regenerateVideo({
            projectId: project.id,
            shotId: shot.id,
            styleId: project.style || 'none',
          })
          showToast(`镜头 ${shot.index + 1} 重新生成已启动`)
        } else {
          // 首次生成
          await api.generateVideo({
            projectId: project.id,
            shotId: shot.id,
            prompt: shot.description,
            duration: shot.duration,
            aspectRatio: project.platform === 'portrait' ? '9:16' : '16:9',
            styleId: project.style || 'none',
          })
          showToast(`镜头 ${shot.index + 1} 生成已启动`)
        }
        refreshQuota()
        setTimeout(async () => {
          const updated = await api.getProject(project.id)
          Object.assign(state.currentProject, updated)
          renderShotsTab(state.currentProject)
        }, 2500)
      } catch (err) {
        showToast(err.message, 'error')
        btn.disabled = false
        btn.innerHTML = shot.status === 'completed' ? '🔄 重新生成' : '🎬 生成'
      }
    })
  })

  // 候选版本生成
  document.querySelectorAll('.candidate-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shotId = btn.dataset.shotId
      const shot = project.shots.find((s) => s.id === shotId)
      if (!shot) return
      if (shot.locked) {
        showToast('该镜头已锁定，请先解锁', 'error')
        return
      }
      if (!confirm(`将为镜头 ${shot.index + 1} 生成3个候选版本，消耗3次额度，确定继续？`)) return

      btn.disabled = true
      btn.innerHTML = '<span class="loading"></span>'
      try {
        await api.generateCandidates({
          projectId: project.id,
          shotId: shot.id,
          count: 3,
          styleId: project.style || 'none',
        })
        showToast(`镜头 ${shot.index + 1} 候选版本生成已启动（3个）`)
        refreshQuota()
        setTimeout(async () => {
          const updated = await api.getProject(project.id)
          Object.assign(state.currentProject, updated)
          renderShotsTab(state.currentProject)
        }, 3000)
      } catch (err) {
        showToast(err.message, 'error')
        btn.disabled = false
        btn.innerHTML = '🎲 候选(3)'
      }
    })
  })

  // 锁定/解锁镜头
  document.querySelectorAll('.lock-shot-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shotId = btn.dataset.shotId
      const isLocked = btn.dataset.locked === 'true'
      try {
        await api.lockShot(project.id, shotId, !isLocked)
        const shot = project.shots.find((s) => s.id === shotId)
        if (shot) shot.locked = !isLocked
        showToast(isLocked ? '镜头已解锁' : '镜头已锁定，批量生成时将跳过')
        renderShotsTab(state.currentProject)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 切换历史版本
  document.querySelectorAll('.version-switch-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shotId = btn.dataset.shotId
      const versionIndex = parseInt(btn.dataset.versionIndex, 10)
      try {
        await api.switchShotVersion(project.id, shotId, versionIndex)
        showToast('已切换到历史版本')
        const updated = await api.getProject(project.id)
        Object.assign(state.currentProject, updated)
        renderShotsTab(state.currentProject)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 高级编辑：场景选择 + 角色表情动作
  document.querySelectorAll('.advanced-edit-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const shotId = btn.dataset.shotId
      const panel = document.getElementById(`advancedPanel-${shotId}`)
      if (!panel) return

      if (panel.style.display === 'block') {
        panel.style.display = 'none'
        return
      }

      // 加载场景列表
      let scenesData = { items: [] }
      try {
        scenesData = await api.listScenes()
      } catch (_) {}

      const shot = project.shots.find((s) => s.id === shotId)
      if (!shot) return
      const characterActions = shot.characterActions || {}

      // 表情和动作选项（硬编码到前端）
      const expressions = [
        { id: '', name: '默认' },
        { id: 'happy', name: '😊 开心' }, { id: 'angry', name: '😠 愤怒' },
        { id: 'sad', name: '😢 悲伤' }, { id: 'surprised', name: '😲 惊讶' },
        { id: 'scared', name: '😨 恐惧' }, { id: 'calm', name: '😐 平静' },
        { id: 'thinking', name: '🤔 思考' }, { id: 'smiling', name: '🙂 微笑' },
        { id: 'crying', name: '😭 哭泣' }, { id: 'nervous', name: '😰 紧张' },
        { id: 'determined', name: '😤 坚定' },
      ]
      const actions = [
        { id: '', name: '默认' },
        { id: 'walking', name: '🚶 行走' }, { id: 'running', name: '🏃 奔跑' },
        { id: 'sitting', name: '🪑 坐下' }, { id: 'standing-up', name: '🧍 站起' },
        { id: 'turning', name: '🔄 转身' }, { id: 'waving', name: '👋 挥手' },
        { id: 'nodding', name: '😌 点头' }, { id: 'shaking-head', name: '🙅 摇头' },
        { id: 'hugging', name: '🤗 拥抱' }, { id: 'pointing', name: '👉 指向' },
      ]
      const positions = [
        { id: '', name: '默认' },
        { id: 'center', name: '中央' }, { id: 'left', name: '左侧' },
        { id: 'right', name: '右侧' }, { id: 'foreground', name: '前景' },
        { id: 'background', name: '背景' },
      ]

      panel.innerHTML = `
        <div class="card" style="margin: 8px 0;">
          <div style="font-weight:600;margin-bottom:12px;">🎬 镜头高级设置</div>

          <!-- 场景选择 -->
          <div style="margin-bottom:16px;">
            <label class="form-label">场景</label>
            <select class="form-select form-select-sm" id="sceneSelect-${shotId}">
              <option value="">不使用预设场景</option>
              ${scenesData.items.map((s) => `
                <option value="${s.id}" ${shot.sceneId === s.id ? 'selected' : ''}>${s.name}</option>
              `).join('')}
            </select>
          </div>

          <!-- 角色表情动作 -->
          ${(project.characters || []).map((char) => {
            const ca = characterActions[char.id] || {}
            return `
              <div style="border-top:1px solid var(--border-color);padding-top:12px;margin-bottom:12px;">
                <div style="font-weight:600;font-size:13px;margin-bottom:8px;">👤 ${char.name}</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <select class="form-select form-select-sm" data-char-id="${char.id}" data-field="expression" style="flex:1;min-width:100px;">
                    ${expressions.map((e) => `<option value="${e.id}" ${ca.expression === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}
                  </select>
                  <select class="form-select form-select-sm" data-char-id="${char.id}" data-field="action" style="flex:1;min-width:100px;">
                    ${actions.map((a) => `<option value="${a.id}" ${ca.action === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                  </select>
                  <select class="form-select form-select-sm" data-char-id="${char.id}" data-field="position" style="flex:1;min-width:80px;">
                    ${positions.map((p) => `<option value="${p.id}" ${ca.position === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
                  </select>
                </div>
              </div>
            `
          }).join('')}

          <button class="btn btn-primary btn-sm" id="saveAdvanced-${shotId}">💾 保存设置</button>
        </div>
      `
      panel.style.display = 'block'

      // 保存高级设置
      document.getElementById(`saveAdvanced-${shotId}`).addEventListener('click', async () => {
        try {
          const newCharacterActions = {}
          panel.querySelectorAll('select[data-char-id]').forEach((sel) => {
            const charId = sel.dataset.charId
            const field = sel.dataset.field
            if (!newCharacterActions[charId]) newCharacterActions[charId] = {}
            newCharacterActions[charId][field] = sel.value || undefined
          })

          const newSceneId = document.getElementById(`sceneSelect-${shotId}`).value || null
          await api.updateShot(project.id, shotId, {
            sceneId: newSceneId,
            characterActions: newCharacterActions,
          })
          shot.sceneId = newSceneId
          shot.characterActions = newCharacterActions
          showToast('镜头高级设置已保存')
          panel.style.display = 'none'
        } catch (err) {
          showToast(err.message, 'error')
        }
      })
    })
  })

  // 编辑镜头描述
  document.querySelectorAll('.edit-desc-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const shotId = btn.dataset.shotId
      const shot = project.shots.find((s) => s.id === shotId)
      if (!shot) return
      if (shot.locked) {
        showToast('该镜头已锁定，请先解锁', 'error')
        return
      }
      const newDesc = prompt('编辑镜头描述：', shot.description)
      if (newDesc !== null && newDesc.trim() !== '') {
        api.updateShot(project.id, shotId, { description: newDesc.trim() })
          .then(() => {
            shot.description = newDesc.trim()
            showToast('镜头描述已更新')
            renderShotsTab(state.currentProject)
          })
          .catch((err) => showToast(err.message, 'error'))
      }
    })
  })
}

/**
 * 显示风格预览信息
 */
function showStylePreview(styleId) {
  const previewEl = document.getElementById('stylePreview')
  if (!previewEl) return
  if (!styleId || styleId === 'none') {
    previewEl.style.display = 'none'
    return
  }
  const style = (state.availableStyles || []).find((s) => s.id === styleId)
  if (!style) {
    previewEl.style.display = 'none'
    return
  }
  previewEl.style.display = 'block'
  previewEl.innerHTML = `
    <div class="style-preview-card" style="--style-color: ${style.color}">
      <div class="style-preview-icon">${style.icon}</div>
      <div class="style-preview-info">
        <div class="style-preview-name">${style.name}</div>
        <div class="style-preview-desc">${style.description}</div>
        <div class="style-preview-tags">
          ${style.tags.map((t) => `<span class="tag">${t}</span>`).join('')}
        </div>
      </div>
    </div>
  `
}

/**
 * AI 影评分析标签页
 */
function renderAnalysisTab(project) {
  const panel = document.getElementById('tab-analysis')
  const hasShots = project.shots && project.shots.length > 0
  const lastAnalysis = project.lastAnalysis

  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">${i18n.t('analyzeFilm')}</h2>
      ${hasShots ? '<button class="btn btn-primary btn-sm" id="analyzeBtn">🔍 开始分析</button>' : ''}
    </div>

    ${
      !hasShots
        ? `
      <div class="empty-state" style="padding: 40px;">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-text">请先生成剧本和镜头，再进行 AI 影评分析</div>
      </div>
    `
        : !lastAnalysis
        ? `
      <div class="empty-state" style="padding: 40px;">
        <div class="empty-state-icon">🎬</div>
        <div class="empty-state-text">点击上方按钮，让 AI 分析你的作品</div>
        <div style="font-size: 13px; color: var(--text-muted); margin-top: 8px;">
          分析维度：镜头语言 / 叙事结构 / 节奏控制 / 角色一致性
        </div>
      </div>
    `
        : renderAnalysisResults(lastAnalysis)
    }
  `

  const analyzeBtn = document.getElementById('analyzeBtn')
  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
      analyzeBtn.disabled = true
      analyzeBtn.innerHTML = '<span class="loading"></span> 分析中...'
      try {
        const analysis = await api.analyzeProjectSync(project.id)
        project.lastAnalysis = analysis
        Object.assign(state.currentProject, { lastAnalysis: analysis })
        renderAnalysisTab(project)
        showToast('分析完成！')
      } catch (err) {
        showToast(err.message, 'error')
        analyzeBtn.disabled = false
        analyzeBtn.innerHTML = '🔍 开始分析'
      }
    })
  }
}

function renderAnalysisResults(analysis) {
  const dims = analysis.dimensions || {}
  const metrics = analysis.objectiveMetrics || {}
  const scoreColor = (score) => {
    if (score >= 80) return '#10b981'
    if (score >= 60) return '#f59e0b'
    return '#ef4444'
  }

  return `
    <!-- 综合评分 -->
    <div class="analysis-overview">
      <div class="analysis-score-ring" style="--score-color: ${scoreColor(analysis.overallScore)}">
        <div class="score-number">${analysis.overallScore}</div>
        <div class="score-label">综合评分</div>
      </div>
      <div class="analysis-dims">
        ${renderDimBar('镜头语言', dims.cinematography, scoreColor(dims.cinematography))}
        ${renderDimBar('叙事结构', dims.narrative, scoreColor(dims.narrative))}
        ${renderDimBar('节奏控制', dims.pacing, scoreColor(dims.pacing))}
        ${renderDimBar('角色一致性', dims.characterConsistency, scoreColor(dims.characterConsistency))}
      </div>
    </div>

    ${analysis.note ? `<div class="analysis-note">${analysis.note}</div>` : ''}

    <!-- 客观指标 -->
    <div class="analysis-metrics">
      <div class="metric-item"><span class="metric-value">${metrics.shotCount || '-'}</span><span class="metric-label">镜头数</span></div>
      <div class="metric-item"><span class="metric-value">${metrics.totalDuration || '-'}s</span><span class="metric-label">总时长</span></div>
      <div class="metric-item"><span class="metric-value">${metrics.avgShotDuration || '-'}s</span><span class="metric-label">平均镜长</span></div>
      <div class="metric-item"><span class="metric-value">${metrics.dialogueShots || 0}</span><span class="metric-label">含台词镜头</span></div>
      <div class="metric-item"><span class="metric-value">${metrics.shotTypeVariety || 0}</span><span class="metric-label">景别种类</span></div>
      <div class="metric-item"><span class="metric-value">${metrics.activeCharacters || 0}</span><span class="metric-label">活跃角色</span></div>
    </div>

    <!-- 优点 & 不足 -->
    <div class="analysis-columns">
      <div class="analysis-column">
        <h3 class="column-title">✅ 优点</h3>
        <ul class="analysis-list">
          ${(analysis.strengths || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
      <div class="analysis-column">
        <h3 class="column-title">⚠️ 不足</h3>
        <ul class="analysis-list">
          ${(analysis.weaknesses || []).map((s) => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
    </div>

    <!-- 改进建议 -->
    <div class="analysis-suggestions">
      <h3 class="column-title">💡 改进建议</h3>
      <div class="suggestion-list">
        ${(analysis.suggestions || []).map((s, i) => `
          <div class="suggestion-item">
            <span class="suggestion-num">${i + 1}</span>
            <span>${escapeHtml(s)}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <!-- 逐镜点评 -->
    ${
      analysis.shotByShot && analysis.shotByShot.length > 0
        ? `
    <div class="analysis-shots">
      <h3 class="column-title">🎬 逐镜点评</h3>
      <div class="shot-analysis-list">
        ${analysis.shotByShot.map((s) => `
          <div class="shot-analysis-item">
            <span class="shot-analysis-index">镜${s.index}</span>
            <span class="shot-analysis-comment">${escapeHtml(s.comment)}</span>
            <span class="shot-analysis-score" style="color: ${scoreColor(s.score)}">${s.score}分</span>
          </div>
        `).join('')}
      </div>
    </div>
    `
        : ''
    }

    <div style="font-size: 11px; color: var(--text-muted); margin-top: 16px; text-align: center;">
      分析时间：${new Date(analysis.analyzedAt).toLocaleString('zh-CN')}
    </div>
  `
}

function renderDimBar(label, score, color) {
  return `
    <div class="dim-bar-item">
      <div class="dim-bar-label">
        <span>${label}</span>
        <span style="color: ${color}">${score}分</span>
      </div>
      <div class="dim-bar-track">
        <div class="dim-bar-fill" style="width: ${score}%; background: ${color}"></div>
      </div>
    </div>
  `
}

/**
 * 协作标签页：分享 + 评论 + 活动记录
 */
async function renderCollabTab(project) {
  const panel = document.getElementById('tab-collab')

  panel.innerHTML = `
    <div class="loading-overlay">
      <div class="loading"></div>
      <span>加载协作数据...</span>
    </div>
  `

  try {
    const [commentsData, activitiesData, shareData, statsData] = await Promise.all([
      api.getComments(project.id),
      api.getActivities(project.id),
      api.getShareSettings(project.id),
      api.getCommentStats(project.id).catch(() => null),
    ])

    const comments = commentsData.items || []
    const activities = activitiesData.items || []
    const share = shareData
    const stats = statsData

    // 为每条顶级评论加载回复
    const topLevelComments = comments.filter((c) => !c.parentId)
    const commentsWithReplies = await Promise.all(
      topLevelComments.map(async (c) => {
        try {
          const repliesData = await api.getCommentReplies(project.id, c.id)
          c._replies = repliesData.items || []
        } catch (e) {
          c._replies = []
        }
        return c
      })
    )

    panel.innerHTML = `
      <div class="collab-layout">
        <!-- 左侧：评论 -->
        <div class="collab-main">
          <div class="section-header">
            <h2 class="section-title">💬 评论区</h2>
            <div class="comment-stats-bar">
              ${stats ? `
                <span class="comment-stat">📝 ${stats.total} 条</span>
                <span class="comment-stat">✅ ${stats.resolved} 已解决</span>
                <span class="comment-stat">❤️ ${stats.totalLikes} 点赞</span>
                <span class="comment-stat">💬 ${stats.replies} 回复</span>
              ` : `<span style="font-size: 12px; color: var(--text-muted);">${comments.length} 条评论</span>`}
            </div>
          </div>

          <!-- 发表评论 -->
          <div class="comment-input-area">
            <input class="form-input" id="commentUserName" placeholder="你的名字（可选）" style="margin-bottom: 8px;" />
            <textarea class="form-textarea" id="commentInput" placeholder="写下你的评论或建议... 支持 @用户名 提及"></textarea>
            <div style="display: flex; justify-content: flex-end; margin-top: 8px;">
              <button class="btn btn-primary btn-sm" id="submitCommentBtn">发表评论</button>
            </div>
          </div>

          <!-- 评论列表 -->
          <div class="comment-list" id="commentList">
            ${
              commentsWithReplies.length === 0
                ? '<div class="empty-state" style="padding: 30px;"><div class="empty-state-text">还没有评论，来发表第一条吧</div></div>'
                : commentsWithReplies.map((c) => renderCommentItem(c, c._replies)).join('')
            }
          </div>
        </div>

        <!-- 右侧：分享 + 活动记录 -->
        <div class="collab-sidebar">
          <!-- 分享设置 -->
          <div class="collab-card">
            <h3 class="collab-card-title">🔗 项目分享</h3>
            <div class="share-toggle">
              <label class="checkbox-label">
                <input type="checkbox" id="shareToggle" ${share.isPublic ? 'checked' : ''} />
                公开访问
              </label>
            </div>
            ${
              share.isPublic && share.shareToken
                ? `
              <div class="share-link-box">
                <div class="share-link-label">分享链接</div>
                <div class="share-link">${location.origin}/#/share/${share.shareToken}</div>
                <button class="btn btn-sm" id="copyShareLink">复制链接</button>
              </div>
            `
                : '<div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">开启公开访问后可生成分享链接</div>'
            }
          </div>

          <!-- 活动记录 -->
          <div class="collab-card">
            <h3 class="collab-card-title">📋 活动记录</h3>
            <div class="activity-timeline">
              ${
                activities.length === 0
                  ? '<div style="font-size: 12px; color: var(--text-muted); padding: 10px 0;">暂无活动记录</div>'
                  : activities.slice(0, 15).map((a) => renderActivityItem(a)).join('')
              }
            </div>
          </div>
        </div>
      </div>
    `

    // 绑定事件
    bindCollabEvents(project)
  } catch (err) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">加载失败：${err.message}</div>
      </div>
    `
  }
}

function renderCommentItem(comment, replies = []) {
  const time = new Date(comment.createdAt).toLocaleString('zh-CN')
  const likeCount = comment.likeCount || 0
  const isLiked = comment._isLiked || false
  const hasReplies = replies.length > 0

  return `
    <div class="comment-item ${comment.resolved ? 'resolved' : ''}" data-comment-id="${comment.id}">
      <div class="comment-header">
        <span class="comment-author">${escapeHtml(comment.userName)}</span>
        <span class="comment-time">${time}</span>
        ${comment.resolved ? '<span class="comment-badge resolved-badge">已解决</span>' : ''}
        ${comment.parentId ? '<span class="comment-badge reply-badge">回复</span>' : ''}
      </div>
      <div class="comment-content">${highlightMentions(escapeHtml(comment.content))}</div>
      <div class="comment-actions">
        <button class="btn btn-xs comment-like-btn ${isLiked ? 'liked' : ''}" data-comment-id="${comment.id}">
          ${isLiked ? '❤️' : '🤍'} ${likeCount > 0 ? likeCount : '点赞'}
        </button>
        <button class="btn btn-xs comment-reply-btn" data-comment-id="${comment.id}" data-user-name="${escapeHtml(comment.userName)}">
          💬 回复
        </button>
        <button class="btn btn-xs comment-resolve-btn" data-comment-id="${comment.id}">
          ${comment.resolved ? '取消解决' : '标记解决'}
        </button>
        <button class="btn btn-xs comment-delete-btn" data-comment-id="${comment.id}">删除</button>
      </div>
      <div class="comment-reply-area" id="replyArea-${comment.id}" style="display: none;">
        <div class="comment-reply-input">
          <input class="form-input reply-user-name" placeholder="你的名字（可选）" style="margin-bottom: 6px;" />
          <textarea class="form-textarea reply-input" placeholder="回复 @${escapeHtml(comment.userName)}..." rows="2"></textarea>
          <div class="comment-reply-actions">
            <button class="btn btn-primary btn-xs submit-reply-btn" data-comment-id="${comment.id}">发送回复</button>
            <button class="btn btn-xs cancel-reply-btn" data-comment-id="${comment.id}">取消</button>
          </div>
        </div>
      </div>
      ${hasReplies ? `
        <div class="comment-replies">
          ${replies.map((r) => renderReplyItem(r)).join('')}
        </div>
      ` : ''}
    </div>
  `
}

function renderReplyItem(reply) {
  const time = new Date(reply.createdAt).toLocaleString('zh-CN')
  const likeCount = reply.likeCount || 0
  return `
    <div class="reply-item" data-comment-id="${reply.id}">
      <div class="reply-header">
        <span class="reply-author">${escapeHtml(reply.userName)}</span>
        <span class="reply-time">${time}</span>
      </div>
      <div class="reply-content">${highlightMentions(escapeHtml(reply.content))}</div>
      <div class="reply-actions">
        <button class="btn btn-xs comment-like-btn ${reply._isLiked ? 'liked' : ''}" data-comment-id="${reply.id}">
          ${reply._isLiked ? '❤️' : '🤍'} ${likeCount > 0 ? likeCount : ''}
        </button>
        <button class="btn btn-xs comment-delete-btn" data-comment-id="${reply.id}">删除</button>
      </div>
    </div>
  `
}

/**
 * 高亮评论中的 @提及
 */
function highlightMentions(content) {
  return content.replace(/@(\w+)/g, '<span class="mention-highlight">@$1</span>')
}

function renderActivityItem(activity) {
  const time = new Date(activity.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  const typeIcons = {
    comment: '💬',
    script_generated: '📝',
    video_generated: '🎬',
    dubbing: '🎙️',
    export: '📤',
    share: '🔗',
    edit: '✏️',
  }
  const icon = typeIcons[activity.type] || '📌'
  return `
    <div class="activity-item">
      <span class="activity-icon">${icon}</span>
      <div class="activity-content">
        <div class="activity-message">${escapeHtml(activity.message)}</div>
        <div class="activity-time">${time} · ${escapeHtml(activity.userName)}</div>
      </div>
    </div>
  `
}

function bindCollabEvents(project) {
  // 发表评论
  const submitBtn = document.getElementById('submitCommentBtn')
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const input = document.getElementById('commentInput')
      const nameInput = document.getElementById('commentUserName')
      const content = input.value.trim()
      if (!content) {
        showToast('评论内容不能为空', 'error')
        return
      }
      try {
        await api.addComment(project.id, {
          userName: nameInput.value.trim() || '匿名用户',
          content,
        })
        showToast('评论已发表')
        renderCollabTab(project)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  }

  // 解决/取消解决评论
  document.querySelectorAll('.comment-resolve-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commentId = btn.dataset.commentId
      const isResolved = btn.textContent.includes('取消')
      try {
        await api.resolveComment(project.id, commentId, !isResolved)
        renderCollabTab(project)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 删除评论
  document.querySelectorAll('.comment-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commentId = btn.dataset.commentId
      if (confirm('确定删除这条评论吗？')) {
        try {
          await api.deleteComment(project.id, commentId)
          showToast('评论已删除')
          renderCollabTab(project)
        } catch (err) {
          showToast(err.message, 'error')
        }
      }
    })
  })

  // 点赞/取消点赞
  document.querySelectorAll('.comment-like-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commentId = btn.dataset.commentId
      const isLiked = btn.classList.contains('liked')
      const userId = 'current-user' // 使用当前用户标识
      try {
        if (isLiked) {
          await api.unlikeComment(project.id, commentId, userId)
        } else {
          await api.likeComment(project.id, commentId, userId)
        }
        renderCollabTab(project)
      } catch (err) {
        if (err.message !== 'Already liked' && err.message !== 'Not liked') {
          showToast(err.message, 'error')
        }
      }
    })
  })

  // 回复按钮（切换回复框）
  document.querySelectorAll('.comment-reply-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const commentId = btn.dataset.commentId
      const replyArea = document.getElementById(`replyArea-${commentId}`)
      if (replyArea) {
        const isVisible = replyArea.style.display !== 'none'
        replyArea.style.display = isVisible ? 'none' : 'block'
        if (!isVisible) {
          const textarea = replyArea.querySelector('.reply-input')
          if (textarea) textarea.focus()
        }
      }
    })
  })

  // 提交回复
  document.querySelectorAll('.submit-reply-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const commentId = btn.dataset.commentId
      const replyArea = document.getElementById(`replyArea-${commentId}`)
      if (!replyArea) return

      const nameInput = replyArea.querySelector('.reply-user-name')
      const contentInput = replyArea.querySelector('.reply-input')
      const content = contentInput.value.trim()

      if (!content) {
        showToast('回复内容不能为空', 'error')
        return
      }

      try {
        await api.addComment(project.id, {
          userName: nameInput.value.trim() || '匿名用户',
          content,
          parentId: commentId,
        })
        showToast('回复已发送')
        renderCollabTab(project)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 取消回复
  document.querySelectorAll('.cancel-reply-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const commentId = btn.dataset.commentId
      const replyArea = document.getElementById(`replyArea-${commentId}`)
      if (replyArea) {
        replyArea.style.display = 'none'
      }
    })
  })

  // 分享开关
  const shareToggle = document.getElementById('shareToggle')
  if (shareToggle) {
    shareToggle.addEventListener('change', async () => {
      try {
        await api.updateShareSettings(project.id, { isPublic: shareToggle.checked })
        showToast(shareToggle.checked ? '项目已设为公开' : '项目已设为私有')
        renderCollabTab(project)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  }

  // 复制分享链接
  const copyBtn = document.getElementById('copyShareLink')
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const link = copyBtn.previousElementSibling.textContent
      navigator.clipboard.writeText(link).then(() => {
        showToast('链接已复制到剪贴板')
      }).catch(() => {
        showToast('复制失败，请手动复制', 'error')
      })
    })
  }
}

/**
 * 版本历史标签页
 */
async function renderVersionsTab(project) {
  const panel = document.getElementById('tab-versions')

  panel.innerHTML = `
    <div class="loading-overlay">
      <div class="loading"></div>
      <span>加载版本历史...</span>
    </div>
  `

  try {
    const data = await api.getVersions(project.id)
    const versions = data.items || []

    panel.innerHTML = `
      <div class="section-header">
        <h2 class="section-title">📜 ${i18n.t('versions')}</h2>
        <button class="btn btn-primary btn-sm" id="saveVersionBtn">💾 ${i18n.t('saveVersion')}</button>
      </div>

      <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">
        共 ${versions.length} 个版本 · 自动保存关键节点，也可手动保存
      </div>

      ${
        versions.length === 0
          ? `
        <div class="empty-state">
          <div class="empty-state-icon">📜</div>
          <div class="empty-state-text">还没有版本记录</div>
          <div style="font-size: 12px; color: var(--text-muted); margin-top: 6px;">生成剧本或视频后会自动保存版本</div>
        </div>
      `
          : `
        <div class="version-timeline">
          ${versions.map((v, i) => renderVersionItem(v, i === 0)).join('')}
        </div>
      `
      }
    `

    // 绑定事件
    const saveBtn = document.getElementById('saveVersionBtn')
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const label = prompt('版本名称（可选）：', `手动保存 ${new Date().toLocaleString('zh-CN')}`)
        if (label === null) return
        try {
          await api.saveVersion(project.id, { label: label || '手动保存', description: '' })
          showToast('版本已保存')
          renderVersionsTab(project)
        } catch (err) {
          showToast(err.message, 'error')
        }
      })
    }

    // 回滚按钮
    panel.querySelectorAll('.rollback-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const versionId = btn.dataset.versionId
        const versionLabel = btn.dataset.versionLabel
        if (confirm(`确定回滚到「${versionLabel}」吗？\n当前状态会自动保存为新版本。`)) {
          try {
            await api.rollbackVersion(project.id, versionId)
            showToast('已回滚到指定版本')
            // 重新加载项目数据
            const updated = await api.getProject(project.id)
            state.currentProject = updated
            renderVersionsTab(project)
            // 刷新其他标签页数据
            if (currentTab === 'script') renderScriptTab(updated)
            if (currentTab === 'shots') renderShotsTab(updated)
            if (currentTab === 'characters') renderCharactersTab(updated)
          } catch (err) {
            showToast(err.message, 'error')
          }
        }
      })
    })

    // 删除按钮
    panel.querySelectorAll('.delete-version-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const versionId = btn.dataset.versionId
        if (confirm('确定删除这个版本吗？')) {
          try {
            await api.deleteVersion(project.id, versionId)
            showToast('版本已删除')
            renderVersionsTab(project)
          } catch (err) {
            showToast(err.message, 'error')
          }
        }
      })
    })
  } catch (err) {
    panel.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">加载失败：${err.message}</div>
      </div>
    `
  }
}

function renderVersionItem(version, isLatest) {
  const date = new Date(version.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  return `
    <div class="version-item ${isLatest ? 'latest' : ''}">
      <div class="version-marker"></div>
      <div class="version-content">
        <div class="version-header">
          <span class="version-label">${escapeHtml(version.label)}</span>
          ${version.auto ? '<span class="version-badge auto-badge">自动</span>' : '<span class="version-badge manual-badge">手动</span>'}
          ${isLatest ? '<span class="version-badge latest-badge">最新</span>' : ''}
        </div>
        <div class="version-meta">
          <span>${date}</span>
          <span>v${version.versionNumber}</span>
          <span>${version.shotCount} 镜</span>
          <span>${version.completedShots}/${version.shotCount} 完成</span>
          <span>${version.characterCount} 角色</span>
        </div>
        ${version.description ? `<div class="version-desc">${escapeHtml(version.description)}</div>` : ''}
        <div class="version-actions">
          <button class="btn btn-xs rollback-btn" data-version-id="${version.id}" data-version-label="${escapeHtml(version.label)}">
            回滚到此版本
          </button>
          <button class="btn btn-xs delete-version-btn" data-version-id="${version.id}" style="color: var(--danger);">
            删除
          </button>
        </div>
      </div>
    </div>
  `
}

function renderVideoShotItem(shot) {
  const statusLabels = {
    pending: '待生成',
    generating: '生成中',
    completed: '已完成',
    failed: '失败',
  }

  const hasVersions = shot.versions && shot.versions.length > 0

  return `
    <div class="shot-item" data-shot-id="${shot.id}">
      <div class="shot-index">${shot.index + 1}</div>
      <div class="shot-body">
        <div class="shot-description">
          <span class="shot-desc-text">${escapeHtml(shot.description)}</span>
          <button class="btn btn-text btn-sm edit-desc-btn" data-shot-id="${shot.id}" style="margin-left:8px;font-size:12px;">✏️ 编辑</button>
        </div>
        <div class="shot-meta">
          <span class="badge badge-${shot.status}">${statusLabels[shot.status] || shot.status}</span>
          <span>${shot.duration}s</span>
          ${shot.locked ? '<span class="badge" style="background:#666;color:#fff;">🔒 已锁定</span>' : ''}
          ${
            shot.consistencyScore !== null && shot.consistencyScore !== undefined
              ? `<span class="consistency-score ${shot.consistencyScore >= 0.65 ? 'consistency-high' : 'consistency-low'}">
                  一致性 ${Math.round(shot.consistencyScore * 100)}%
                </span>`
              : ''
          }
          ${hasVersions ? `<span style="font-size:12px;color:var(--text-muted);">历史版本: ${shot.versions.length}</span>` : ''}
        </div>
        ${
          shot.videoUrl
            ? `<video class="shot-video" controls src="${shot.videoUrl}" poster=""></video>`
            : shot.status === 'generating'
              ? '<div class="shot-video-placeholder"><span class="loading"></span> 生成中...</div>'
              : ''
        }
        ${shot.errorMessage ? `<div style="color: var(--danger); font-size: 12px; margin-top: 6px;">${escapeHtml(shot.errorMessage)}</div>` : ''}

        ${hasVersions ? `
          <div class="shot-versions" style="margin-top:10px;">
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">历史版本：</div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
              ${shot.versions.map((v, i) => `
                <button class="btn btn-sm version-switch-btn" data-shot-id="${shot.id}" data-version-index="${i}" style="font-size:11px;padding:2px 8px;">
                  v${i + 1} ${v.consistencyScore ? `(${Math.round(v.consistencyScore * 100)}%)` : ''}
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="shot-actions" style="display:flex;flex-direction:column;gap:6px;">
        <button class="btn btn-sm generate-shot-btn" data-shot-id="${shot.id}">
          ${shot.status === 'completed' ? '🔄 重新生成' : '🎬 生成'}
        </button>
        <button class="btn btn-sm candidate-btn" data-shot-id="${shot.id}" style="font-size:12px;">
          🎲 候选(3)
        </button>
        <button class="btn btn-sm lock-shot-btn" data-shot-id="${shot.id}" data-locked="${shot.locked ? 'true' : 'false'}" style="font-size:12px;">
          ${shot.locked ? '🔓 解锁' : '🔒 锁定'}
        </button>
        <button class="btn btn-sm advanced-edit-btn" data-shot-id="${shot.id}" style="font-size:12px;">
          🎭 高级
        </button>
      </div>
    </div>
    <div class="shot-advanced-panel" id="advancedPanel-${shot.id}" style="display:none;"></div>
  `
}

// ========== 配音标签 ==========
async function renderDubbingTab(project) {
  const panel = document.getElementById('tab-dubbing')
  const voices = state.voices || []

  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">一键配音 + 字幕</h2>
    </div>
    <div id="dubbingProviderNote" class="image-provider-note">检测 TTS Provider…</div>

    <div class="card">
      <div class="dubbing-controls">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">配音语言</label>
          <select class="form-select" id="dubbingLanguage">
            <option value="zh">中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">音色</label>
          <select class="form-select" id="dubbingVoice">
            ${voices.map((v) => `<option value="${v.id}">${v.name}</option>`).join('')}
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">语速</label>
          <select class="form-select" id="dubbingSpeed">
            <option value="0.8">慢速</option>
            <option value="1.0" selected>正常</option>
            <option value="1.2">快速</option>
          </select>
        </div>
        <button class="btn btn-primary" id="generateDubbingBtn">🎙️ ${i18n.t('generateDubbing')}</button>
      </div>
    </div>

    <div id="dubbingResult" style="margin-top: 20px;"></div>

    <!-- 音频混音控制 -->
    <div class="card" style="margin-top: 20px;">
      <div style="font-weight: 600; margin-bottom: 16px;">🎵 音频混音（BGM + 音效）</div>

      <!-- BGM 选择 -->
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label class="form-label" style="margin: 0;">背景音乐 (BGM)</label>
          <button class="btn btn-sm btn-outline" id="recommendBgmBtn" style="font-size: 12px;">✨ AI 推荐</button>
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <select class="form-select form-select-sm" id="bgmEmotion" style="flex: 0 0 120px;">
            <option value="all">全部情绪</option>
          </select>
          <input type="text" class="form-input form-input-sm" id="bgmSearch" placeholder="搜索 BGM..." style="flex: 1;" />
        </div>
        <div id="bgmList" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto;"></div>
      </div>

      <!-- 音效选择 -->
      <div style="margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <label class="form-label" style="margin: 0;">音效 (SFX)</label>
          <span id="sfxCount" style="font-size: 12px; color: var(--text-muted);">已选 0 个</span>
        </div>
        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
          <select class="form-select form-select-sm" id="sfxCategory" style="flex: 0 0 120px;">
            <option value="all">全部分类</option>
          </select>
          <input type="text" class="form-input form-input-sm" id="sfxSearch" placeholder="搜索音效..." style="flex: 1;" />
        </div>
        <div id="sfxList" style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 120px; overflow-y: auto;"></div>
      </div>

      <!-- 三轨音量控制 -->
      <div style="border-top: 1px solid var(--border-color); padding-top: 16px;">
        <div style="font-weight: 600; margin-bottom: 12px;">🔊 音量平衡</div>
        <div class="volume-control">
          <label class="volume-label">🎙️ 配音</label>
          <input type="range" class="volume-slider" id="voiceVolume" min="0" max="100" value="100" />
          <span class="volume-value" id="voiceVolumeValue">100%</span>
        </div>
        <div class="volume-control">
          <label class="volume-label">🎵 BGM</label>
          <input type="range" class="volume-slider" id="bgmVolume" min="0" max="100" value="30" />
          <span class="volume-value" id="bgmVolumeValue">30%</span>
        </div>
        <div class="volume-control">
          <label class="volume-label">🔊 音效</label>
          <input type="range" class="volume-slider" id="sfxVolume" min="0" max="100" value="50" />
          <span class="volume-value" id="sfxVolumeValue">50%</span>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 12px;">
          <div style="flex: 1;">
            <label class="form-label" style="font-size: 12px;">BGM 淡入 (秒)</label>
            <input type="number" class="form-input form-input-sm" id="bgmFadeIn" value="2" min="0" max="10" style="width: 80px;" />
          </div>
          <div style="flex: 1;">
            <label class="form-label" style="font-size: 12px;">BGM 淡出 (秒)</label>
            <input type="number" class="form-input form-input-sm" id="bgmFadeOut" value="2" min="0" max="10" style="width: 80px;" />
          </div>
        </div>
        <button class="btn btn-primary btn-sm" id="saveAudioConfigBtn" style="margin-top: 12px;">💾 保存音频配置</button>
        <button class="btn btn-sm" id="previewMixBtn" style="margin-top: 12px; margin-left: 8px;">▶️ 预听混音</button>
        <div id="mixPreviewResult" style="margin-top: 12px;"></div>
      </div>
    </div>

    <!-- 字幕样式自定义 -->
    <div class="card" style="margin-top: 20px;">
      <div style="font-weight: 600; margin-bottom: 16px;">📝 字幕样式</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        <div>
          <label class="form-label">字体</label>
          <select class="form-select form-select-sm" id="subtitleFont">
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Georgia">Georgia</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="PingFang SC">苹方</option>
            <option value="Microsoft YaHei">微软雅黑</option>
            <option value="SimHei">黑体</option>
          </select>
        </div>
        <div>
          <label class="form-label">字号 (<span id="fontSizeLabel">24</span>px)</label>
          <input type="range" class="volume-slider" id="subtitleFontSize" min="14" max="48" value="24" style="width:100%;margin-top:8px;" />
        </div>
        <div>
          <label class="form-label">字体颜色</label>
          <input type="color" class="form-input form-input-sm" id="subtitleFontColor" value="#FFFFFF" style="height:32px;padding:2px;width:80px;" />
        </div>
        <div>
          <label class="form-label">描边颜色</label>
          <input type="color" class="form-input form-input-sm" id="subtitleStrokeColor" value="#000000" style="height:32px;padding:2px;width:80px;" />
        </div>
        <div>
          <label class="form-label">描边宽度 (<span id="strokeWidthLabel">2</span>px)</label>
          <input type="range" class="volume-slider" id="subtitleStrokeWidth" min="0" max="6" value="2" style="width:100%;margin-top:8px;" />
        </div>
        <div>
          <label class="form-label">字幕位置</label>
          <select class="form-select form-select-sm" id="subtitlePosition">
            <option value="bottom">底部</option>
            <option value="top">顶部</option>
            <option value="center">居中</option>
          </select>
        </div>
      </div>

      <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:12px;">
        <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="subtitleBold" /> 粗体
        </label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="subtitleItalic" /> 斜体
        </label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="subtitleShadow" checked /> 阴影
        </label>
        <label style="font-size:13px;display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" id="subtitleBilingual" /> 双语字幕
        </label>
      </div>

      <div id="bilingualOptions" style="display:none;margin-bottom:12px;">
        <label class="form-label">第二语言</label>
        <select class="form-select form-select-sm" id="subtitleSecondaryLang" style="width:150px;">
          <option value="en">English</option>
          <option value="zh">中文</option>
          <option value="ja">日本語</option>
        </select>
      </div>

      <!-- 实时预览 -->
      <div style="background:#000;border-radius:8px;padding:20px;position:relative;height:100px;margin-bottom:12px;overflow:hidden;">
        <div id="subtitlePreview" style="position:absolute;bottom:10px;left:50%;transform:translateX(-50%);color:#fff;text-align:center;line-height:1.4;">
          字幕预览 Subtitle Preview
        </div>
      </div>

      <button class="btn btn-primary btn-sm" id="saveSubtitleStyleBtn">💾 保存字幕样式</button>
    </div>

    <!-- R06：多角色对话配音：角色-音色映射 -->
    <div class="card" style="margin-top: 16px;">
      <div style="font-weight: 600; margin-bottom: 8px;">🎭 角色配音音色</div>
      <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">为每个角色分配独立音色，对话将按角色自动切换</div>
      <div id="dialogueVoiceList">
        ${(project.characters || []).map((c) => `
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;" data-char-id="${c.id}">
            <span style="min-width: 70px; font-size: 13px;">${c.name || '角色'}</span>
            <select class="form-control dialogue-voice-select" data-char-id="${c.id}" style="flex: 1;">
              <option value="">跟随默认音色</option>
            </select>
            <button class="btn btn-sm dialogue-preview-btn" data-char-id="${c.id}" title="试听">▶️</button>
          </div>
        `).join('')}
        ${(project.characters || []).length === 0 ? '<div style="font-size:12px;color:var(--text-secondary);">暂无角色，请先在剧本中生成角色</div>' : ''}
      </div>
      <div style="display: flex; align-items: center; gap: 10px; margin-top: 8px;">
        <span style="font-size: 13px;">句间停顿</span>
        <input type="range" id="dialoguePause" min="0" max="1.5" step="0.1" value="0.4" style="flex: 1;">
        <span id="dialoguePauseVal" style="font-size: 12px; min-width: 36px;">0.4s</span>
      </div>
      <button class="btn btn-primary btn-sm" id="saveDialogueVoicesBtn" style="margin-top: 10px;">💾 保存角色音色</button>
    </div>

    <!-- R08：全局视觉风格锁定 -->
    <div class="card" style="margin-top: 16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom: 8px;">
        <div style="font-weight: 600;">🎨 全局视觉风格锁定</div>
        <label style="font-size: 12px; display:flex; align-items:center; gap:6px;">
          <input type="checkbox" id="visualStyleLocked"> 启用
        </label>
      </div>
      <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 12px;">锁定全片色温/饱和度/对比度，生成时自动注入，保证镜头视觉统一</div>
      ${[
        ['色温', 'visualColorTemp', -100, 100, '冷 ← → 暖'],
        ['饱和度', 'visualSaturation', -100, 100, '低 ← → 高'],
        ['对比度', 'visualContrast', -100, 100, '低 ← → 高'],
        ['亮度', 'visualBrightness', -100, 100, '暗 ← → 亮'],
      ].map(([label, id, min, max]) => `
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="min-width:50px;font-size:13px;">${label}</span>
          <input type="range" id="${id}" min="${min}" max="${max}" step="5" value="0" style="flex:1;">
          <span id="${id}Val" style="font-size:12px;min-width:36px;">0</span>
        </div>
      `).join('')}
      <div style="display:flex;gap:8px;margin-top:10px;">
        <button class="btn btn-primary btn-sm" id="saveVisualStyleBtn">💾 保存视觉风格</button>
        <button class="btn btn-sm" id="checkContinuityBtn">🔗 连续性检查</button>
      </div>
      <div id="continuityWarnings" style="margin-top: 12px;"></div>
    </div>
  `

  document.getElementById('generateDubbingBtn').addEventListener('click', async () => {
    const btn = document.getElementById('generateDubbingBtn')
    btn.disabled = true
    btn.innerHTML = '<span class="loading"></span> 生成中...'

    try {
      const result = await api.generateDubbing({
        projectId: project.id,
        language: document.getElementById('dubbingLanguage').value,
        voiceId: document.getElementById('dubbingVoice').value,
        speed: parseFloat(document.getElementById('dubbingSpeed').value),
        dialogueAssignments: project.dialogueAssignments || {},
        pauseSeconds: project.dialoguePause ?? 0.4,
      })

      if (result.success) {
        document.getElementById('dubbingResult').innerHTML = renderDubbingResult(result)
        showToast(`配音生成完成：${result.audioTracks.length} 条音轨，总时长 ${result.totalDuration.toFixed(1)}s`)
      } else {
        document.getElementById('dubbingResult').innerHTML = `
          <div class="empty-state" style="padding: 30px;">
            <div class="empty-state-icon">📝</div>
            <div class="empty-state-text">${escapeHtml(result.message)}</div>
          </div>
        `
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.innerHTML = '🎙️ 生成配音字幕'
    }
  })

  // 加载音频配置
  const audioConfig = project.audioConfig || {}
  const selectedBgm = audioConfig.bgmId || null
  const selectedSfx = audioConfig.sfxIds || []

  // 设置音量滑块
  document.getElementById('voiceVolume').value = (audioConfig.voiceVolume ?? 1.0) * 100
  document.getElementById('bgmVolume').value = (audioConfig.bgmVolume ?? 0.3) * 100
  document.getElementById('sfxVolume').value = (audioConfig.sfxVolume ?? 0.5) * 100
  document.getElementById('bgmFadeIn').value = audioConfig.bgmFadeIn ?? 2
  document.getElementById('bgmFadeOut').value = audioConfig.bgmFadeOut ?? 2

  // 音量滑块实时更新显示
  const bindVolume = (sliderId, valueId) => {
    const slider = document.getElementById(sliderId)
    const value = document.getElementById(valueId)
    slider.addEventListener('input', () => { value.textContent = slider.value + '%' })
  }
  bindVolume('voiceVolume', 'voiceVolumeValue')
  bindVolume('bgmVolume', 'bgmVolumeValue')
  bindVolume('sfxVolume', 'sfxVolumeValue')

  let previewAudio = null
  function playAudioPreview(url) {
    if (!url) return
    if (!previewAudio) previewAudio = new Audio()
    previewAudio.src = url
    previewAudio.play().catch(() => showToast('试听失败', 'error'))
  }

  // 加载 BGM 列表
  async function loadBgmList() {
    try {
      const emotion = document.getElementById('bgmEmotion').value
      const search = document.getElementById('bgmSearch').value
      const result = await api.listBgm({ emotion, search })
      const list = document.getElementById('bgmList')
      // 填充情绪下拉
      const emotionSelect = document.getElementById('bgmEmotion')
      if (emotionSelect.options.length <= 1) {
        result.emotions.forEach((e) => {
          if (e.id !== 'all') {
            const opt = document.createElement('option')
            opt.value = e.id
            opt.textContent = `${e.icon} ${e.name}`
            emotionSelect.appendChild(opt)
          }
        })
      }
      list.innerHTML = result.items.map((b) => `
        <span class="audio-chip">
          <button class="tag-btn ${selectedBgm === b.id ? 'tag-btn-active' : ''} ${!b.available ? 'tag-btn-disabled' : ''}"
                  data-bgm-id="${b.id}" title="${b.name} (${b.duration}s)">
            ${b.name}${!b.available ? ' ⚠️' : ''}
          </button>
          ${b.available ? `<button class="audio-play-btn" data-preview-url="${b.url}" title="试听 ${b.name}">▶</button>` : ''}
        </span>
      `).join('')
      list.querySelectorAll('.audio-play-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation()
          playAudioPreview(btn.dataset.previewUrl)
        })
      })
      list.querySelectorAll('[data-bgm-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('tag-btn-disabled')) {
            showToast('该 BGM 文件暂不可用', 'error')
            return
          }
          const bgmId = btn.dataset.bgmId
          if (selectedBgm === bgmId) {
            // 取消选择
            list.querySelectorAll('.tag-btn-active').forEach((b) => b.classList.remove('tag-btn-active'))
          } else {
            list.querySelectorAll('.tag-btn-active').forEach((b) => b.classList.remove('tag-btn-active'))
            btn.classList.add('tag-btn-active')
          }
        })
      })
    } catch (err) {
      console.error('Load BGM failed:', err)
    }
  }

  // 加载音效列表
  async function loadSfxList() {
    try {
      const category = document.getElementById('sfxCategory').value
      const search = document.getElementById('sfxSearch').value
      const result = await api.listSfx({ category, search })
      const list = document.getElementById('sfxList')
      const categorySelect = document.getElementById('sfxCategory')
      if (categorySelect.options.length <= 1) {
        result.categories.forEach((c) => {
          if (c.id !== 'all') {
            const opt = document.createElement('option')
            opt.value = c.id
            opt.textContent = `${c.icon} ${c.name}`
            categorySelect.appendChild(opt)
          }
        })
      }
      list.innerHTML = result.items.map((s) => `
        <span class="audio-chip">
          <button class="tag-btn ${selectedSfx.includes(s.id) ? 'tag-btn-active' : ''} ${!s.available ? 'tag-btn-disabled' : ''}"
                  data-sfx-id="${s.id}" title="${s.name}">
            ${s.name}${!s.available ? ' ⚠️' : ''}
          </button>
          ${s.available ? `<button class="audio-play-btn" data-preview-url="${s.url}" title="试听 ${s.name}">▶</button>` : ''}
        </span>
      `).join('')
      list.querySelectorAll('.audio-play-btn').forEach((btn) => {
        btn.addEventListener('click', (event) => {
          event.stopPropagation()
          playAudioPreview(btn.dataset.previewUrl)
        })
      })
      list.querySelectorAll('[data-sfx-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          if (btn.classList.contains('tag-btn-disabled')) {
            showToast('该音效文件暂不可用', 'error')
            return
          }
          btn.classList.toggle('tag-btn-active')
          const count = list.querySelectorAll('.tag-btn-active').length
          document.getElementById('sfxCount').textContent = `已选 ${count} 个`
        })
      })
      document.getElementById('sfxCount').textContent = `已选 ${selectedSfx.length} 个`
    } catch (err) {
      console.error('Load SFX failed:', err)
    }
  }

  loadBgmList()
  loadSfxList()

  document.getElementById('bgmEmotion').addEventListener('change', loadBgmList)
  document.getElementById('bgmSearch').addEventListener('input', debounce(loadBgmList, 300))
  document.getElementById('sfxCategory').addEventListener('change', loadSfxList)
  document.getElementById('sfxSearch').addEventListener('input', debounce(loadSfxList, 300))

  // AI 推荐 BGM
  document.getElementById('recommendBgmBtn').addEventListener('click', async () => {
    try {
      const scriptText = project.script?.synopsis || project.name
      const result = await api.recommendBgm(scriptText)
      showToast(`AI 推荐情绪：${result.emotionName}`)
      document.getElementById('bgmEmotion').value = result.emotion
      await loadBgmList()
      // 自动选中第一个推荐
      const firstBtn = document.querySelector(`[data-bgm-id="${result.recommendations[0]?.id}"]`)
      if (firstBtn && !firstBtn.classList.contains('tag-btn-disabled')) {
        document.querySelectorAll('#bgmList .tag-btn-active').forEach((b) => b.classList.remove('tag-btn-active'))
        firstBtn.classList.add('tag-btn-active')
      }
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  // 保存音频配置
  document.getElementById('saveAudioConfigBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveAudioConfigBtn')
    btn.disabled = true
    btn.textContent = '保存中...'

    try {
      const activeBgm = document.querySelector('#bgmList .tag-btn-active')
      const activeSfx = Array.from(document.querySelectorAll('#sfxList .tag-btn-active')).map((b) => b.dataset.sfxId)

      const newAudioConfig = {
        bgmId: activeBgm ? activeBgm.dataset.bgmId : null,
        sfxIds: activeSfx,
        voiceVolume: parseInt(document.getElementById('voiceVolume').value, 10) / 100,
        bgmVolume: parseInt(document.getElementById('bgmVolume').value, 10) / 100,
        sfxVolume: parseInt(document.getElementById('sfxVolume').value, 10) / 100,
        bgmFadeIn: parseInt(document.getElementById('bgmFadeIn').value, 10) || 0,
        bgmFadeOut: parseInt(document.getElementById('bgmFadeOut').value, 10) || 0,
      }

      await api.updateProject(project.id, { audioConfig: newAudioConfig })
      state.currentProject.audioConfig = newAudioConfig
      showToast('音频配置已保存')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '💾 保存音频配置'
    }
  })

  // R33：TTS provider 口径提示
  api.getProviderStatus()
    .then((status) => {
      const tts = status.tts || {}
      const real = tts.current && tts.current !== 'mock'
      document.getElementById('dubbingProviderNote').innerHTML = `
        <span>当前 TTS Provider：<strong>${escapeHtml(tts.current || 'mock')}</strong></span>
        <span class="image-provider-badge ${real ? 'real' : 'placeholder'}">${real ? '真实语音合成' : '本地占位音（非真实语音）'}</span>
      `
    })
    .catch(() => {
      document.getElementById('dubbingProviderNote').textContent = 'TTS Provider 状态未知'
    })

  // R33：混音预听（使用已保存的音频配置）
  document.getElementById('previewMixBtn').addEventListener('click', async () => {
    const btn = document.getElementById('previewMixBtn')
    btn.disabled = true
    btn.textContent = '生成预听中...'
    try {
      const result = await api.previewAudioMix({
        projectId: project.id,
        language: document.getElementById('dubbingLanguage').value,
        voiceId: document.getElementById('dubbingVoice').value,
        speed: parseFloat(document.getElementById('dubbingSpeed').value),
      })
      document.getElementById('mixPreviewResult').innerHTML = `
        <audio controls src="${escapeHtml(result.url)}" style="width:100%;"></audio>
        <div class="image-asset-meta" style="margin-top:6px;">
          ${result.tracks.length} 轨 · ${result.duration.toFixed(1)}s
          ${result.placeholderVoices ? ' · 包含占位音（非真实语音）' : ''}
        </div>
      `
      showToast('混音预听已生成')
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '▶️ 预听混音'
    }
  })

  // 字幕样式逻辑
  const subtitleStyle = project.subtitleStyle || {}
  // 初始化值
  document.getElementById('subtitleFont').value = subtitleStyle.fontFamily || 'Arial'
  document.getElementById('subtitleFontSize').value = subtitleStyle.fontSize || 24
  document.getElementById('subtitleFontColor').value = subtitleStyle.fontColor || '#FFFFFF'
  document.getElementById('subtitleStrokeColor').value = subtitleStyle.strokeColor || '#000000'
  document.getElementById('subtitleStrokeWidth').value = subtitleStyle.strokeWidth ?? 2
  document.getElementById('subtitlePosition').value = subtitleStyle.position || 'bottom'
  document.getElementById('subtitleBold').checked = subtitleStyle.bold || false
  document.getElementById('subtitleItalic').checked = subtitleStyle.italic || false
  document.getElementById('subtitleShadow').checked = subtitleStyle.shadow !== false
  document.getElementById('subtitleBilingual').checked = subtitleStyle.bilingual || false
  document.getElementById('subtitleSecondaryLang').value = subtitleStyle.secondaryLanguage || 'en'
  document.getElementById('bilingualOptions').style.display = subtitleStyle.bilingual ? 'block' : 'none'

  // 更新预览
  function updateSubtitlePreview() {
    const preview = document.getElementById('subtitlePreview')
    const fontSize = document.getElementById('subtitleFontSize').value
    const fontColor = document.getElementById('subtitleFontColor').value
    const strokeColor = document.getElementById('subtitleStrokeColor').value
    const strokeWidth = document.getElementById('subtitleStrokeWidth').value
    const fontFamily = document.getElementById('subtitleFont').value
    const position = document.getElementById('subtitlePosition').value
    const bold = document.getElementById('subtitleBold').checked
    const italic = document.getElementById('subtitleItalic').checked
    const shadow = document.getElementById('subtitleShadow').checked
    const bilingual = document.getElementById('subtitleBilingual').checked

    document.getElementById('fontSizeLabel').textContent = fontSize
    document.getElementById('strokeWidthLabel').textContent = strokeWidth

    let style = `font-size:${fontSize}px;color:${fontColor};font-family:${fontFamily};`
    if (bold) style += 'font-weight:bold;'
    if (italic) style += 'font-style:italic;'
    if (shadow) style += `text-shadow: 0 0 4px ${strokeColor}, 1px 1px 2px rgba(0,0,0,0.8);`
    if (strokeWidth > 0 && !shadow) style += `-webkit-text-stroke:${strokeWidth}px ${strokeColor};`

    preview.style.cssText = `position:absolute;left:50%;transform:translateX(-50%);text-align:center;line-height:1.4;${style}`
    if (position === 'bottom') { preview.style.bottom = '10px'; preview.style.top = 'auto' }
    else if (position === 'top') { preview.style.top = '10px'; preview.style.bottom = 'auto' }
    else { preview.style.top = '50%'; preview.style.bottom = 'auto'; preview.style.transform = 'translate(-50%,-50%)' }

    preview.innerHTML = bilingual
      ? '字幕预览<br><small style="opacity:0.8;">Subtitle Preview</small>'
      : '字幕预览 Subtitle Preview'
  }

  // 绑定所有控件
  const subtitleControls = ['subtitleFont', 'subtitleFontSize', 'subtitleFontColor', 'subtitleStrokeColor',
    'subtitleStrokeWidth', 'subtitlePosition', 'subtitleBold', 'subtitleItalic', 'subtitleShadow']
  subtitleControls.forEach((id) => {
    const el = document.getElementById(id)
    el.addEventListener('input', updateSubtitlePreview)
    el.addEventListener('change', updateSubtitlePreview)
  })

  document.getElementById('subtitleBilingual').addEventListener('change', (e) => {
    document.getElementById('bilingualOptions').style.display = e.target.checked ? 'block' : 'none'
    updateSubtitlePreview()
  })

  updateSubtitlePreview()

  // 保存字幕样式
  document.getElementById('saveSubtitleStyleBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveSubtitleStyleBtn')
    btn.disabled = true
    btn.textContent = '保存中...'
    try {
      const newStyle = {
        fontFamily: document.getElementById('subtitleFont').value,
        fontSize: parseInt(document.getElementById('subtitleFontSize').value, 10),
        fontColor: document.getElementById('subtitleFontColor').value,
        strokeColor: document.getElementById('subtitleStrokeColor').value,
        strokeWidth: parseInt(document.getElementById('subtitleStrokeWidth').value, 10),
        position: document.getElementById('subtitlePosition').value,
        bold: document.getElementById('subtitleBold').checked,
        italic: document.getElementById('subtitleItalic').checked,
        shadow: document.getElementById('subtitleShadow').checked,
        bilingual: document.getElementById('subtitleBilingual').checked,
        secondaryLanguage: document.getElementById('subtitleSecondaryLang').value,
        marginV: 30,
      }
      await api.updateProject(project.id, { subtitleStyle: newStyle })
      state.currentProject.subtitleStyle = newStyle
      showToast('字幕样式已保存')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '💾 保存字幕样式'
    }
  })

  // ===== R06：角色音色映射 =====
  let availableVoices = []
  try {
    const voiceRes = await api.getVoices()
    availableVoices = voiceRes.voices || []
  } catch (err) {
    availableVoices = []
  }
  document.querySelectorAll('.dialogue-voice-select').forEach((select) => {
    availableVoices.forEach((v) => {
      const opt = document.createElement('option')
      opt.value = v.id
      opt.textContent = `${v.name} (${v.language})`
      select.appendChild(opt)
    })
    const assigned = project.dialogueAssignments?.[select.dataset.charId]
    if (assigned) select.value = assigned
  })

  const pauseInput = document.getElementById('dialoguePause')
  pauseInput.addEventListener('input', () => {
    document.getElementById('dialoguePauseVal').textContent = `${pauseInput.value}s`
  })

  document.getElementById('saveDialogueVoicesBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveDialogueVoicesBtn')
    btn.disabled = true
    btn.textContent = '保存中...'
    try {
      const assignments = {}
      document.querySelectorAll('.dialogue-voice-select').forEach((s) => {
        if (s.value) assignments[s.dataset.charId] = s.value
      })
      await api.updateProject(project.id, { dialogueAssignments: assignments })
      state.currentProject.dialogueAssignments = assignments
      state.currentProject.dialoguePause = parseFloat(pauseInput.value)
      showToast('角色音色已保存')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '💾 保存角色音色'
    }
  })

  // 试听
  document.querySelectorAll('.dialogue-preview-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const charId = btn.dataset.charId
      const select = document.querySelector(`.dialogue-voice-select[data-char-id="${charId}"]`)
      const voiceId = select.value || document.getElementById('dubbingVoice').value
      try {
        const character = (project.characters || []).find((c) => c.id === charId)
        const r = await api.previewVoice({
          text: `你好，我是${character?.name || '角色'}`,
          language: document.getElementById('dubbingLanguage').value,
          voiceId,
        })
        showToast(`已生成试听（${r.duration.toFixed(1)}s）`)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // ===== R08：视觉风格锁定 =====
  const vs = project.visualStyle || {}
  document.getElementById('visualStyleLocked').checked = !!vs.locked
  const vsFields = [['visualColorTemp', 'colorTemperature'], ['visualSaturation', 'saturation'],
    ['visualContrast', 'contrast'], ['visualBrightness', 'brightness']]
  vsFields.forEach(([id, key]) => {
    const input = document.getElementById(id)
    input.value = vs[key] ?? 0
    document.getElementById(`${id}Val`).textContent = input.value
    input.addEventListener('input', () => { document.getElementById(`${id}Val`).textContent = input.value })
  })

  document.getElementById('saveVisualStyleBtn').addEventListener('click', async () => {
    const btn = document.getElementById('saveVisualStyleBtn')
    btn.disabled = true
    btn.textContent = '保存中...'
    try {
      const newVs = {
        locked: document.getElementById('visualStyleLocked').checked,
        colorTemperature: parseInt(document.getElementById('visualColorTemp').value, 10),
        saturation: parseInt(document.getElementById('visualSaturation').value, 10),
        contrast: parseInt(document.getElementById('visualContrast').value, 10),
        brightness: parseInt(document.getElementById('visualBrightness').value, 10),
      }
      await api.updateProject(project.id, { visualStyle: newVs })
      state.currentProject.visualStyle = newVs
      showToast('视觉风格已保存')
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '💾 保存视觉风格'
    }
  })

  // 连续性检查
  document.getElementById('checkContinuityBtn').addEventListener('click', async () => {
    const btn = document.getElementById('checkContinuityBtn')
    btn.disabled = true
    btn.textContent = '检查中...'
    try {
      const r = await api.checkContinuity(project.id)
      const box = document.getElementById('continuityWarnings')
      if (!r.warnings.length) {
        box.innerHTML = '<div style="font-size:12px;color:var(--success);">✓ 未发现连续性问题</div>'
      } else {
        box.innerHTML = r.warnings.map((w) => `
          <div style="font-size:12px;padding:6px 8px;margin-bottom:6px;border-radius:6px;
            background:${w.level === 'warning' ? 'rgba(245,158,11,0.12)' : 'var(--bg-secondary)'};">
            ${w.level === 'warning' ? '⚠️' : 'ℹ️'} ${w.message}
          </div>`).join('')
      }
    } catch (err) {
      showToast(err.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '🔗 连续性检查'
    }
  })
}

function renderDubbingResult(result) {
  return `
    <div class="dubbing-result">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="font-weight: 600;">配音结果</div>
        <div style="font-size: 12px; color: var(--text-muted);">
          ${result.audioTracks.length} 条音轨 · 总时长 ${result.totalDuration.toFixed(1)}s · ${result.subtitles.language} 字幕
          ${result.placeholderVoices ? ' · <span class="image-provider-badge placeholder">占位音，非真实语音</span>' : ''}
        </div>
      </div>

      ${result.audioTracks
        .map(
          (track, i) => `
        <div class="dubbing-track">
          <div class="dubbing-track-index">${i + 1}</div>
          <div class="dubbing-track-text">
            <span style="font-size: 11px; color: var(--text-muted); margin-right: 8px;">
              ${track.type === 'narration' ? '旁白' : '台词'}
            </span>
            ${track.placeholder ? '<span class="image-provider-badge placeholder" style="margin-right:6px;">占位</span>' : ''}
            ${escapeHtml(track.text)}
          </div>
          <div class="dubbing-track-time">${track.startTime.toFixed(1)}s - ${track.endTime.toFixed(1)}s</div>
        </div>
      `
        )
        .join('')}

      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border);">
        <div style="font-size: 13px; font-weight: 500; margin-bottom: 8px;">SRT 字幕文件</div>
        <pre style="background: var(--bg-tertiary); padding: 12px; border-radius: 8px; font-size: 12px; overflow-x: auto; max-height: 200px; overflow-y: auto;">${escapeHtml(result.subtitles.content)}</pre>
      </div>
    </div>
  `
}

// ========== 标签编辑 ==========
function showTagsModal(project) {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal">
      <div class="modal-title">编辑标签</div>
      <div class="modal-desc">用逗号分隔多个标签，例如：科幻, 短片, 实验</div>
      <div class="form-group">
        <input type="text" id="tagsInput" class="form-input" value="${(project.tags || []).join(', ')}" placeholder="输入标签，用逗号分隔" />
      </div>
      <div class="modal-actions">
        <button class="btn" id="cancelTagsBtn">取消</button>
        <button class="btn btn-primary" id="saveTagsBtn">保存</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  const close = () => modal.remove()
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close()
  })
  document.getElementById('cancelTagsBtn').addEventListener('click', close)

  document.getElementById('saveTagsBtn').addEventListener('click', () => {
    const input = document.getElementById('tagsInput').value
    const tags = input
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)

    api
      .updateProject(project.id, { tags })
      .then(() => {
        project.tags = tags
        // 更新页面显示
        const tagsContainer = document.getElementById('projectTagsInline')
        if (tagsContainer) {
          tagsContainer.innerHTML = tags.length > 0
            ? tags.map((t) => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('') + '<button class="btn btn-sm btn-link" id="editTagsBtn" style="font-size: 12px; padding: 0 4px;">+ 编辑</button>'
            : '<span style="color: var(--text-muted); font-size: 12px;">暂无标签</span><button class="btn btn-sm btn-link" id="editTagsBtn" style="font-size: 12px; padding: 0 4px;">+ 编辑</button>'
          // 重新绑定编辑按钮
          const newEditBtn = document.getElementById('editTagsBtn')
          if (newEditBtn) {
            newEditBtn.addEventListener('click', () => showTagsModal(project))
          }
        }
        showToast('标签已更新')
        close()
      })
      .catch((err) => showToast(err.message, 'error'))
  })

  document.getElementById('tagsInput').focus()
}

// ========== 保存为模板 ==========
function showSaveAsTemplateModal(project) {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal-content" style="max-width: 480px;">
      <h3>📋 保存为模板</h3>
      <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">
        将当前项目（含剧本、角色、镜头配置）保存为模板，可在模板市场中使用
      </p>
      <div class="form-group">
        <label>模板名称 *</label>
        <input type="text" id="tplNameInput" value="${escapeHtml(project.name)} - 模板" placeholder="给模板起个名字" />
      </div>
      <div class="form-group">
        <label>模板描述</label>
        <textarea id="tplDescInput" placeholder="描述这个模板的特点和用途" rows="3">${escapeHtml(project.description || '')}</textarea>
      </div>
      <div class="form-group">
        <label>分类</label>
        <select id="tplCategorySelect">
          <option value="自定义">自定义</option>
          <option value="商业">商业</option>
          <option value="生活">生活</option>
          <option value="创意">创意</option>
          <option value="教育">教育</option>
        </select>
      </div>
      <div class="form-group">
        <label>图标</label>
        <select id="tplIconSelect">
          <option value="🎬">🎬 电影</option>
          <option value="📦">📦 产品</option>
          <option value="✈️">✈️ 旅行</option>
          <option value="🎭">🎭 剧情</option>
          <option value="📚">📚 知识</option>
          <option value="🎵">🎵 音乐</option>
          <option value="🍜">🍜 美食</option>
          <option value="💪">💪 健身</option>
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="this.closest('.modal-overlay').remove()">取消</button>
        <button class="btn btn-primary" id="confirmSaveTemplateBtn">保存模板</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  modal.querySelector('#confirmSaveTemplateBtn').addEventListener('click', async () => {
    const name = modal.querySelector('#tplNameInput').value.trim()
    const description = modal.querySelector('#tplDescInput').value.trim()
    const category = modal.querySelector('#tplCategorySelect').value
    const icon = modal.querySelector('#tplIconSelect').value

    if (!name) {
      showToast('请输入模板名称', 'error')
      return
    }

    try {
      await api.createTemplateFromProject({ projectId: project.id, name, description, category, icon })
      showToast('模板保存成功！可在模板市场中查看', 'success')
      modal.remove()
    } catch (err) {
      showToast(`保存失败: ${err.message}`, 'error')
    }
  })

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove()
  })
}

// ========== 导出成片 ==========
function showExportModal(project) {
  const completedShots = (project.shots || []).filter((s) => s.status === 'completed' && s.videoUrl)
  const totalShots = (project.shots || []).length

  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.innerHTML = `
    <div class="modal" style="max-width: 520px;">
      <div class="modal-title">导出成片</div>

      ${
        completedShots.length === 0
          ? `
        <div style="text-align: center; padding: 20px 0; color: var(--text-muted);">
          <div style="font-size: 40px; margin-bottom: 12px;">🎬</div>
          <div>还没有已生成的镜头</div>
          <div style="font-size: 12px; margin-top: 6px;">请先在「镜头」标签生成视频</div>
        </div>
        <div class="modal-actions">
          <button class="btn" id="closeExportBtn">关闭</button>
        </div>
      `
          : `
        <div style="margin-bottom: 16px; font-size: 13px; color: var(--text-secondary);">
          将合成 ${completedShots.length}/${totalShots} 个已完成镜头，自动添加配音和字幕
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">配音语言</label>
            <select class="form-select" id="exportLanguage">
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">音色</label>
            <select class="form-select" id="exportVoice">
              ${(state.voices || []).map((v) => `<option value="${v.id}">${v.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 13px;">
            <input type="checkbox" id="exportBurnSubtitles" checked style="width: 16px; height: 16px;" />
            烧录字幕到视频
          </label>
        </div>

        <div id="exportProgress" style="display: none; margin: 16px 0;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
            <span class="loading"></span>
            <span id="exportProgressText" style="font-size: 13px;">正在合成...</span>
          </div>
          <div style="height: 4px; background: var(--bg-tertiary); border-radius: 2px; overflow: hidden;">
            <div id="exportProgressBar" style="height: 100%; width: 0%; background: var(--accent); transition: width 0.3s;"></div>
          </div>
        </div>

        <div id="exportResult" style="display: none;"></div>

        <div id="exportHistorySection" style="margin-top: 16px;">
          <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px; color: var(--text-secondary);">📦 导出历史</div>
          <div id="exportHistoryList" style="font-size: 12px; color: var(--text-muted);">加载中...</div>
        </div>

        <div class="modal-actions">
          <button class="btn" id="closeExportBtn">关闭</button>
          <button class="btn btn-primary" id="confirmExportBtn">📤 开始导出</button>
        </div>
      `
      }
    </div>
  `
  document.body.appendChild(modal)

  // 加载导出历史
  if (completedShots.length > 0) {
    api.getExportHistory(project.id).then((data) => {
      const list = document.getElementById('exportHistoryList')
      if (!list) return
      const items = data.items || []
      if (items.length === 0) {
        list.innerHTML = '<span style="color: var(--text-muted);">暂无导出记录</span>'
      } else {
        list.innerHTML = items.slice(0, 5).map((item) => {
          const date = new Date(item.exportedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          const size = item.fileSize ? (item.fileSize / 1024 / 1024).toFixed(1) + 'MB' : ''
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border);">
              <span>${date} · ${Math.round(item.duration)}s · ${item.shotCount}镜 ${item.hasAudio ? '· 配音' : ''}</span>
              <a href="${item.outputUrl}" download style="color: var(--accent); text-decoration: none; font-size: 11px;">下载</a>
            </div>
          `
        }).join('')
      }
    }).catch(() => {
      const list = document.getElementById('exportHistoryList')
      if (list) list.innerHTML = '<span style="color: var(--text-muted);">暂无导出记录</span>'
    })
  }

  const close = () => modal.remove()
  modal.addEventListener('click', (e) => e.target === modal && close())
  const closeBtn = document.getElementById('closeExportBtn')
  if (closeBtn) closeBtn.addEventListener('click', close)

  const confirmBtn = document.getElementById('confirmExportBtn')
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true
      confirmBtn.innerHTML = '<span class="loading"></span> 导出中...'

      const progressDiv = document.getElementById('exportProgress')
      const progressText = document.getElementById('exportProgressText')
      const progressBar = document.getElementById('exportProgressBar')
      const resultDiv = document.getElementById('exportResult')

      progressDiv.style.display = 'block'
      progressBar.style.width = '20%'
      progressText.textContent = '正在生成配音...'

      try {
        progressBar.style.width = '50%'
        progressText.textContent = '正在合成视频...'

        // 使用同步导出接口（等待完成）
        const result = await api.exportProjectSync(project.id, {
          burnSubtitles: document.getElementById('exportBurnSubtitles').checked,
          language: document.getElementById('exportLanguage').value,
          voiceId: document.getElementById('exportVoice').value,
          speed: 1.0,
        })

        progressBar.style.width = '100%'
        progressText.textContent = '导出完成！'

        resultDiv.style.display = 'block'
        resultDiv.innerHTML = `
          <div style="background: var(--bg-tertiary); border-radius: 8px; padding: 16px; margin-top: 12px;">
            <div style="font-weight: 600; margin-bottom: 8px; color: var(--success);">✓ 导出成功</div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">
              ${result.shotCount} 个镜头 · ${result.duration ? result.duration.toFixed(1) : '?'} 秒
              ${result.hasAudio ? '· 含配音' : ''}
              ${result.hasSubtitles ? '· 含字幕' : ''}
            </div>
            <video controls style="width: 100%; border-radius: 8px; background: #000;" src="${result.downloadUrl}"></video>
            <div style="margin-top: 12px;">
              <a href="${result.downloadUrl}" download="dreamreel_export.mp4" class="btn btn-primary" style="text-decoration: none; display: inline-flex;">
                ⬇️ 下载成片
              </a>
            </div>
          </div>
        `

        showToast('成片导出成功')
        confirmBtn.style.display = 'none'
      } catch (err) {
        progressDiv.style.display = 'none'
        showToast(err.message, 'error')
        confirmBtn.disabled = false
        confirmBtn.innerHTML = '📤 开始导出'
      }
    })
  }
}

function escapeHtml(str) {
  if (!str) return ''
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// ========== R16：AI 海报封面模态 ==========
async function showPosterModal(project) {
  const options = await api.getPosterOptions()
  const modal = createOverlayModal()
  modal.innerHTML = `
    <div class="card" style="width:92%;max-width:520px;padding:22px;max-height:90vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-weight:700;font-size:16px;">🖼️ AI 海报与封面</div>
        <button class="btn btn-sm modal-close">✕</button>
      </div>
      <label style="font-size:12px;">版式</label>
      <select class="form-control" id="pmFormat" style="margin-bottom:12px;">
        ${options.formats.map((f) => `<option value="${f.id}">${f.name} (${f.ratio})</option>`).join('')}
      </select>
      <label style="font-size:12px;">风格</label>
      <select class="form-control" id="pmStyle" style="margin-bottom:16px;">
        ${options.styles.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
      </select>
      <button class="btn btn-primary" id="pmGenerate" style="width:100%;">✨ 生成海报</button>
      <div id="pmResult" style="margin-top:16px;"></div>
    </div>
  `
  document.body.appendChild(modal)
  bindClose(modal)

  modal.querySelector('#pmGenerate').addEventListener('click', async () => {
    const btn = modal.querySelector('#pmGenerate')
    btn.disabled = true
    btn.textContent = '生成中...'
    try {
      const r = await api.generatePoster({
        projectId: project.id,
        format: modal.querySelector('#pmFormat').value,
        style: modal.querySelector('#pmStyle').value,
      })
      renderPosterResult(modal.querySelector('#pmResult'), r.poster)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '✨ 生成海报'
    }
  })
}

function renderPosterResult(box, p) {
  const isBottom = p.layout.titlePosition === 'bottom'
  box.innerHTML = `
    <div style="position:relative;width:100%;aspect-ratio:${p.format.width}/${p.format.height};max-height:420px;
      margin:0 auto;border-radius:10px;overflow:hidden;
      background:#222 ${p.heroImageUrl ? `url(${p.heroImageUrl}) center/cover` : ''};">
      <div style="position:absolute;inset:0;background:${p.style.overlay};"></div>
      <div style="position:absolute;left:0;right:0;${isBottom ? 'bottom:8%' : 'top:50%;transform:translateY(-50%)'};
        text-align:center;padding:0 16px;color:#fff;">
        <div style="font-size:13px;letter-spacing:2px;color:${p.style.accent};">${p.tagline}</div>
        <div style="font-size:${p.format.id === 'square' ? 26 : 22}px;font-weight:800;margin:10px 0;
          text-shadow:0 2px 8px rgba(0,0,0,0.6);">${p.title}</div>
        <div style="font-size:11px;opacity:0.9;">${p.subline}</div>
        <div style="font-size:10px;margin-top:10px;opacity:0.7;letter-spacing:1px;">${p.credits}</div>
      </div>
    </div>
    <div style="text-align:center;font-size:11px;color:var(--text-secondary);margin-top:8px;">
      ${p.format.name} · ${p.format.width}×${p.format.height}
    </div>
  `
}

// ========== R15：AI 预告片模态 ==========
async function showTrailerModal(project) {
  const modal = createOverlayModal()
  modal.innerHTML = `
    <div class="card" style="width:92%;max-width:560px;padding:22px;max-height:90vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <div style="font-weight:700;font-size:16px;">🎞️ AI 预告片</div>
        <button class="btn btn-sm modal-close">✕</button>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
        <span style="font-size:13px;">目标时长</span>
        <input type="range" id="trDuration" min="10" max="40" step="5" value="20" style="flex:1;">
        <span id="trDurationVal" style="font-size:12px;min-width:36px;">20s</span>
      </div>
      <button class="btn btn-primary" id="trGenerate" style="width:100%;">✨ 自动生成预告片</button>
      <div id="trResult" style="margin-top:16px;"></div>
    </div>
  `
  document.body.appendChild(modal)
  bindClose(modal)

  const durInput = modal.querySelector('#trDuration')
  durInput.addEventListener('input', () => {
    modal.querySelector('#trDurationVal').textContent = `${durInput.value}s`
  })

  modal.querySelector('#trGenerate').addEventListener('click', async () => {
    const btn = modal.querySelector('#trGenerate')
    btn.disabled = true
    btn.textContent = '生成中...'
    try {
      const r = await api.generateTrailer({
        projectId: project.id,
        targetDuration: parseInt(durInput.value, 10),
      })
      if (!r.success) { showToast(r.message, 'error'); return }
      renderTrailerResult(modal.querySelector('#trResult'), r)
    } catch (e) {
      showToast(e.message, 'error')
    } finally {
      btn.disabled = false
      btn.textContent = '✨ 自动生成预告片'
    }
  })
}

function renderTrailerResult(box, r) {
  box.innerHTML = `
    <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px;">
      悬念字幕：<span style="color:var(--primary);">${r.teaserText}</span>
    </div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">
      选取 ${r.pickedShotCount} 个高光镜头 · 快节奏 · 总时长 ${r.totalDuration}s
    </div>
    <div style="display:flex;flex-direction:column;gap:6px;">
      ${r.sequence.map((item) => {
        if (item.type === 'shot') {
          return `<div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:8px;font-size:12px;">
            <span>🎬</span><span>镜头 ${item.sourceShotIndex + 1}</span>
            <span style="margin-left:auto;color:var(--text-secondary);">${item.duration}s</span>
          </div>`
        }
        return `<div style="padding:10px;text-align:center;background:linear-gradient(135deg,#111,#333);
          color:#fff;border-radius:8px;font-size:13px;letter-spacing:1px;">
          ${item.text} <span style="opacity:0.6;font-size:11px;">(${item.duration}s)</span>
        </div>`
      }).join('')}
    </div>
  `
}

// ========== 项目设置标签 ==========
function renderProjectSettingsTab(project) {
  const panel = document.getElementById('tab-settings')
  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">⚙️ 项目设置</h2>
    </div>
    <div class="settings-layout">
      <!-- 左侧：模型配置 -->
      <div class="settings-main">
        <div class="settings-card">
          <h3 class="settings-card-title">🤖 AI 模型配置</h3>
          <p class="settings-card-desc">为当前项目自定义各阶段使用的 AI 模型。留空则使用全局默认值。</p>
          <div id="projectModelConfig">
            <div class="provider-selector-loading">
              <div class="loading"></div>
              <span>加载模型配置...</span>
            </div>
          </div>
        </div>
      </div>
      <!-- 右侧：项目信息 -->
      <div class="settings-sidebar">
        <div class="settings-card">
          <h3 class="settings-card-title">📋 项目信息</h3>
          <div class="info-list">
            <div class="info-item">
              <span class="info-key">项目 ID</span>
              <span class="info-value info-value-small">${project.id}</span>
            </div>
            <div class="info-item">
              <span class="info-key">创建时间</span>
              <span class="info-value">${new Date(project.createdAt).toLocaleString('zh-CN')}</span>
            </div>
            <div class="info-item">
              <span class="info-key">更新时间</span>
              <span class="info-value">${new Date(project.updatedAt).toLocaleString('zh-CN')}</span>
            </div>
            <div class="info-item">
              <span class="info-key">平台</span>
              <span class="info-value">${project.platform === 'portrait' ? '竖屏 (9:16)' : '横屏 (16:9)'}</span>
            </div>
            <div class="info-item">
              <span class="info-key">目标时长</span>
              <span class="info-value">${project.targetDuration || 60} 秒</span>
            </div>
            <div class="info-item">
              <span class="info-key">镜头数</span>
              <span class="info-value">${project.shots?.length || 0}</span>
            </div>
            <div class="info-item">
              <span class="info-key">角色数</span>
              <span class="info-value">${project.characters?.length || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  // 初始化 ProviderSelector
  const configContainer = document.getElementById('projectModelConfig')
  if (configContainer) {
    const selector = new ProviderSelector(configContainer, {
      mode: 'project',
      projectId: project.id,
      onChange: (stage, value) => {
        // 实时变更，不自动保存
      },
      onSave: (preferences) => {
        // 保存成功后更新本地 project 对象
        project.providerPreferences = preferences
      },
    })
    selector.init().catch(() => {
      configContainer.innerHTML = '<div class="settings-hint">加载模型配置失败，请刷新重试</div>'
    })
  }
}

// ========== 通用模态工具 ==========
function createOverlayModal() {
  const modal = document.createElement('div')
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1200;'
  return modal
}

function bindClose(modal) {
  const closeBtn = modal.querySelector('.modal-close')
  if (closeBtn) closeBtn.addEventListener('click', () => modal.remove())
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })
}
