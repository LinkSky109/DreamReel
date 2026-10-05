/**
 * R29：导演模式页
 * - 导演卡片网格（GET /api/directors），点击选中高亮
 * - 展示导演阐述 statement 与分维度区块（运镜/节奏/表演/色调光影/配乐情绪）
 * - 选择真实项目（GET /api/projects）+「启用该导演并编排分镜」→ POST /api/directors/:id/apply
 * - 应用后渲染逐镜指导表（guidance）；「关闭导演模式」→ POST /api/directors/disable
 */

import { api } from '../api.js'
import { showToast } from '../app.js'

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str == null ? '' : String(str)
  return div.innerHTML
}

export async function renderDirectorsPage(container) {
  container.innerHTML = '<div class="loading"></div>'

  let directors = []
  let projects = []
  try {
    const [dirRes, projRes] = await Promise.all([
      api.listDirectors(),
      api.listProjects({ limit: 100 }),
    ])
    directors = Array.isArray(dirRes) ? dirRes : dirRes.items || []
    projects = projRes.items || projRes.projects || projRes || []
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">导演列表加载失败：${escapeHtml(err.message)}</div>
        <button class="btn" onclick="location.hash=''">返回首页</button>
      </div>
    `
    return
  }

  container.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:24px;">
      <div class="page-header" style="margin-bottom:20px;">
        <div>
          <h1 class="page-title" style="margin-bottom:6px;">🎬 导演模式</h1>
          <p style="color:var(--text-secondary);font-size:13px;margin:0;">选择一位导演作为创作顾问，把其运镜、节奏、表演、光影与配乐风格一次性编排进你的项目分镜</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:24px;">
        ${directors.map((d) => renderDirectorCard(d)).join('')}
      </div>
      <div id="directorDetail"></div>
    </div>
  `

  const detailEl = container.querySelector('#directorDetail')

  if (!directors.length) {
    container.querySelector('.page-header').insertAdjacentHTML('afterend',
      '<div class="empty-state"><div class="empty-state-text">暂无导演档案</div></div>')
  }

  container.querySelectorAll('.dir-card').forEach((card) => {
    card.addEventListener('click', () => {
      container.querySelectorAll('.dir-card').forEach((c) => c.classList.remove('selected'))
      card.classList.add('selected')
      const director = directors.find((d) => String(d.id) === String(card.dataset.id))
      if (director) renderDetail(detailEl, director, projects)
    })
  })

  // 默认选中第一位，便于直接查看
  const firstCard = container.querySelector('.dir-card')
  if (firstCard) firstCard.click()
}

function renderDirectorCard(d) {
  return `
    <div class="card dir-card" data-id="${escapeHtml(d.id)}"
      style="padding:18px;cursor:pointer;transition:all .15s;border:1px solid transparent;">
      <div style="font-weight:700;font-size:16px;margin-bottom:4px;">${escapeHtml(d.name || '未命名导演')}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">${escapeHtml(d.tagline || '')}</div>
      <div style="display:inline-block;font-size:11px;color:var(--primary);background:var(--bg-secondary);padding:2px 8px;border-radius:10px;">${escapeHtml(d.era || '')}</div>
    </div>
  `
}

function renderDetail(detailEl, director, projects) {
  const c = director.camera || {}
  const p = director.pacing || {}
  const perf = director.performance || {}
  const cl = director.colorLighting || {}
  const moves = Array.isArray(c.moves) ? c.moves : []
  const cues = Array.isArray(perf.cues) ? perf.cues : []
  const palette = Array.isArray(cl.palette) ? cl.palette : []

  detailEl.innerHTML = `
    <div class="card" style="padding:24px;">
      <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
        <h2 style="margin:0;">${escapeHtml(director.name || '')}</h2>
        <span style="font-size:12px;color:var(--text-secondary);">${escapeHtml(director.era || '')} · ${escapeHtml(director.tagline || '')}</span>
      </div>

      ${director.statement ? `
        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;margin-bottom:20px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:6px;">🎙 导演阐述</div>
          <p style="margin:0;font-size:13px;line-height:1.8;color:var(--text-secondary);">${escapeHtml(director.statement)}</p>
        </div>` : ''}

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;margin-bottom:24px;">
        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">🎥 运镜偏好</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">${escapeHtml(c.style || '—')}</div>
          ${moves.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;">${moves.map((m) => `<span style="font-size:11px;background:var(--bg-hover);padding:2px 8px;border-radius:10px;">${escapeHtml(m)}</span>`).join('')}</div>` : ''}
        </div>

        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">⏱ 节奏</div>
          ${p.tempo ? `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">节奏：${escapeHtml(p.tempo)}</div>` : ''}
          <div style="font-size:13px;color:var(--text-secondary);">${escapeHtml(p.description || '—')}</div>
        </div>

        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">🎭 表演指导</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">${escapeHtml(perf.style || '—')}</div>
          ${cues.length ? `<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text-secondary);line-height:1.8;">${cues.map((q) => `<li>${escapeHtml(q)}</li>`).join('')}</ul>` : ''}
        </div>

        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">🎨 色调光影</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:4px;">光影：${escapeHtml(cl.lighting || '—')}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-bottom:6px;">${escapeHtml(cl.description || '')}</div>
          ${palette.length ? `<div style="display:flex;gap:6px;">${palette.map((col) => `<span title="${escapeHtml(col)}" style="width:20px;height:20px;border-radius:4px;background:${escapeHtml(col)};display:inline-block;"></span>`).join('')}</div>` : ''}
        </div>

        <div style="background:var(--bg-secondary);border-radius:10px;padding:16px;grid-column:1/-1;">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px;">🎵 配乐情绪（风格建议，需在配音轨自行添加 BGM）</div>
          <div style="font-size:13px;color:var(--text-secondary);">${escapeHtml(director.musicMood || '—')}</div>
        </div>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:20px;">
        <div style="font-weight:700;font-size:14px;margin-bottom:12px;">应用到项目</div>
        ${projects.length ? `
          <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:16px;">
            <div class="form-group" style="margin:0;min-width:280px;flex:1;">
              <label class="form-label">选择项目</label>
              <select class="form-input dir-project-select">
                <option value="">— 请选择项目 —</option>
                ${projects.map((pr) => `<option value="${escapeHtml(pr.id)}">${escapeHtml(pr.name || pr.id)}</option>`).join('')}
              </select>
            </div>
            <button class="btn btn-primary dir-apply-btn">✨ 启用该导演并编排分镜</button>
            <button class="btn dir-disable-btn" style="display:none;">🛑 关闭导演模式</button>
          </div>
          <div class="dir-guidance-box"></div>
        ` : `
          <div class="empty-state" style="padding:20px;">
            <div class="empty-state-text">还没有可编排的项目，请先在首页创建一个短片项目</div>
          </div>
        `}
      </div>
    </div>
  `

  if (!projects.length) return

  const projectSelect = detailEl.querySelector('.dir-project-select')
  const applyBtn = detailEl.querySelector('.dir-apply-btn')
  const disableBtn = detailEl.querySelector('.dir-disable-btn')
  const guidanceBox = detailEl.querySelector('.dir-guidance-box')

  applyBtn.addEventListener('click', async () => {
    const projectId = projectSelect.value
    if (!projectId) {
      showToast('请先选择项目', 'error')
      return
    }
    applyBtn.disabled = true
    applyBtn.textContent = '编排中…'
    try {
      const result = await api.applyDirector(director.id, projectId)
      showToast(`已启用「${director.name}」并完成分镜编排`)
      disableBtn.style.display = 'inline-flex'
      renderGuidance(guidanceBox, result && result.guidance, projectId, disableBtn, () => {
        guidanceBox.innerHTML = ''
        disableBtn.style.display = 'none'
      })
    } catch (err) {
      showToast(err.message || '导演应用失败', 'error')
    } finally {
      applyBtn.disabled = false
      applyBtn.textContent = '✨ 启用该导演并编排分镜'
    }
  })

  disableBtn.addEventListener('click', async () => {
    const projectId = projectSelect.value
    if (!projectId) {
      showToast('请先选择项目', 'error')
      return
    }
    disableBtn.disabled = true
    disableBtn.textContent = '关闭中…'
    try {
      await api.disableDirector(projectId)
      showToast('已关闭导演模式')
      guidanceBox.innerHTML = ''
      disableBtn.style.display = 'none'
    } catch (err) {
      showToast(err.message || '关闭失败', 'error')
    } finally {
      disableBtn.disabled = false
      disableBtn.textContent = '🛑 关闭导演模式'
    }
  })
}

function renderGuidance(box, guidance, projectId, disableBtn, onDisable) {
  const list = Array.isArray(guidance) ? guidance : []
  if (!list.length) {
    box.innerHTML = '<div style="font-size:13px;color:var(--text-secondary);">编排完成，但未返回逐镜指导。</div>'
    return
  }
  box.innerHTML = `
    <div style="margin-top:8px;">
      <div style="font-weight:700;font-size:13px;margin-bottom:10px;">📋 逐镜指导（已写入项目 ${escapeHtml(projectId)}，共 ${list.length} 镜）</div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="text-align:left;color:var(--text-secondary);font-size:12px;">
              <th style="padding:8px;border-bottom:1px solid var(--border);">镜头#</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);">运镜</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);">建议时长</th>
              <th style="padding:8px;border-bottom:1px solid var(--border);">表演与节奏指导</th>
            </tr>
          </thead>
          <tbody>
            ${list.map((g) => `
              <tr style="vertical-align:top;">
                <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--primary);">${escapeHtml(g.index != null ? g.index : '—')}</td>
                <td style="padding:8px;border-bottom:1px solid var(--border);">${escapeHtml(g.cameraMovement || '—')}</td>
                <td style="padding:8px;border-bottom:1px solid var(--border);">${escapeHtml(g.duration != null ? g.duration + 's' : '—')}</td>
                <td style="padding:8px;border-bottom:1px solid var(--border);color:var(--text-secondary);line-height:1.6;">${escapeHtml(g.directorGuidance || '—')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `
  // onDisable kept for potential future use; reset handled by disable button
  void onDisable
}

export default renderDirectorsPage
