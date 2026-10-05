/**
 * ProviderSelector 组件
 * Phase 1: 支持 Video/LLM/TTS 三阶段 Provider 级联选择
 * 用法：
 *   const selector = new ProviderSelector(container, {
 *     mode: 'project' | 'user',      // project=项目级配置，user=用户全局默认
 *     projectId: 'xxx',              // mode='project' 时必填
 *     onChange: (stage, value) => {}, // 变更回调
 *     onSave: (preferences) => {},   // 保存回调（仅 mode='project' 时内部触发）
 *   })
 *   await selector.init()
 */

import { api } from '../api.js'
import { showToast } from '../app.js'

const STAGE_LABELS = {
  video: { icon: '🎬', name: '视频生成', hint: '控制每个镜头的 AI 视频生成模型' },
  llm: { icon: '🤖', name: '剧本 / 影评', hint: '控制剧本生成、改编和影评的 LLM 模型' },
  tts: { icon: '🔊', name: '配音字幕', hint: '控制 TTS 配音和音色预览的模型' },
}

const SOURCE_LABELS = {
  'project': { text: '项目自定义', class: 'source-project' },
  'user-default': { text: '用户默认', class: 'source-user' },
  'global-default': { text: '全局默认', class: 'source-global' },
  'fallback': { text: '安全回退', class: 'source-fallback' },
}

export class ProviderSelector {
  constructor(container, options = {}) {
    this.container = container
    this.mode = options.mode || 'project'
    this.projectId = options.projectId || null
    this.onChange = options.onChange || (() => {})
    this.onSave = options.onSave || (() => {})
    this.catalog = null
    this.preferences = null
    this.resolved = null
    this.loading = false
  }

  async init() {
    this.loading = true
    this.renderLoading()

    try {
      // 并行拉取目录和当前配置
      const [catalog, config] = await Promise.all([
        api.getAvailableProviderCatalog(),
        this.mode === 'project'
          ? api.getProjectModelConfig(this.projectId)
          : api.getUserModelPreferences(),
      ])

      this.catalog = catalog
      this.preferences = config.preferences || { video: null, llm: null, tts: null, updatedAt: null }
      this.resolved = config.resolved || {}
      this.loading = false
      this.render()
      this.bindEvents()
    } catch (err) {
      this.loading = false
      this.renderError(err.message)
    }
  }

  renderLoading() {
    this.container.innerHTML = `
      <div class="provider-selector-loading">
        <div class="loading"></div>
        <span>加载模型配置...</span>
      </div>
    `
  }

  renderError(message) {
    this.container.innerHTML = `
      <div class="provider-selector-error">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">加载失败：${message}</div>
        <button class="btn btn-sm" onclick="this.closest('.provider-selector-error').dispatchEvent(new CustomEvent('retry'))">重试</button>
      </div>
    `
    this.container.addEventListener('retry', () => this.init())
  }

  render() {
    const stages = ['video', 'llm', 'tts']
    this.container.innerHTML = `
      <div class="provider-selector">
        ${stages.map((stage) => this.renderStage(stage)).join('')}
        <div class="provider-selector-actions">
          <button class="btn btn-primary" id="providerSaveBtn">保存配置</button>
          <button class="btn" id="providerResetBtn">恢复默认</button>
        </div>
      </div>
    `
  }

  renderStage(stage) {
    const label = STAGE_LABELS[stage]
    const stageCatalog = this.catalog[stage] || this.catalog.models || { models: [] }
    const models = stageCatalog.models || []
    const currentPref = this.preferences[stage]
    const currentResolved = this.resolved[stage] || {}
    const source = currentResolved.source || 'fallback'
    const sourceLabel = SOURCE_LABELS[source] || SOURCE_LABELS.fallback

    const selectedProviderId = currentPref?.provider || ''
    const selectedModelId = currentPref?.model || ''

    // Provider 下拉选项
    const providerOptions = models.map((p) => {
      const disabled = !p.configured
      const selected = p.id === selectedProviderId ? 'selected' : ''
      return `<option value="${p.id}" ${selected} ${disabled ? 'disabled' : ''}>
        ${p.name}${disabled ? ' (未配置 API Key)' : ''}
      </option>`
    }).join('')

    // 根据选中 Provider 渲染模型下拉
    const selectedProvider = models.find((p) => p.id === selectedProviderId)
    const modelOptions = selectedProvider
      ? selectedProvider.models.map((m) => {
          const selected = m.id === selectedModelId ? 'selected' : ''
          return `<option value="${m.id}" ${selected}>${m.name}</option>`
        }).join('')
      : '<option value="">-- 选择 Provider 后可用 --</option>'

    // 能力标签
    const strengthTags = selectedProvider
      ? selectedProvider.strengths.map((s) => `<span class="provider-strength-tag">${s}</span>`).join('')
      : ''

    // 继承来源标识
    const inheritBadge = !currentPref?.provider
      ? `<span class="provider-source-badge ${sourceLabel.class}">${sourceLabel.text}</span>`
      : ''

    // 当前生效值展示
    const effectiveValue = currentResolved.provider
      ? `${currentResolved.provider}${currentResolved.model ? ' · ' + currentResolved.model : ''}`
      : 'mock'

    return `
      <div class="provider-stage" data-stage="${stage}">
        <div class="provider-stage-header">
          <span class="provider-stage-icon">${label.icon}</span>
          <div class="provider-stage-title">
            <span class="provider-stage-name">${label.name}</span>
            <span class="provider-stage-hint">${label.hint}</span>
          </div>
          ${inheritBadge}
        </div>
        <div class="provider-stage-body">
          <div class="provider-select-row">
            <div class="provider-select-group">
              <label>Provider</label>
              <select class="form-select provider-select" data-stage="${stage}" data-type="provider">
                <option value="">使用默认配置</option>
                ${providerOptions}
              </select>
            </div>
            <div class="provider-select-group">
              <label>模型</label>
              <select class="form-select model-select" data-stage="${stage}" data-type="model" ${!selectedProvider ? 'disabled' : ''}>
                ${modelOptions}
              </select>
            </div>
          </div>
          ${strengthTags ? `<div class="provider-strengths">${strengthTags}</div>` : ''}
          <div class="provider-effective">
            <span class="provider-effective-label">当前生效：</span>
            <span class="provider-effective-value">${effectiveValue}</span>
            <span class="provider-effective-source">(${sourceLabel.text})</span>
          </div>
        </div>
      </div>
    `
  }

