import { api } from '../api.js'
import { showToast } from '../app.js'

/**
 * R10：创作挑战与活动
 */
export async function renderChallengesPage(container) {
  container.innerHTML = '<div class="loading"></div>'
  try {
    const list = await api.listChallenges()
    container.innerHTML = `
      <div style="max-width:1100px;margin:0 auto;padding:24px;">
        <h2 style="margin-bottom:6px;">🏆 创作挑战</h2>
        <p style="color:var(--text-secondary);font-size:13px;margin-bottom:20px;">参与官方主题挑战，赢取流量扶持与会员奖励</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:18px;">
          ${list.items.map((c) => `
            <div class="card challenge-card" data-id="${c.id}" style="padding:20px;cursor:pointer;">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;">
                <div style="font-size:34px;">${c.coverIcon}</div>
                <div>
                  <div style="font-weight:700;font-size:17px;">${c.title}</div>
                  <div style="font-size:11px;color:var(--text-secondary);">${c.startAt} ~ ${c.endAt}</div>
                </div>
              </div>
              <div style="font-size:12px;color:var(--primary);margin-bottom:8px;">主题：${c.theme}</div>
              <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">${c.description}</div>
              <div style="font-size:11px;margin-top:10px;color:var(--warning);">🎁 ${c.reward}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `
    container.querySelectorAll('.challenge-card').forEach((card) => {
      card.addEventListener('click', () => openChallengeDetail(card.dataset.id))
    })
  } catch (error) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">加载失败：${error.message}</div></div>`
  }
}

async function openChallengeDetail(challengeId) {
  const detail = await api.getChallengeDetail(challengeId)
  const modal = document.createElement('div')
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:1200;'
  modal.innerHTML = `
    <div class="card" style="width:92%;max-width:600px;padding:24px;max-height:90vh;overflow:auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:18px;font-weight:700;">${detail.coverIcon} ${detail.title}</div>
        <button class="btn btn-sm modal-close">✕</button>
      </div>
      <div style="font-size:13px;color:var(--primary);margin-bottom:6px;">主题：${detail.theme}</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${detail.description}</div>
      <div style="font-size:12px;margin-bottom:14px;">
        <div style="font-weight:600;margin-bottom:4px;">参赛规则：</div>
        ${detail.rules.map((r) => `<div style="color:var(--text-secondary);">• ${r}</div>`).join('')}
      </div>
      <div style="font-size:12px;color:var(--warning);margin-bottom:16px;">🎁 ${detail.reward}</div>
      <button class="btn btn-primary" id="joinChallengeBtn" style="width:100%;">🚀 立即参与（创建投稿项目）</button>

      <div style="font-weight:600;font-size:14px;margin:18px 0 10px;">作品排行（${detail.entryCount}）</div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${detail.entries.length ? detail.entries.map((e, i) => `
          <div class="entry-row" data-id="${e.id}" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-secondary);border-radius:8px;font-size:13px;cursor:pointer;">
            <span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
            <span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${e.name}</span>
            <span style="font-size:11px;color:var(--text-secondary);">❤️ ${e.likeCount}</span>
          </div>
        `).join('') : '<div style="font-size:12px;color:var(--text-secondary);">还没有投稿作品</div>'}
      </div>
    </div>
  `
  document.body.appendChild(modal)
  modal.querySelector('.modal-close').addEventListener('click', () => modal.remove())
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove() })

  modal.querySelector('#joinChallengeBtn').addEventListener('click', async () => {
    const r = await api.joinChallenge(challengeId, {})
    showToast('已创建投稿项目，去创作吧')
    modal.remove()
    location.hash = `#/project/${r.project.id}`
  })

  modal.querySelectorAll('.entry-row').forEach((row) => {
    row.addEventListener('click', () => {
      modal.remove()
      location.hash = `#/project/${row.dataset.id}`
    })
  })
}
