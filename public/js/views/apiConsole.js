import { api } from '../api.js'
import { showToast } from '../app.js'

/**
 * R13：API 开放平台控制台
 */
export async function renderApiConsole(container) {
  container.innerHTML = '<div class="loading"></div>'
  try {
    const data = await api.listApiKeys()
    container.innerHTML = `
      <div style="max-width:980px;margin:0 auto;padding:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <h2>🔌 API 开放平台</h2>
          <button class="btn btn-primary" id="createKeyBtn">+ 创建 API Key</button>
        </div>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px;">
          通过 API Key 在你自己的应用中调用 DreamReel 能力，基础地址 <code>/api/open/v1</code>
        </p>

        <div class="card" style="padding:18px;margin-bottom:18px;">
          <div style="font-weight:700;margin-bottom:10px;">我的密钥</div>
          ${data.items.length ? data.items.map((k) => `
            <div style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid var(--border);font-size:13px;flex-wrap:wrap;">
              <span style="font-weight:600;">${k.name}</span>
              <code style="background:var(--bg-secondary);padding:2px 8px;border-radius:6px;">${k.keyPrefix}••••</code>
              <span style="color:var(--text-secondary);font-size:11px;">调用 ${k.callCount} 次</span>
              <span style="margin-left:auto;display:flex;gap:6px;">
                <button class="btn btn-sm revoke-key" data-id="${k.id}">吊销</button>
              </span>
            </div>
          `).join('') : '<div style="font-size:13px;color:var(--text-secondary);">还没有密钥</div>'}
        </div>

        <div class="card" style="padding:18px;">
          <div style="font-weight:700;margin-bottom:10px;">快速示例（cURL）</div>
          <pre style="background:#0f172a;color:#e2e8f0;padding:14px;border-radius:8px;font-size:12px;overflow:auto;"># 创建项目
curl -X POST https://api.dreamreel.com/api/open/v1/projects \\
  -H "Authorization: Bearer drk_你的密钥" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"我的 API 作品"}'

# 生成视频
curl -X POST https://api.dreamreel.com/api/open/v1/videos/generate \\
  -H "Authorization: Bearer drk_你的密钥" \\
  -d '{"projectId":"项目ID"}'</pre>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:10px;line-height:1.7;">
            权限范围：<code>project:read</code> 查询 · <code>project:write</code> 创建 · <code>video:generate</code> 生成视频
          </div>
        </div>
      </div>
    `

    document.getElementById('createKeyBtn').addEventListener('click', async () => {
      const name = prompt('密钥名称（用于识别用途）')
      if (!name) return
      const r = await api.createApiKey({ name })
      alert(`请立即保存你的 API Key（仅显示一次）：\n\n${r.apiKey}`)
      renderApiConsole(container)
    })

    container.querySelectorAll('.revoke-key').forEach((btn) => {
      btn.addEventListener('click', async () => {
        await api.revokeApiKey(btn.dataset.id)
        showToast('密钥已吊销')
        renderApiConsole(container)
      })
    })
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${error.message}</div></div>`
  }
}