  bindEvents() {
    // Provider 变更 → 级联更新模型列表
    this.container.querySelectorAll('.provider-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        const stage = e.target.dataset.stage
        const providerId = e.target.value
        this.handleProviderChange(stage, providerId)
      })
    })

    // 模型变更
    this.container.querySelectorAll('.model-select').forEach((select) => {
      select.addEventListener('change', (e) => {
        const stage = e.target.dataset.stage
        const modelId = e.target.value
        this.preferences[stage] = {
          ...this.preferences[stage],
          model: modelId || null,
        }
        this.onChange(stage, this.preferences[stage])
      })
    })

    // 保存
    const saveBtn = this.container.querySelector('#providerSaveBtn')
    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.save())
    }

    // 恢复默认（清空项目级配置，回退到用户/全局默认）
    const resetBtn = this.container.querySelector('#providerResetBtn')
    if (resetBtn) {
      resetBtn.addEventListener('click', () => this.reset())
    }
  }

  handleProviderChange(stage, providerId) {
    const stageCatalog = this.catalog[stage] || this.catalog.models || { models: [] }
    const models = stageCatalog.models || []
    const provider = models.find((p) => p.id === providerId)

    if (!providerId) {
      // 选择「使用默认配置」
      this.preferences[stage] = null
    } else if (provider) {
      const defaultModel = provider.models.find((m) => m.default) || provider.models[0]
      this.preferences[stage] = {
        provider: providerId,
        model: defaultModel?.id || null,
        config: {},
      }
    }

    // 重新渲染该阶段以更新模型下拉
    const stageEl = this.container.querySelector(`.provider-stage[data-stage="${stage}"]`)
    if (stageEl) {
      const tempDiv = document.createElement('div')
      tempDiv.innerHTML = this.renderStage(stage)
      stageEl.replaceWith(tempDiv.firstElementChild)
      // 重新绑定该阶段事件
      const newStageEl = this.container.querySelector(`.provider-stage[data-stage="${stage}"]`)
      newStageEl.querySelector('.provider-select').addEventListener('change', (e) => {
        this.handleProviderChange(stage, e.target.value)
      })
      newStageEl.querySelector('.model-select').addEventListener('change', (e) => {
        this.preferences[stage] = {
          ...this.preferences[stage],
          model: e.target.value || null,
        }
        this.onChange(stage, this.preferences[stage])
      })
    }

    this.onChange(stage, this.preferences[stage])
  }

  async save() {
    const saveBtn = this.container.querySelector('#providerSaveBtn')
    if (saveBtn) saveBtn.disabled = true

    try {
      const payload = {
        video: this.preferences.video === null ? null : this.preferences.video,
        llm: this.preferences.llm === null ? null : this.preferences.llm,
        tts: this.preferences.tts === null ? null : this.preferences.tts,
      }

      if (this.mode === 'project') {
        const result = await api.updateProjectModelConfig(this.projectId, payload)
        this.preferences = result.preferences
        this.resolved = result.resolved
        showToast('项目模型配置已保存', 'success')
      } else {
        const result = await api.updateUserModelPreferences(payload)
        this.preferences = result.preferences
        this.resolved = result.resolved
        showToast('全局默认模型偏好已保存', 'success')
      }

      this.onSave(this.preferences)
      this.render()
      this.bindEvents()
    } catch (err) {
      showToast(`保存失败：${err.message}`, 'error')
    } finally {
      if (saveBtn) saveBtn.disabled = false
    }
  }

  async reset() {
    if (!confirm('确定要恢复默认配置吗？将清除自定义设置并使用系统默认值。')) return

    this.preferences = { video: null, llm: null, tts: null, updatedAt: null }

    try {
      if (this.mode === 'project') {
        const result = await api.updateProjectModelConfig(this.projectId, {
          video: null, llm: null, tts: null,
        })
        this.preferences = result.preferences
        this.resolved = result.resolved
        showToast('已恢复默认配置', 'success')
      } else {
        const result = await api.updateUserModelPreferences({
          video: null, llm: null, tts: null,
        })
        this.preferences = result.preferences
        this.resolved = result.resolved
        showToast('已恢复全局默认配置', 'success')
      }
      this.render()
      this.bindEvents()
    } catch (err) {
      showToast(`恢复失败：${err.message}`, 'error')
    }
  }
}

export default ProviderSelector
