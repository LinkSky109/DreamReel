/**
 * R30：剧场计划厂牌
 * - 广场：GET /api/studios 卡片网格 + 内联创建表单（POST /api/studios）
 * - 详情：GET /api/studios/:id（含 members / shows / works）
 *   - 签约创作者：POST /api/studios/:id/members；DELETE /api/studios/:id/members/:userId
 *   - 剧集 Shows：POST /api/studios/:id/shows；作品归入 show → POST /api/studios/:id/shows/:showId/projects/:projectId
 *   - 厂牌全部作品：POST /api/studios/:id/projects/:projectId（归入我的项目）
 */

import { api } from '../api.js'
import { showToast } from '../app.js'

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str === null ? '' : String(str)
  return div.innerHTML
}

export async function renderStudiosPage(container, studioId) {
  container.innerHTML = '<div class="loading"></div>'
  try {
    if (studioId) await renderDetail(container, studioId)
    else await renderList(container)
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><div class="empty-state-text">加载失败：${escapeHtml(error.message)}</div><button class="btn" onclick="location.hash=''">返回首页</button></div>`
  }
}

/* ============ 广场 ============ */
async function renderList(container) {
  const data = await api.listStudios()
  const items = data.items || []

  container.innerHTML = `
    <div style="max-width:1050px;margin:0 auto;padding:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:12px;">
        <div>
          <h1 class="page-title" style="margin-bottom:4px;">🎭 剧场计划厂牌</h1>
          <p style="color:var(--text-secondary);font-size:13px;margin:0;">签约创作者、策划剧集、把作品收进你的厂牌片单</p>
        </div>
        <button class="btn btn-primary" id="createStudioBtn">+ 创建厂牌</button>
      </div>

      <div id="createStudioForm" class="inline-form" style="display:none;margin-bottom:18px;">
        <div style="font-weight:700;margin-bottom:12px;">新建厂牌</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">名称 *</label>
            <input class="form-input" id="stName" type="text" placeholder="例如：雨夜影像厂" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">Logo（emoji / 短标识）</label>
            <input class="form-input" id="stLogo" type="text" placeholder="🎬" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">风格定位</label>
            <input class="form-input" id="stStyle" type="text" placeholder="例如：黑色电影 / 都市悬疑" />
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">主理人</label>
            <input class="form-input" id="stCurator" type="text" placeholder="你的名字" />
          </div>
          <div class="form-group" style="margin:0;grid-column:1/-1;">
            <label class="form-label">简介</label>
            <textarea class="form-textarea" id="stDesc" rows="2" placeholder="这个厂牌想拍什么样的片子…"></textarea>
          </div>
        </div>
        <div style="display:flex;gap:10px;margin-top:14px;">
          <button class="btn btn-primary" id="stSubmit">提交创建</button>
          <button class="btn" id="stCancel">取消</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
        ${items.length ? items.map((s) => `
          <div class="card studio-card" data-id="${escapeHtml(s.id)}" style="padding:18px;cursor:pointer;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
              <span style="font-size:24px;">${escapeHtml(s.logo || '🎭')}</span>
              <span style="font-weight:700;font-size:16px;">${escapeHtml(s.name || '未命名厂牌')}</span>
            </div>
            ${s.stylePositioning ? `<div style="font-size:12px;color:var(--primary);margin-bottom:6px;">${escapeHtml(s.stylePositioning)}</div>` : ''}
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">主理人：${escapeHtml(s.curatorName || '—')}</div>
            <div style="display:flex;gap:14px;font-size:12px;color:var(--text-secondary);">
              <span>👤 ${s.memberCount ?? (s.members || []).length} 成员</span>
              <span>📺 ${s.showCount ?? (s.shows || []).length} 剧集</span>
              <span>🎬 ${s.projectCount ?? (s.projectIds || []).length} 作品</span>
            </div>
          </div>
        `).join('') : '<div style="color:var(--text-secondary);grid-column:1/-1;">还没有厂牌，点击右上角创建第一个吧</div>'}
      </div>
    </div>
  `

  container.querySelectorAll('.studio-card').forEach((c) => {
    c.addEventListener('click', () => { location.hash = `#/studio/${c.dataset.id}` })
  })

  const form = container.querySelector('#createStudioForm')
  container.querySelector('#createStudioBtn').addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none'
  })
  container.querySelector('#stCancel').addEventListener('click', () => { form.style.display = 'none' })
  container.querySelector('#stSubmit').addEventListener('click', async () => {
    const name = container.querySelector('#stName').value.trim()
    const description = container.querySelector('#stDesc').value.trim()
    const logo = container.querySelector('#stLogo').value.trim() || '🎭'
    const stylePositioning = container.querySelector('#stStyle').value.trim()
    const curatorName = container.querySelector('#stCurator').value.trim()
    if (!name) {
      showToast('请填写厂牌名称', 'error')
      return
    }
    try {
      const created = await api.createStudio({ name, description, logo, stylePositioning, curatorName })
      showToast('厂牌已创建')
      location.hash = `#/studio/${created.id}`
    } catch (e) {
      showToast(e.message || '创建失败', 'error')
    }
  })
}

