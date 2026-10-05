/**
 * R28：创意片头页
 * - 模板卡片网格（GET /api/title-sequences）
 * - 填写标题/副标题并选择项目，POST /api/title-sequences/:id/generate
 * - 生成后 <video> 预览
 * - "插入项目片头"：作为镜头前插到所选项目 shots 并重排 index，PUT /api/projects/:id
 */

import { api } from '../api.js'
import { showToast } from '../app.js'

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str == null ? '' : String(str)
  return div.innerHTML
}

export async function renderTitleSequencesPage(container) {
  container.innerHTML = '<div class="loading"></div>'

  let templates = []
  let projects = []
  try {
    const [tplRes, projRes] = await Promise.all([
      api.listTitleSequences(),
      api.listProjects({ limit: 100 }),
    ])
    templates = Array.isArray(tplRes) ? tplRes : tplRes.items || tplRes.templates || []
    projects = projRes.items || projRes.projects || projRes || []
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">片头模板加载失败：${escapeHtml(err.message)}</div>
        <button class="btn" onclick="location.hash=''">返回首页</button>
      </div>
    `
    return
  }

  container.innerHTML = `
    <div style="max-width:1200px;margin:0 auto;padding:24px;">
      <div class="page-header" style="margin-bottom:20px;">
        <div>
          <h1 class="page-title" style="margin-bottom:6px;">🎬 创意片头</h1>
          <p style="color:var(--text-secondary);font-size:13px;margin:0;">选择片头模板，填写标题与项目，一键生成电影感开场动画</p>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:18px;">
        ${templates.map((t) => renderTemplateCard(t, projects)).join('')}
      </div>
    </div>
  `

  // 绑定每个卡片的事件
  container.querySelectorAll('.ts-card').forEach((card) => {
    const tplId = card.dataset.id
    const generateBtn = card.querySelector('.ts-generate-btn')
    const insertBtn = card.querySelector('.ts-insert-btn')

    generateBtn.addEventListener('click', async () => {
      const projectId = card.querySelector('.ts-project-select').value
      const title = card.querySelector('.ts-title-input').value.trim()
      const subtitle = card.querySelector('.ts-subtitle-input').value.trim()
      const videoBox = card.querySelector('.ts-video-box')

      if (!projectId) {
        showToast('请先选择要生成到的项目', 'error')
        return
      }
      if (!title) {
        showToast('请填写片头标题', 'error')
        return
      }

      generateBtn.disabled = true
      generateBtn.textContent = '生成中…'
      try {
        const result = await api.generateTitleSequence(tplId, { projectId, title, subtitle })
        const videoUrl = result.videoUrl || result.url || (result.video && result.video.url)
        if (!videoUrl) {
          throw new Error('生成成功但未返回视频地址')
        }
        card.dataset.videoUrl = videoUrl
        card.dataset.duration = result.duration || 4
        videoBox.style.display = 'block'
        videoBox.innerHTML = `
          <video controls autoplay muted playsinline style="width:100%;border-radius:8px;background:#000;">
            <source src="${escapeHtml(videoUrl)}" type="video/mp4" />
          </video>
        `
        insertBtn.style.display = 'inline-flex'
        showToast('片头生成成功')
      } catch (err) {
        showToast(err.message || '生成失败', 'error')
      } finally {
        generateBtn.disabled = false
        generateBtn.textContent = '✨ 生成片头'
      }
    })

    insertBtn.addEventListener('click', async () => {
      const projectId = card.querySelector('.ts-project-select').value
      const videoUrl = card.dataset.videoUrl
      const title = card.querySelector('.ts-title-input').value.trim()
      if (!projectId || !videoUrl) {
        showToast('请先生成片头', 'error')
        return
      }
      insertBtn.disabled = true
      insertBtn.textContent = '插入中…'
      try {
        const project = await api.getProject(projectId)
        const shots = Array.isArray(project.shots) ? [...project.shots] : []
        const titleShot = {
          id: `title-${Date.now()}`,
          index: 0,
          description: `片头：${title}`,
          duration: Number(card.dataset.duration) || 4,
          videoUrl,
          status: 'completed',
          characterIds: [],
        }
        shots.unshift(titleShot)
        shots.forEach((s, i) => { s.index = i })
        await api.updateProject(projectId, { shots })
        showToast(`已插入到项目「${project.name || ''}」最前面（共 ${shots.length} 个镜头）`)
      } catch (err) {
        showToast(err.message || '插入失败', 'error')
      } finally {
        insertBtn.disabled = false
        insertBtn.textContent = '📥 插入项目片头'
      }
    })
  })
}

function renderTemplateCard(tpl, projects) {
  const musicMood = tpl.musicMood || tpl.music_emotion || ''
  return `
    <div class="card ts-card" data-id="${escapeHtml(tpl.id)}" style="padding:20px;display:flex;flex-direction:column;gap:12px;">
      <div>
        <div style="font-weight:700;font-size:16px;margin-bottom:6px;">${escapeHtml(tpl.name || '未命名模板')}</div>
        <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">${escapeHtml(tpl.visualDescription || tpl.description || '')}</div>
        ${musicMood ? `<div style="margin-top:8px;font-size:12px;color:var(--primary);">🎵 推荐配乐情绪：${escapeHtml(musicMood)}（片头为静音，可在配音轨按此情绪添加 BGM）</div>` : ''}
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">片头标题</label>
        <input class="form-input ts-title-input" type="text" placeholder="例如：梦境重启" value="${escapeHtml(tpl.defaultTitle || '')}" />
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">副标题</label>
        <input class="form-input ts-subtitle-input" type="text" placeholder="例如：A Dream Reel Story" value="${escapeHtml(tpl.defaultSubtitle || '')}" />
      </div>
      <div class="form-group" style="margin:0;">
        <label class="form-label">选择项目</label>
        <select class="form-input ts-project-select">
          <option value="">— 请选择项目 —</option>
          ${projects.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.name || p.id)}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-primary btn-block ts-generate-btn">✨ 生成片头</button>
      <div class="ts-video-box" style="display:none;"></div>
      <button class="btn btn-block ts-insert-btn" style="display:none;">📥 插入项目片头</button>
    </div>
  `
}

export default renderTitleSequencesPage
