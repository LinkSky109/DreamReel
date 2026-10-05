import { api } from '../api.js'
import { showToast } from '../app.js'

/**
 * R11：创作者主页
 */
export async function renderCreatorPage(container, userId) {
  container.innerHTML = '<div class="loading"></div>'

  try {
    const page = await api.getCreatorPage(userId)
    const { profile, works, stats } = page

    container.innerHTML = `
      <div class="page-header" style="max-width: 1100px; margin: 0 auto; padding: 24px;">
        <button class="btn btn-sm" id="creatorBackBtn">← 返回</button>

        <div class="card" style="margin-top: 16px; display:flex; gap:20px; align-items:center; flex-wrap:wrap;">
          <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#ec4899);
            display:flex;align-items:center;justify-content:center;font-size:32px;color:#fff;">
            ${(profile.displayName || '?').slice(0, 1)}
          </div>
          <div style="flex:1;min-width:200px;">
            <div style="font-size:22px;font-weight:700;">${profile.displayName}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">
              ${profile.bio || '这位创作者还没有填写简介'}
            </div>
          </div>
          <button class="btn btn-primary btn-sm" id="editProfileBtn">✏️ 编辑资料</button>
        </div>

        <div class="stats-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px;margin-top:16px;">
          ${[
            ['作品数', stats.workCount],
            ['总时长(s)', stats.totalDuration],
            ['已完成', stats.completedCount],
            ['获赞', stats.likeCount],
          ].map(([label, val]) => `
            <div class="card" style="text-align:center;padding:18px;">
              <div style="font-size:26px;font-weight:700;color:var(--primary);">${val}</div>
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">${label}</div>
            </div>
          `).join('')}
        </div>

        <div style="font-size:16px;font-weight:600;margin:24px 0 12px;">🎬 我的作品</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;">
          ${works.length ? works.map((w) => `
            <div class="card work-card" data-id="${w.id}" style="cursor:pointer;overflow:hidden;">
              <div style="height:110px;background:linear-gradient(135deg,#1e293b,#475569);
                display:flex;align-items:center;justify-content:center;font-size:30px;">🎞️</div>
              <div style="padding:12px;">
                <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${w.name}</div>
                <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">
                  ${w.shotCount} 镜头 · ${w.status}
                </div>
              </div>
            </div>
          `).join('') : '<div style="color:var(--text-secondary);">暂无作品</div>'}
        </div>
      </div>
    `

    document.getElementById('creatorBackBtn').addEventListener('click', () => {
      location.hash = '#/'
    })

    document.querySelectorAll('.work-card').forEach((card) => {
      card.addEventListener('click', () => {
        location.hash = `#/project/${card.dataset.id}`
      })
    })

    document.getElementById('editProfileBtn').addEventListener('click', () => {
      openEditProfile(profile, userId)
    })
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${error.message}</div></div>`
  }
}

function openEditProfile(profile, userId) {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;'
  modal.innerHTML = `
    <div class="card" style="width:90%;max-width:420px;padding:24px;">
      <div style="font-weight:700;font-size:16px;margin-bottom:16px;">编辑创作者资料</div>
      <label style="font-size:12px;">昵称</label>
      <input class="form-control" id="pfName" value="${profile.displayName}" style="margin-bottom:12px;">
      <label style="font-size:12px;">简介</label>
      <textarea class="form-control" id="pfBio" rows="3" style="margin-bottom:12px;">${profile.bio}</textarea>
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;margin-bottom:16px;">
        <input type="checkbox" id="pfPublic" ${profile.isPublic ? 'checked' : ''}> 公开主页
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-sm" id="pfCancel">取消</button>
        <button class="btn btn-primary btn-sm" id="pfSave">保存</button>
      </div>
    </div>
  `
  document.body.appendChild(modal)

  modal.querySelector('#pfCancel').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })

  modal.querySelector('#pfSave').addEventListener('click', async () => {
    try {
      await api.updateCreatorProfile(userId, {
        displayName: modal.querySelector('#pfName').value,
        bio: modal.querySelector('#pfBio').value,
        isPublic: modal.querySelector('#pfPublic').checked,
      })
      showToast('资料已保存')
      modal.remove()
      renderCreatorPage(document.getElementById('app'), userId)
    } catch (e) {
      showToast(e.message, 'error')
    }
  })
}
