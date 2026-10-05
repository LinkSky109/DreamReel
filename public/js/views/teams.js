import { api } from '../api.js'
import { showToast } from '../app.js'

/**
 * R12：团队协作空间
 */
export async function renderTeamsPage(container, teamId) {
  container.innerHTML = '<div class="loading"></div>'
  try {
    if (teamId) await renderDetail(container, teamId)
    else await renderList(container)
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${error.message}</div></div>`
  }
}

async function renderList(container) {
  const data = await api.listTeams()
  container.innerHTML = `
    <div style="max-width:1050px;margin:0 auto;padding:24px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;">
        <h2>👥 团队协作空间</h2>
        <button class="btn btn-primary" id="createTeamBtn">+ 创建团队</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:16px;">
        ${data.items.length ? data.items.map((t) => `
          <div class="card team-card" data-id="${t.id}" style="padding:18px;cursor:pointer;">
            <div style="font-weight:700;font-size:16px;margin-bottom:6px;">${t.name}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${t.description || '暂无简介'}</div>
            <div style="display:flex;gap:14px;font-size:12px;color:var(--text-secondary);">
              <span>👤 ${t.memberCount} 成员</span><span>🎬 ${t.projectCount} 项目</span>
            </div>
          </div>
        `).join('') : '<div style="color:var(--text-secondary);grid-column:1/-1;">还没有团队，点击右上角创建</div>'}
      </div>
    </div>
  `
  document.getElementById('createTeamBtn').addEventListener('click', async () => {
    const name = prompt('团队名称')
    if (!name) return
    const description = prompt('团队简介（可留空）') || ''
    const t = await api.createTeam({ name, description })
    showToast('团队已创建')
    location.hash = `#/team/${t.id}`
  })
  container.querySelectorAll('.team-card').forEach((c) => {
    c.addEventListener('click', () => { location.hash = `#/team/${c.dataset.id}` })
  })
}

async function renderDetail(container, teamId) {
  const [team, projectsData] = await Promise.all([
    api.getTeam(teamId),
    api.listTeamProjects(teamId),
  ])
  container.innerHTML = `
    <div style="max-width:1050px;margin:0 auto;padding:24px;">
      <button class="btn btn-sm" id="backTeams" style="margin-bottom:14px;">← 返回团队列表</button>
      <div class="card" style="padding:20px;margin-bottom:18px;">
        <h2 style="margin-bottom:4px;">${team.name}</h2>
        <div style="font-size:13px;color:var(--text-secondary);">${team.description || '暂无简介'}</div>
      </div>

      <div class="card" style="padding:20px;margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-weight:700;">成员（${team.memberCount}）</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
          ${team.members.map((m) => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:8px;font-size:13px;">
              <span>👤</span>
              <span style="flex:1;">${m.name}</span>
              <select class="form-control member-role" data-user="${m.userId}" style="width:auto;font-size:12px;"
                ${m.role === 'owner' ? 'disabled' : ''}>
                <option value="editor" ${m.role === 'editor' ? 'selected' : ''}>编辑者</option>
                <option value="viewer" ${m.role === 'viewer' ? 'selected' : ''}>查看者</option>
                ${m.role === 'owner' ? '<option selected>所有者</option>' : ''}
              </select>
              ${m.role === 'owner' ? '' : `<button class="btn btn-sm remove-member" data-user="${m.userId}">移除</button>`}
            </div>
          `).join('')}
        </div>
        <button class="btn" id="addMemberBtn" style="width:100%;">+ 添加成员</button>
      </div>

      <div class="card" style="padding:20px;">
        <div style="font-weight:700;margin-bottom:12px;">团队项目（${projectsData.total}）</div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
          ${projectsData.items.length ? projectsData.items.map((p) => `
            <div class="team-project" data-id="${p.id}" style="padding:10px;background:var(--bg-secondary);border-radius:8px;font-size:13px;cursor:pointer;">
              🎬 ${p.name} <span style="color:var(--text-secondary);font-size:11px;">· ${(p.shots||[]).length} 镜头</span>
            </div>
          `).join('') : '<div style="font-size:12px;color:var(--text-secondary);">暂无项目</div>'}
        </div>
        <button class="btn" id="addProjectBtn" style="width:100%;">+ 将我的项目加入团队</button>
      </div>
    </div>
  `

  document.getElementById('backTeams').addEventListener('click', () => { location.hash = '#/teams' })

  container.querySelectorAll('.team-project').forEach((el) => {
    el.addEventListener('click', () => { location.hash = `#/project/${el.dataset.id}` })
  })

  container.querySelectorAll('.member-role').forEach((sel) => {
    sel.addEventListener('change', async () => {
      await api.updateTeamMemberRole(teamId, sel.dataset.user, sel.value)
      showToast('角色已更新')
    })
  })
  container.querySelectorAll('.remove-member').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.removeTeamMember(teamId, btn.dataset.user)
      showToast('成员已移除')
      renderDetail(container, teamId)
    })
  })

  document.getElementById('addMemberBtn').addEventListener('click', async () => {
    const userId = prompt('成员 ID（如邮箱或用户名）')
    if (!userId) return
    const name = prompt('成员昵称') || userId
    const role = 'editor'
    try {
      await api.addTeamMember(teamId, { userId, name, role })
      showToast('成员已添加')
      renderDetail(container, teamId)
    } catch (e) { showToast(e.message, 'error') }
  })

  document.getElementById('addProjectBtn').addEventListener('click', async () => {
    const projectId = prompt('输入要加入团队的项目 ID')
    if (!projectId) return
    try {
      await api.addTeamProject(teamId, projectId)
      showToast('项目已加入团队')
      renderDetail(container, teamId)
    } catch (e) { showToast(e.message, 'error') }
  })
}
