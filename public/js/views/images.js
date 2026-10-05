import { api } from '../api.js'

const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3']
const STYLES = [
  { id: 'cinematic', name: '电影感' },
  { id: 'realistic', name: '写实' },
  { id: 'anime', name: '动漫' },
  { id: 'watercolor', name: '水彩' },
  { id: 'minimal', name: '极简' },
]

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function renderImagesTab(panel, { project, showToast }) {
  if (!panel || !project) return

  let assets = []
  let providers = { current: 'mock', models: [] }
  let loading = false
  let form = { prompt: '', aspectRatio: '16:9', style: 'cinematic', count: 1 }

  panel.innerHTML = `
    <div class="section-header">
      <h2 class="section-title">图片生成</h2>
      <div class="section-subtitle">先生成视觉资产，再作为镜头 / 角色 / 场景参考图进入视频生成。</div>
    </div>
    <div id="imagesProviderNote" class="image-provider-note">加载 provider 状态中…</div>
    <div class="image-gen-form">
      <label class="form-label">画面描述</label>
      <textarea class="form-input" id="imagePromptInput" rows="3" placeholder="例如：雨夜霓虹街头，主角撑伞回望，电影感广角"></textarea>
      <div class="image-gen-controls">
        <label class="image-gen-control">比例
          <select class="form-select form-select-sm" id="imageAspectSelect">
            ${ASPECT_RATIOS.map((r) => `<option value="${r}">${r}</option>`).join('')}
          </select>
        </label>
        <label class="image-gen-control">风格
          <select class="form-select form-select-sm" id="imageStyleSelect">
            ${STYLES.map((s) => `<option value="${s.id}">${s.name}</option>`).join('')}
          </select>
        </label>
        <label class="image-gen-control">数量
          <select class="form-select form-select-sm" id="imageCountSelect">
            ${[1, 2, 3, 4].map((n) => `<option value="${n}">${n}</option>`).join('')}
          </select>
        </label>
        <button class="btn btn-primary" id="generateImagesBtn">✨ 生成图片</button>
      </div>
    </div>
    <div class="section-header">
      <h2 class="section-title">项目图片资产</h2>
      <button class="btn btn-sm" id="refreshImagesBtn">刷新</button>
    </div>
    <div id="imageAssetGrid" class="image-asset-grid"></div>
  `

  const providerNote = panel.querySelector('#imagesProviderNote')
  const grid = panel.querySelector('#imageAssetGrid')
  const generateBtn = panel.querySelector('#generateImagesBtn')
  const promptInput = panel.querySelector('#imagePromptInput')

  function renderProviderNote() {
    const current = providers.models?.find((p) => p.id === providers.current)
    const real = current?.realGeneration === true
    const configured = current?.configured !== false
    providerNote.innerHTML = `
      <span>当前图片 Provider：<strong>${escapeHtml(current?.name || providers.current)}</strong></span>
      <span class="image-provider-badge ${real ? 'real' : 'placeholder'}">${real ? '真实文生图' : '本地 Mock 渲染（真实 PNG，非云端模型）'}</span>
      ${configured ? '' : '<span class="image-provider-warning">当前 Provider 未配置 Key</span>'}
    `
  }

  function targetOptions(targetType) {
    if (targetType === 'character') {
      return (project.characters || []).map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name || c.id)}</option>`).join('')
    }
    if (targetType === 'scene') {
      return (project.scenes || []).map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name || s.id)}</option>`).join('')
    }
    return (project.shots || [])
      .map((s, index) => `<option value="${escapeHtml(s.id)}">镜头 ${index + 1}：${escapeHtml((s.description || '').slice(0, 16))}</option>`)
      .join('')
  }

  function renderAssets() {
    if (assets.length === 0) {
      grid.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🖼️</div><div class="empty-state-text">还没有图片资产，先生成一张试试。</div></div>'
      return
    }

    grid.innerHTML = assets.map((asset) => `
      <div class="image-asset-card" data-asset-id="${escapeHtml(asset.id)}">
        <div class="image-asset-thumb">
          ${asset.status === 'completed' && asset.url
            ? `<img src="${escapeHtml(asset.url)}" alt="${escapeHtml(asset.prompt)}" loading="lazy" />`
            : `<div class="image-asset-placeholder">${asset.status === 'failed' ? '生成失败' : '生成中…'}</div>`}
          <span class="image-asset-status ${escapeHtml(asset.status)}">${escapeHtml(asset.status)}</span>
        </div>
        <div class="image-asset-body">
          <div class="image-asset-prompt" title="${escapeHtml(asset.prompt)}">${escapeHtml(asset.prompt)}</div>
          <div class="image-asset-meta">${escapeHtml(asset.size)} · ${escapeHtml(asset.provider)} · ${escapeHtml(asset.style)}</div>
          ${asset.textRendered === false ? '<div class="image-asset-warning">未渲染文字（字体不可用），图片本身有效</div>' : ''}
          ${asset.errorMessage ? `<div class="image-asset-warning">${escapeHtml(asset.errorMessage)}</div>` : ''}
        </div>
        <div class="image-asset-actions">
          <select class="form-select form-select-sm image-target-type">
            <option value="shot">镜头参考图</option>
            <option value="character">角色参考图</option>
            <option value="scene">场景参考图</option>
          </select>
          <select class="form-select form-select-sm image-target-id">${targetOptions('shot')}</select>
          <button class="btn btn-sm btn-primary apply-image-btn" ${asset.status !== 'completed' ? 'disabled' : ''}>应用</button>
          <button class="btn btn-sm btn-danger delete-image-btn">删除</button>
        </div>
      </div>
    `).join('')
  }

  async function loadAssets() {
    const result = await api.listImageAssets({ projectId: project.id })
    assets = result.items || []
    renderAssets()
  }

  providerNote.textContent = '加载 provider 状态中…'
  renderAssets()

  try {
    providers = await api.getImageProviders()
    renderProviderNote()
  } catch (error) {
    providerNote.textContent = `Provider 状态加载失败：${error.message}`
  }

  try {
    await loadAssets()
  } catch (error) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-state-text">图片资产加载失败：${escapeHtml(error.message)}</div></div>`
  }

  generateBtn.addEventListener('click', async () => {
    if (loading) return
    const prompt = promptInput.value.trim()
    if (!prompt) {
      showToast('请输入画面描述', 'error')
      return
    }
    form = {
      prompt,
      aspectRatio: panel.querySelector('#imageAspectSelect').value,
      style: panel.querySelector('#imageStyleSelect').value,
      count: Number(panel.querySelector('#imageCountSelect').value),
    }
    loading = true
    generateBtn.disabled = true
    generateBtn.textContent = '生成中…'
    try {
      const result = await api.generateImages({ projectId: project.id, ...form })
      const failed = (result.assets || []).filter((a) => a.status === 'failed').length
      if (failed > 0) {
        showToast(`生成完成，其中 ${failed} 张失败`, 'error')
      } else {
        showToast(`已生成 ${result.count} 张图片`)
      }
      promptInput.value = ''
      await loadAssets()
    } catch (error) {
      showToast(error.message, 'error')
    } finally {
      loading = false
      generateBtn.disabled = false
      generateBtn.textContent = '✨ 生成图片'
    }
  })

  panel.querySelector('#refreshImagesBtn').addEventListener('click', async () => {
    try {
      await loadAssets()
      showToast('图片资产已刷新')
    } catch (error) {
      showToast(error.message, 'error')
    }
  })

  grid.addEventListener('change', (event) => {
    const select = event.target.closest('.image-target-type')
    if (!select) return
    const card = select.closest('.image-asset-card')
    const targetIdSelect = card.querySelector('.image-target-id')
    targetIdSelect.innerHTML = targetOptions(select.value)
  })

  grid.addEventListener('click', async (event) => {
    const card = event.target.closest('.image-asset-card')
    if (!card) return
    const assetId = card.dataset.assetId

    if (event.target.closest('.apply-image-btn')) {
      const targetType = card.querySelector('.image-target-type').value
      const targetId = card.querySelector('.image-target-id').value
      if (!targetId) {
        showToast('当前项目没有可应用的目标对象', 'error')
        return
      }
      try {
        await api.applyImageAsset(assetId, { targetType, targetId, projectId: project.id })
        showToast('已设为参考图')
      } catch (error) {
        showToast(error.message, 'error')
      }
      return
    }

    if (event.target.closest('.delete-image-btn')) {
      try {
        await api.deleteImageAsset(assetId)
        showToast('图片已删除')
        await loadAssets()
      } catch (error) {
        showToast(error.message, 'error')
      }
    }
  })
}

export default renderImagesTab