/* ============ 详情 ============ */
async function renderDetail(container, studioId) {
  const [studio, projectsRes] = await Promise.all([
    api.getStudio(studioId),
    api.listProjects({ limit: 100 }),
  ])
  const myProjects = projectsRes.items || projectsRes.projects || projectsRes || []

  const members = Array.isArray(studio.members) ? studio.members : []
  const shows = Array.isArray(studio.shows) ? studio.shows : []
  // 厂牌作品：详情已 hydrate works；否则回退到 listStudioWorks
  let works = Array.isArray(studio.works) ? studio.works : []
  if (!works.length && Array.isArray(studio.projectIds) && studio.projectIds.length) {
    // 详情未 hydrate 时，单独拉一次
    try {
      const worksRes = await api.listStudioWorks(studioId)
      works = worksRes.items || worksRes.projects || worksRes || []
    } catch { works = [] }
  }

  container.innerHTML = `
    <div style="max-width:1050px;margin:0 auto;padding:24px;">
      <button class="btn btn-sm" id="backStudios" style="margin-bottom:14px;">← 返回厂牌广场</button>

      <div class="card" style="padding:22px;margin-bottom:18px;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <span style="font-size:32px;">${escapeHtml(studio.logo || '🎭')}</span>
          <div style="flex:1;">
            <h2 style="margin:0 0 4px;">${escapeHtml(studio.name || '')}</h2>
            <div style="font-size:12px;color:var(--primary);">${escapeHtml(studio.stylePositioning || '')}</div>
          </div>
          <div style="font-size:12px;color:var(--text-secondary);text-align:right;">
            <div>主理人：${escapeHtml(studio.curatorName || '—')}</div>
            <div style="margin-top:4px;">👤 ${studio.memberCount ?? members.length} · 📺 ${studio.showCount ?? shows.length} · 🎬 ${studio.projectCount ?? works.length}</div>
          </div>
        </div>
        ${studio.description ? `<p style="margin:12px 0 0;font-size:13px;color:var(--text-secondary);line-height:1.7;">${escapeHtml(studio.description)}</p>` : ''}
      </div>

      <!-- 签约创作者 -->
      <div class="card" style="padding:20px;margin-bottom:18px;">
        <div style="font-weight:700;margin-bottom:12px;">签约创作者（${members.length}）</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
          ${members.length ? members.map((m) => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:8px;font-size:13px;">
              <span>👤</span>
              <span style="flex:1;">${escapeHtml(m.name || m.userId || '')}</span>
              <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(m.role || '')}${m.joinedAt ? ' · ' + escapeHtml(String(m.joinedAt).slice(0,10)) : ''}</span>
              <button class="btn btn-sm remove-member" data-user="${escapeHtml(m.userId || m.id)}">移除</button>
            </div>
          `).join('') : '<div style="font-size:12px;color:var(--text-secondary);">暂无签约创作者</div>'}
        </div>
        <div class="inline-form" style="margin:0;">
          <div style="font-weight:700;font-size:13px;margin-bottom:10px;">+ 签约创作者</div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <input class="form-input" id="smUserId" type="text" placeholder="用户 ID" style="flex:1;min-width:140px;" />
            <input class="form-input" id="smName" type="text" placeholder="昵称" style="flex:1;min-width:120px;" />
            <select class="form-input" id="smRole" style="width:auto;">
              <option value="director">导演</option>
              <option value="cinematographer">摄影</option>
              <option value="writer">编剧</option>
              <option value="editor">剪辑</option>
              <option value="composer">配乐</option>
            </select>
            <button class="btn btn-primary" id="smSubmit">签约</button>
          </div>
        </div>
      </div>

      <!-- 剧集 Shows -->
      <div class="card" style="padding:20px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-weight:700;">剧集 Shows（${shows.length}）</div>
          <button class="btn btn-sm" id="newShowBtn">+ 新建剧集</button>
        </div>
        <div id="newShowForm" class="inline-form" style="display:none;margin-bottom:14px;">
          <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <input class="form-input" id="swTitle" type="text" placeholder="剧集标题" style="flex:1;min-width:140px;" />
            <input class="form-input" id="swIcon" type="text" placeholder="封面图标 📺" style="width:110px;" />
            <input class="form-input" id="swSyn" type="text" placeholder="一句话简介" style="flex:2;min-width:180px;" />
            <button class="btn btn-primary" id="swSubmit">创建</button>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          ${shows.length ? shows.map((s) => renderShow(s, works)).join('') : '<div style="font-size:12px;color:var(--text-secondary);">还没有剧集，点右上角创建</div>'}
        </div>
      </div>

      <!-- 厂牌全部作品 -->
      <div class="card" style="padding:20px;">
        <div style="font-weight:700;margin-bottom:12px;">厂牌全部作品（${works.length}）</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
          ${works.length ? works.map((w) => `
            <div class="card" style="padding:14px;">
              <div style="font-size:22px;margin-bottom:6px;">${escapeHtml(w.coverIcon || w.cover || '🎬')}</div>
              <div style="font-weight:600;font-size:13px;margin-bottom:4px;">${escapeHtml(w.name || w.title || '未命名')}</div>
              <div style="font-size:11px;color:var(--text-secondary);">${escapeHtml(w.status || '')} · ${((w.shots || []).length) || (w.shotCount || 0)} 镜头</div>
            </div>
          `).join('') : '<div style="font-size:12px;color:var(--text-secondary);grid-column:1/-1;">厂牌还没有归入的作品</div>'}
        </div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:13px;color:var(--text-secondary);">把我的作品归入厂牌：</span>
          <select class="form-input" id="addWorkSelect" style="flex:1;min-width:220px;">
            <option value="">— 选择我的项目 —</option>
            ${myProjects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`).join('')}
          </select>
          <button class="btn btn-primary" id="addWorkBtn">归入厂牌</button>
        </div>
      </div>
    </div>
  `

  document.getElementById('backStudios').addEventListener('click', () => { location.hash = '#/studios' })

  // 移除成员
  container.querySelectorAll('.remove-member').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('确定要移除该签约创作者吗？')) return
      try {
        await api.removeMember(studioId, btn.dataset.user)
        showToast('已移除')
        renderDetail(container, studioId)
      } catch (e) { showToast(e.message || '移除失败', 'error') }
    })
  })

  // 签约
  document.getElementById('smSubmit').addEventListener('click', async () => {
    const userId = document.getElementById('smUserId').value.trim()
    const name = document.getElementById('smName').value.trim() || userId
    const role = document.getElementById('smRole').value
    if (!userId) { showToast('请填写用户 ID', 'error'); return }
    try {
      await api.signMember(studioId, { userId, name, role })
      showToast('已签约')
      renderDetail(container, studioId)
    } catch (e) { showToast(e.message || '签约失败（可能已签约）', 'error') }
  })

  // 新建剧集
  const newShowForm = document.getElementById('newShowForm')
  document.getElementById('newShowBtn').addEventListener('click', () => {
    newShowForm.style.display = newShowForm.style.display === 'none' ? 'block' : 'none'
  })
  document.getElementById('swSubmit').addEventListener('click', async () => {
    const title = document.getElementById('swTitle').value.trim()
    const synopsis = document.getElementById('swSyn').value.trim()
    const coverIcon = document.getElementById('swIcon').value.trim() || '📺'
    if (!title) { showToast('请填写剧集标题', 'error'); return }
    try {
      await api.createShow(studioId, { title, synopsis, coverIcon })
      showToast('剧集已创建')
      renderDetail(container, studioId)
    } catch (e) { showToast(e.message || '创建失败', 'error') }
  })

  // 把作品归入某个 show
  container.querySelectorAll('.add-to-show').forEach((sel) => {
    sel.addEventListener('change', async () => {
      const showId = sel.dataset.show
      const projectId = sel.value
      if (!projectId) return
      try {
        await api.addProjectToShow(studioId, showId, projectId)
        showToast('已归入剧集')
        renderDetail(container, studioId)
      } catch (e) { showToast(e.message || '归入失败', 'error') }
    })
  })

  // 把我的项目归入厂牌
  document.getElementById('addWorkBtn').addEventListener('click', async () => {
    const projectId = document.getElementById('addWorkSelect').value
    if (!projectId) { showToast('请先选择项目', 'error'); return }
    try {
      await api.addProjectToStudio(studioId, projectId)
      showToast('已归入厂牌')
      renderDetail(container, studioId)
    } catch (e) { showToast(e.message || '归入失败', 'error') }
  })
}

