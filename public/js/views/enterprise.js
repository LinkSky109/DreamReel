import { api } from '../api.js'
import { showToast } from '../app.js'

/**
 * R20：企业版管理控制台
 */
export async function renderEnterprise(container) {
  container.innerHTML = '<div class="loading"></div>'
  try {
    const [overview, config, audit, deployment] = await Promise.all([
      api.enterpriseOverview(),
      api.enterpriseConfig(),
      api.enterpriseAudit({ limit: 50 }),
      api.enterpriseDeployment(),
    ])

    container.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;padding:24px;">
        <h2 style="margin-bottom:18px;">🏢 企业管理控制台</h2>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin-bottom:20px;">
          ${statCard('👥', '团队', overview.teams)}
          ${statCard('🧑‍💼', '成员', overview.members)}
          ${statCard('🎬', '项目', overview.projects)}
          ${statCard('📋', '审计事件', overview.auditEvents)}
        </div>

        <div class="card" style="padding:20px;margin-bottom:18px;">
          <div style="font-weight:700;margin-bottom:14px;">🔐 安全与单点登录策略</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;font-size:13px;">
            <label class="switch-row">
              <input type="checkbox" id="cfgSso" ${config.sso.enabled ? 'checked' : ''}>
              启用 SSO（${config.sso.provider.toUpperCase()}）
            </label>
            <label class="switch-row">
              <input type="checkbox" id="cfgWatermark" ${config.security.exportWatermark ? 'checked' : ''}>
              导出文件加水印
            </label>
            <label class="switch-row">
              <input type="checkbox" id="cfgIpList" ${config.security.enforceIpAllowlist ? 'checked' : ''}>
              启用 IP 白名单
            </label>
            <label class="switch-row">
              <input type="checkbox" id="cfgNoPublic" ${config.security.disablePublicSharing ? 'checked' : ''}>
              禁止公开分享
            </label>
          </div>
          <div style="margin-top:12px;font-size:12px;color:var(--text-secondary);">
            SSO 入口：<code>${config.sso.entryPoint || '未配置'}</code><br>
            数据驻留区域：${config.dataResidency.region} · 保留 ${config.dataResidency.retentionDays} 天
          </div>
          <button class="btn btn-primary" id="saveEntCfg" style="margin-top:14px;">保存安全策略</button>
        </div>

        <div class="card" style="padding:20px;margin-bottom:18px;">
          <div style="font-weight:700;margin-bottom:12px;">📜 审计日志（${audit.total}）</div>
          <div style="overflow:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="text-align:left;color:var(--text-secondary);">
                  <th style="padding:6px;">时间</th><th>操作者</th><th>动作</th><th>结果</th>
                </tr>
              </thead>
              <tbody>
                ${audit.items.map((l) => `
                  <tr style="border-top:1px solid var(--border);">
                    <td style="padding:6px;white-space:nowrap;">${l.timestamp.slice(0, 19).replace('T', ' ')}</td>
                    <td>${l.actor}</td>
                    <td>${l.action}</td>
                    <td>${l.result === 'success' ? '✅' : '❌'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="card" style="padding:20px;">
          <div style="font-weight:700;margin-bottom:10px;">🚀 私有化部署</div>
          <div style="font-size:13px;color:var(--text-secondary);line-height:1.8;">
            版本：${deployment.version} · 部署模式：${deployment.deployment}<br>
            SLA：${deployment.support.sla} · ${deployment.support.channel}<br>
            能力：${deployment.features.map((f) => `<code style="margin-right:4px;">${f}</code>`).join('')}
          </div>
        </div>
      </div>
    `

    document.getElementById('saveEntCfg').addEventListener('click', async () => {
      const updates = {
        sso: { enabled: document.getElementById('cfgSso').checked },
        security: {
          exportWatermark: document.getElementById('cfgWatermark').checked,
          enforceIpAllowlist: document.getElementById('cfgIpList').checked,
          disablePublicSharing: document.getElementById('cfgNoPublic').checked,
        },
      }
      await api.updateEnterpriseConfig(updates)
      showToast('安全策略已保存并记录审计')
      renderEnterprise(container)
    })
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${error.message}</div></div>`
  }
}

function statCard(icon, label, value) {
  return `
    <div class="card" style="padding:16px;text-align:center;">
      <div style="font-size:22px;margin-bottom:6px;">${icon}</div>
      <div style="font-size:24px;font-weight:700;">${value}</div>
      <div style="font-size:12px;color:var(--text-secondary);">${label}</div>
    </div>
  `
}
