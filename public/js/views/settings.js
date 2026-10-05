import { api } from '../api.js'
import { showToast } from '../app.js'
import { i18n } from '../i18n.js'
import { ProviderSelector } from '../components/providerSelector.js'

/**
 * 设置页面
 * 显示 Provider 配置状态、系统信息
 */
export async function renderSettingsPage(container) {
  container.innerHTML = `
    <div class="settings-page">
      <div class="loading-overlay">
        <div class="loading"></div>
        <span>${i18n.t('loading')}</span>
      </div>
    </div>
  `

  try {
    const [systemInfo, providerStatus, webhooksData, webhookEvents, performanceData, notifPrefs] = await Promise.all([
      api.getSystemInfo(),
      api.getProviderStatus(),
      api.listWebhooks().catch(() => ({ webhooks: [] })),
      api.getWebhookEvents().catch(() => ({ events: [] })),
      api.getPerformance().catch(() => null),
      api.getNotificationPreferences().catch(() => null),
    ])

    const webhooks = webhooksData.webhooks || []
    const events = webhookEvents.events || []
    const perf = performanceData
    const notificationPrefs = notifPrefs?.preferences || {}

    container.innerHTML = `
      <div class="settings-page">
        <div class="settings-header">
          <h1 class="settings-title">⚙️ 设置</h1>
          <p class="settings-subtitle">系统配置与状态</p>
        </div>

        <!-- Provider 配置 -->
        <section class="settings-section">
          <h2 class="section-title">🎬 AI 模型配置</h2>
          <div class="provider-grid">
            ${renderProviderCard('视频生成', providerStatus.video, '🎬')}
            ${renderProviderCard('剧本 / 影评', providerStatus.llm, '🤖')}
            ${renderProviderCard('配音字幕', providerStatus.tts, '🔊')}
          </div>
          <div class="settings-hint">
            💡 通过环境变量切换 Provider，修改后需重启服务。详见 <code>.env.example</code>
          </div>
        </section>

        <!-- Phase 1: 全局默认模型偏好 -->
        <section class="settings-section">
          <div class="section-header-row">
            <h2 class="section-title">🌍 全局默认模型偏好</h2>
            <span class="settings-hint-inline">设置后，新建项目将默认使用这些 Provider</span>
          </div>
          <div id="userModelPreferences">
            <div class="provider-selector-loading">
              <div class="loading"></div>
              <span>加载中...</span>
            </div>
          </div>
        </section>

        <!-- 系统信息 -->
        <section class="settings-section">
          <h2 class="section-title">💻 系统信息</h2>
          <div class="info-grid">
            <div class="info-card">
              <div class="info-label">应用名称</div>
              <div class="info-value">${systemInfo.app.name}</div>
            </div>
            <div class="info-card">
              <div class="info-label">版本</div>
              <div class="info-value">v${systemInfo.app.version}</div>
            </div>
            <div class="info-card">
              <div class="info-label">运行环境</div>
              <div class="info-value">${systemInfo.app.env}</div>
            </div>
            <div class="info-card">
              <div class="info-label">运行时长</div>
              <div class="info-value">${formatUptime(systemInfo.app.uptime)}</div>
            </div>
            <div class="info-card">
              <div class="info-label">Node 版本</div>
              <div class="info-value">${systemInfo.system.nodeVersion}</div>
            </div>
            <div class="info-card">
              <div class="info-label">操作系统</div>
              <div class="info-value">${systemInfo.system.platform} / ${systemInfo.system.arch}</div>
            </div>
            <div class="info-card">
              <div class="info-label">CPU 核心</div>
              <div class="info-value">${systemInfo.system.cpuCount}</div>
            </div>
            <div class="info-card">
              <div class="info-label">内存使用</div>
              <div class="info-value">${formatMemory(systemInfo.system.freeMemory, systemInfo.system.totalMemory)}</div>
            </div>
            <div class="info-card">
              <div class="info-label">进程内存</div>
              <div class="info-value">${(systemInfo.process.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB</div>
            </div>
            <div class="info-card">
              <div class="info-label">存储使用</div>
              <div class="info-value">${systemInfo.storage.usedMB} MB (${systemInfo.storage.fileCount} 个文件)</div>
            </div>
            <div class="info-card">
              <div class="info-label">存储路径</div>
              <div class="info-value info-value-small">${systemInfo.storage.path}</div>
            </div>
            <div class="info-card">
              <div class="info-label">服务端口</div>
              <div class="info-value">${systemInfo.config.port}</div>
            </div>
          </div>
        </section>

        ${perf ? `
        <!-- 性能监控 -->
        <section class="settings-section">
          <div class="section-header-row">
            <h2 class="section-title">📊 性能监控</h2>
            <button class="btn btn-sm" onclick="location.reload()">🔄 刷新</button>
          </div>

          <div class="perf-grid">
            <div class="perf-card">
              <div class="perf-label">CPU 使用率</div>
              <div class="perf-value ${perf.system.cpu.usagePercent > 80 ? 'perf-danger' : perf.system.cpu.usagePercent > 50 ? 'perf-warning' : 'perf-ok'}">
                ${perf.system.cpu.usagePercent}%
              </div>
              <div class="perf-sub">${perf.system.cpu.cores} 核 · 负载 ${perf.system.cpu.loadAvg1m.toFixed(2)}</div>
            </div>
            <div class="perf-card">
              <div class="perf-label">内存使用率</div>
              <div class="perf-value ${perf.system.memory.usagePercent > 80 ? 'perf-danger' : perf.system.memory.usagePercent > 50 ? 'perf-warning' : 'perf-ok'}">
                ${perf.system.memory.usagePercent}%
              </div>
              <div class="perf-sub">${perf.system.memory.usedMB} / ${perf.system.memory.totalMB} MB</div>
            </div>
            <div class="perf-card">
              <div class="perf-label">总请求数</div>
              <div class="perf-value">${perf.requests.total}</div>
              <div class="perf-sub">错误 ${perf.requests.errors} (${perf.requests.errorRate}%)</div>
            </div>
            <div class="perf-card">
              <div class="perf-label">平均响应时间</div>
              <div class="perf-value">${perf.requests.avgResponseTime}ms</div>
              <div class="perf-sub">${perf.requests.avgResponseTimeSec}s</div>
            </div>
          </div>

          ${perf.requests.slowestEndpoints.length > 0 ? `
          <div class="perf-subsection">
            <h3 class="perf-subtitle">🐢 最慢端点 Top 5</h3>
            <div class="perf-table">
              <div class="perf-table-header">
                <span>端点</span>
                <span>请求数</span>
                <span>平均耗时</span>
                <span>错误率</span>
              </div>
              ${perf.requests.slowestEndpoints.map((e) => `
                <div class="perf-table-row">
                  <span class="perf-endpoint">${e.endpoint}</span>
                  <span>${e.count}</span>
                  <span>${e.avgTime}ms</span>
                  <span class="${parseFloat(e.errorRate) > 10 ? 'perf-danger-text' : ''}">${e.errorRate}%</span>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          ${perf.requests.busiestEndpoints.length > 0 ? `
          <div class="perf-subsection">
            <h3 class="perf-subtitle">🔥 最频繁端点 Top 5</h3>
            <div class="perf-table">
              <div class="perf-table-header">
                <span>端点</span>
                <span>请求数</span>
                <span>平均耗时</span>
                <span>错误数</span>
              </div>
              ${perf.requests.busiestEndpoints.map((e) => `
                <div class="perf-table-row">
                  <span class="perf-endpoint">${e.endpoint}</span>
                  <span>${e.count}</span>
                  <span>${e.avgTime}ms</span>
                  <span>${e.errors}</span>
                </div>
              `).join('')}
            </div>
          </div>
          ` : ''}

          <div class="perf-footer">
            <span>运行时长: ${formatUptime(perf.system.uptime)}</span>
            <span>进程 PID: ${perf.system.process.pid}</span>
            <span>堆内存: ${(perf.system.process.memoryUsage.heapUsed / 1024 / 1024).toFixed(1)} MB</span>
          </div>
        </section>
        ` : ''}

        <!-- 配置摘要 -->
        <section class="settings-section">
          <h2 class="section-title">📋 当前配置</h2>
          <div class="config-list">
            <div class="config-item">
              <span class="config-key">视频生成 Provider</span>
              <span class="config-value config-value-active">${systemInfo.config.videoProvider}</span>
            </div>
            <div class="config-item">
              <span class="config-key">LLM Provider</span>
              <span class="config-value config-value-active">${systemInfo.config.llmProvider}</span>
            </div>
            <div class="config-item">
              <span class="config-key">TTS Provider</span>
              <span class="config-value config-value-active">${systemInfo.config.ttsProvider}</span>
            </div>
            <div class="config-item">
              <span class="config-key">最大并发数</span>
              <span class="config-value">${systemInfo.config.maxConcurrent}</span>
            </div>
          </div>
        </section>

        <!-- Webhook 配置 -->
        <section class="settings-section">
          <h2 class="section-title">🔔 Webhook 配置</h2>
          <p class="settings-subtitle">在事件发生时接收 HTTP 通知，集成到你的工作流</p>

          <div class="webhook-list" id="webhookList">
            ${webhooks.length === 0 ? `
              <div class="empty-state" style="padding: 32px;">
                <div class="empty-state-icon">🔔</div>
                <div class="empty-state-text">暂无 Webhook，点击下方按钮添加</div>
              </div>
            ` : webhooks.map((w) => `
              <div class="webhook-card" data-id="${w.id}">
                <div class="webhook-card-header">
                  <span class="webhook-name">${w.name}</span>
                  <span class="webhook-status ${w.active ? 'status-active' : 'status-inactive'}">
                    ${w.active ? '● 已启用' : '○ 已停用'}
                  </span>
                </div>
                <div class="webhook-url">${w.url}</div>
                <div class="webhook-events">
                  ${w.events.map((e) => `<span class="provider-tag">${e}</span>`).join('')}
                </div>
                <div class="webhook-stats">
                  <span>✅ ${w.successCount} 成功</span>
                  <span>❌ ${w.failureCount} 失败</span>
                  ${w.lastTriggeredAt ? `<span>🕐 ${new Date(w.lastTriggeredAt).toLocaleString()}</span>` : ''}
                </div>
                <div class="webhook-actions">
                  <button class="btn btn-sm" onclick="testWebhook('${w.id}')">测试</button>
                  <button class="btn btn-sm" onclick="toggleWebhook('${w.id}', ${!w.active})">${w.active ? '停用' : '启用'}</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteWebhook('${w.id}')">删除</button>
                </div>
              </div>
            `).join('')}
          </div>

          <button class="btn btn-primary" style="margin-top: 16px;" onclick="showWebhookForm()">
            + 添加 Webhook
          </button>

          <div class="webhook-form-modal" id="webhookFormModal" style="display: none;">
            <div class="modal-content">
              <h3>添加 Webhook</h3>
              <div class="form-group">
                <label>名称</label>
                <input type="text" id="webhookName" placeholder="例如：我的通知服务" />
              </div>
              <div class="form-group">
                <label>URL *</label>
                <input type="url" id="webhookUrl" placeholder="https://example.com/webhook" required />
              </div>
              <div class="form-group">
                <label>事件类型 *</label>
                <div class="event-checkboxes">
                  ${events.map((e) => `
                    <label class="event-checkbox">
                      <input type="checkbox" value="${e}" /> ${e}
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="form-group">
                <label>签名密钥（可选）</label>
                <input type="text" id="webhookSecret" placeholder="用于 HMAC 签名验证" />
              </div>
              <div class="modal-actions">
                <button class="btn" onclick="hideWebhookForm()">取消</button>
                <button class="btn btn-primary" onclick="submitWebhook()">保存</button>
              </div>
            </div>
          </div>
        </section>

        <!-- 通知偏好设置 -->
        <section class="settings-section">
          <h2 class="section-title">🔔 通知偏好</h2>
          <p class="settings-subtitle">自定义接收哪些类型的通知，关闭后将不再推送对应通知</p>

          <div class="notification-prefs-grid">
            ${renderNotificationPrefItem('video_completed', '🎬 视频生成完成', notificationPrefs.video_completed)}
            ${renderNotificationPrefItem('video_failed', '⚠️ 视频生成失败', notificationPrefs.video_failed)}
            ${renderNotificationPrefItem('script_completed', '📝 剧本生成完成', notificationPrefs.script_completed)}
            ${renderNotificationPrefItem('export_completed', '📤 导出完成', notificationPrefs.export_completed)}
            ${renderNotificationPrefItem('export_failed', '❌ 导出失败', notificationPrefs.export_failed)}
            ${renderNotificationPrefItem('analysis_completed', '🔍 AI 影评完成', notificationPrefs.analysis_completed)}
            ${renderNotificationPrefItem('mention', '@ 提到了你', notificationPrefs.mention)}
            ${renderNotificationPrefItem('comment_reply', '💬 评论回复', notificationPrefs.comment_reply)}
            ${renderNotificationPrefItem('collaboration', '👥 协作消息', notificationPrefs.collaboration)}
            ${renderNotificationPrefItem('system', '🔔 系统通知', notificationPrefs.system)}
          </div>

          <div style="margin-top: 16px; display: flex; gap: 12px;">
            <button class="btn btn-primary btn-sm" onclick="saveNotificationPrefs()">保存设置</button>
            <button class="btn btn-sm" onclick="resetNotificationPrefs()">恢复默认</button>
          </div>
        </section>
      </div>
    `
    // Phase 1: 初始化全局默认模型偏好选择器
    const prefsContainer = document.getElementById('userModelPreferences')
    if (prefsContainer) {
      const selector = new ProviderSelector(prefsContainer, {
        mode: 'user',
        onChange: (stage, value) => {
          // 实时变更，不自动保存，等用户点击保存按钮
        },
      })
      selector.init().catch(() => {
        prefsContainer.innerHTML = '<div class="settings-hint">加载偏好设置失败，请刷新重试</div>'
      })
    }
  } catch (err) {
    container.innerHTML = `
      <div class="settings-page">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-text">加载失败：${err.message}</div>
          <button class="btn" onclick="location.reload()">重试</button>
        </div>
      </div>
    `
  }
}

function renderProviderCard(title, provider, icon) {
  const configuredCount = Object.values(provider.configured).filter(Boolean).length
  const totalCount = Object.keys(provider.configured).length
  const isConfigured = configuredCount > 0

  return `
    <div class="provider-card">
      <div class="provider-card-header">
        <span class="provider-icon">${icon}</span>
        <span class="provider-title">${title}</span>
      </div>
      <div class="provider-current">
        <span class="provider-label">当前使用</span>
        <span class="provider-name provider-name-active">${provider.current}</span>
      </div>
      <div class="provider-available">
        <span class="provider-label">可用模型</span>
        <div class="provider-tags">
          ${provider.available.map((p) => `
            <span class="provider-tag ${p === provider.current ? 'provider-tag-active' : ''}">${p}</span>
          `).join('')}
        </div>
      </div>
      <div class="provider-configured">
        <span class="provider-label">API Key</span>
        <span class="${isConfigured ? 'status-configured' : 'status-unconfigured'}">
          ${isConfigured ? `✅ 已配置 ${configuredCount}/${totalCount}` : `❌ 未配置 (${configuredCount}/${totalCount})`}
        </span>
      </div>
    </div>
  `
}

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}小时`
  if (hours > 0) return `${hours}小时 ${minutes}分钟`
  return `${minutes}分钟`
}

function formatMemory(free, total) {
  const used = total - free
  const usedGB = (used / 1024 / 1024 / 1024).toFixed(1)
  const totalGB = (total / 1024 / 1024 / 1024).toFixed(1)
  const percent = ((used / total) * 100).toFixed(0)
  return `${usedGB}/${totalGB} GB (${percent}%)`
}

// Webhook 管理函数（全局可访问）
window.testWebhook = async function(id) {
  try {
    showToast('正在测试 Webhook...', 'info')
    const result = await api.testWebhook(id)
    if (result.success) {
      showToast('Webhook 测试成功', 'success')
    } else {
      showToast(`Webhook 测试失败: ${result.error || '未知错误'}`, 'error')
    }
  } catch (err) {
    showToast(`测试失败: ${err.message}`, 'error')
  }
}

window.toggleWebhook = async function(id, active) {
  try {
    await api.updateWebhook(id, { active })
    showToast(active ? 'Webhook 已启用' : 'Webhook 已停用', 'success')
    location.reload()
  } catch (err) {
    showToast(`操作失败: ${err.message}`, 'error')
  }
}

window.deleteWebhook = async function(id) {
  if (!confirm('确定要删除这个 Webhook 吗？')) return
  try {
    await api.deleteWebhook(id)
    showToast('Webhook 已删除', 'success')
    location.reload()
  } catch (err) {
    showToast(`删除失败: ${err.message}`, 'error')
  }
}

window.showWebhookForm = function() {
  document.getElementById('webhookFormModal').style.display = 'flex'
}

window.hideWebhookForm = function() {
  document.getElementById('webhookFormModal').style.display = 'none'
}

window.submitWebhook = async function() {
  const name = document.getElementById('webhookName').value.trim()
  const url = document.getElementById('webhookUrl').value.trim()
  const secret = document.getElementById('webhookSecret').value.trim()
  const events = Array.from(document.querySelectorAll('.event-checkbox input:checked')).map((cb) => cb.value)

  if (!url) {
    showToast('请输入 Webhook URL', 'error')
    return
  }
  if (events.length === 0) {
    showToast('请至少选择一个事件类型', 'error')
    return
  }

  try {
    await api.createWebhook({ name: name || url, url, events, secret })
    showToast('Webhook 创建成功', 'success')
    location.reload()
  } catch (err) {
    showToast(`创建失败: ${err.message}`, 'error')
  }
}

// 通知偏好渲染函数
function renderNotificationPrefItem(type, label, enabled) {
  const isEnabled = enabled !== false
  return `
    <div class="notification-pref-item">
      <div class="notification-pref-info">
        <span class="notification-pref-label">${label}</span>
      </div>
      <label class="toggle-switch">
        <input type="checkbox" class="notification-pref-checkbox" data-type="${type}" ${isEnabled ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `
}

// 保存通知偏好
window.saveNotificationPrefs = async function() {
  try {
    const checkboxes = document.querySelectorAll('.notification-pref-checkbox')
    const updates = {}
    checkboxes.forEach((cb) => {
      updates[cb.dataset.type] = cb.checked
    })
    await api.updateNotificationPreferences(updates)
    showToast('通知偏好已保存', 'success')
  } catch (err) {
    showToast(`保存失败: ${err.message}`, 'error')
  }
}

// 恢复默认通知偏好
window.resetNotificationPrefs = async function() {
  try {
    const defaults = {
      video_completed: true,
      video_failed: true,
      script_completed: true,
      export_completed: true,
      export_failed: true,
      analysis_completed: true,
      mention: true,
      comment_reply: true,
      collaboration: true,
      system: true,
    }
    await api.updateNotificationPreferences(defaults)
    showToast('已恢复默认设置', 'success')
    location.reload()
  } catch (err) {
    showToast(`恢复失败: ${err.message}`, 'error')
  }
}