function renderShow(s, works) {
  const showWorkIds = Array.isArray(s.projectIds) ? s.projectIds : []
  const showWorks = showWorkIds
    .map((id) => works.find((w) => String(w.id) === String(id) || String(w.projectId) === String(id)))
    .filter(Boolean)

  return `
    <div style="border:1px solid var(--border);border-radius:10px;padding:14px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <span style="font-size:20px;">${escapeHtml(s.coverIcon || '📺')}</span>
        <span style="font-weight:700;">${escapeHtml(s.title || '')}</span>
      </div>
      ${s.synopsis ? `<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">${escapeHtml(s.synopsis)}</div>` : ''}
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">
        ${showWorks.length ? showWorks.map((w) => `
          <div style="font-size:12px;color:var(--text-secondary);padding:4px 8px;background:var(--bg-secondary);border-radius:6px;">🎬 ${escapeHtml(w.name || w.title || '')}</div>
        `).join('') : '<div style="font-size:11px;color:var(--text-secondary);">剧集暂无作品</div>'}
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <span style="font-size:12px;color:var(--text-secondary);">归入作品：</span>
        <select class="form-input add-to-show" data-show="${escapeHtml(s.id)}" style="flex:1;font-size:12px;padding:6px 8px;">
          <option value="">— 从厂牌作品选择 —</option>
          ${works.map((w) => {
            const wid = w.projectId || w.id
            return `<option value="${escapeHtml(wid)}">${escapeHtml(w.name || w.title || wid)}</option>`
          }).join('')}
        </select>
      </div>
    </div>
  `
}

export default renderStudiosPage
