/**
 * 影评社区页（#/community）
 * - 社区身份切换（默认取当前登录用户 id，否则 usr_a；社区为独立用户命名空间）
 * - 发布影评（四维评分 + 影片标签）
 * - 热评榜单（daily/weekly/monthly）
 * - 个性化推荐（按社区身份，排除本人作品）
 * - 影评列表（点赞 / 举报）
 * - 举报管理（待处理列表 + 通过/驳回）
 * - 社区通知（列表 / 单条已读 / 全部已读）
 */

import { api } from '../api.js'
import { showToast } from '../app.js'
import { getCurrentUser } from './auth.js'

const state = {
  userId: 'usr_a',
  period: 'weekly',
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str === null || str === undefined ? '' : String(str)
  return div.innerHTML
}

function unwrap(res) {
  return (res && res.data !== undefined) ? res.data : res
}

export async function renderCommunityPage(container) {
  const me = getCurrentUser()
  if (me && me.id) state.userId = me.id
  await refresh(container)
}

async function refresh(container) {
  container.innerHTML = '<div class="loading"></div>'
  let leaderboard = []
  let reviews = []
  let reports = []
  let notifications = []
  let unreadCount = 0
  let recommendations = []

  try {
    const [lbRes, revRes, repRes, notifRes, recRes] = await Promise.all([
      api.getCommunityLeaderboard(state.period, 20),
      api.listCommunityReviews({ limit: 50 }),
      api.listPendingCommunityReports(),
      api.listCommunityNotifications(state.userId, { limit: 20 }),
      api.getCommunityRecommendations(state.userId, 10).catch(() => ({ data: [] })),
    ])
    leaderboard = unwrap(lbRes).leaderboard || []
    reviews = unwrap(revRes) || []
    reports = unwrap(repRes) || []
    const notifData = unwrap(notifRes)
    notifications = notifData.items || []
    unreadCount = notifData.unreadCount || 0
    recommendations = unwrap(recRes) || []
  } catch (err) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-text">影评社区加载失败：${escapeHtml(err.message)}</div>
        <button class="btn" onclick="location.hash=''">返回首页</button>
      </div>`
    return
  }

  container.innerHTML = `
    <div style="max-width:1080px;margin:0 auto;padding:24px;">
      <div class="page-header" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap;">
        <div>
          <h1 class="page-title" style="margin-bottom:6px;">🗣️ 影评社区</h1>
          <p style="color:var(--text-secondary);font-size:13px;margin:0;">发布影评、看热评榜单、拿个性化推荐、管理举报与通知</p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label style="font-size:12px;color:var(--text-secondary);">社区身份</label>
          <input id="commIdentity" class="form-input" style="width:160px;padding:6px 8px;" value="${escapeHtml(state.userId)}" />
          <button id="commIdentityApply" class="btn btn-sm">切换</button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;">
        <section class="card" style="padding:16px;">
          <h3 style="margin-top:0;">📝 发布影评</h3>
          <form id="commReviewForm" style="display:grid;gap:8px;">
            <input class="form-input" name="title" placeholder="标题 *" required />
            <input class="form-input" name="movieId" placeholder="影片 ID（可选，如 mov_dune）" />
            <textarea class="form-input" name="content" rows="2" placeholder="短评（可选）"></textarea>
            <input class="form-input" name="movieTags" placeholder="影片标签，逗号分隔（如 sci-fi,epic）" />
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;">
              <input class="form-input" name="storyScore" type="number" min="0" max="10" step="0.1" placeholder="故事" />
              <input class="form-input" name="visualScore" type="number" min="0" max="10" step="0.1" placeholder="画面" />
              <input class="form-input" name="performanceScore" type="number" min="0" max="10" step="0.1" placeholder="表演" />
              <input class="form-input" name="soundtrackScore" type="number" min="0" max="10" step="0.1" placeholder="配乐" />
            </div>
            <button class="btn btn-primary" type="submit">发布</button>
          </form>
        </section>

        <section class="card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;">🔥 热评榜单</h3>
            <div id="commPeriod" style="display:flex;gap:4px;">
              ${['daily', 'weekly', 'monthly'].map((p) => `
                <button class="btn btn-sm ${p === state.period ? 'btn-primary' : ''}" data-period="${p}">${p === 'daily' ? '日' : p === 'weekly' ? '周' : '月'}</button>
              `).join('')}
            </div>
          </div>
          <ol id="commLeaderboard" style="margin:12px 0 0;padding-left:20px;">
            ${leaderboard.length ? leaderboard.map((x) => `
              <li style="margin-bottom:6px;">
                <a href="#/community" data-review="${escapeHtml(x.reviewId)}" style="color:var(--text-primary);">${escapeHtml(x.title || x.reviewId)}</a>
                <span style="color:var(--text-secondary);font-size:12px;"> · 热度 ${escapeHtml(x.heat)} · 评分 ${escapeHtml(x.overallScore)}</span>
              </li>`).join('') : '<li style="color:var(--text-secondary);">暂无榜单数据（可先发布影评或运行 npm run seed:community）</li>'}
          </ol>
        </section>
      </div>

      <section class="card" style="padding:16px;margin-top:16px;">
        <h3 style="margin-top:0;">🎯 为你推荐 <span style="font-size:12px;color:var(--text-secondary);">（身份：${escapeHtml(state.userId)}）</span></h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;">
          ${recommendations.length ? recommendations.map((r) => `
            <div class="card" style="padding:10px;border:1px solid var(--border-color);">
              <div style="font-weight:600;">${escapeHtml(r.title || r.reviewId)}</div>
              <div style="font-size:12px;color:var(--text-secondary);">匹配分 ${escapeHtml(r.score)} · 评分 ${escapeHtml(r.overallScore)}</div>
            </div>`).join('') : '<div style="color:var(--text-secondary);font-size:13px;">暂无推荐</div>'}
        </div>
      </section>

      <section class="card" style="padding:16px;margin-top:16px;">
        <h3 style="margin-top:0;">🎬 影评列表</h3>
        <div style="display:grid;gap:10px;">
          ${reviews.length ? reviews.map((r) => `
            <div class="card" style="padding:12px;border:1px solid var(--border-color);">
              <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
                <div>
                  <div style="font-weight:600;">${escapeHtml(r.title)}</div>
                  <div style="font-size:12px;color:var(--text-secondary);">作者 ${escapeHtml(r.userId)} · 综合 ${escapeHtml(r.overallScore)} · 赞 ${escapeHtml(r.likeCount || 0)}${(r.movieTags && r.movieTags.length) ? ' · ' + escapeHtml(r.movieTags.join('/')) : ''}</div>
                </div>
                <div style="display:flex;gap:6px;align-items:flex-start;">
                  <button class="btn btn-sm" data-like="${escapeHtml(r.id)}">👍 点赞</button>
                  <button class="btn btn-sm" data-report="${escapeHtml(r.id)}">🚩 举报</button>
                </div>
              </div>
            </div>`).join('') : '<div style="color:var(--text-secondary);font-size:13px;">暂无影评</div>'}
        </div>
      </section>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:16px;margin-top:16px;">
        <section class="card" style="padding:16px;">
          <h3 style="margin-top:0;">🚩 待处理举报 <span style="font-size:12px;color:var(--text-secondary);">(${reports.length})</span></h3>
          <div style="display:grid;gap:8px;">
            ${reports.length ? reports.map((rep) => `
              <div style="border:1px solid var(--border-color);border-radius:8px;padding:10px;">
                <div style="font-size:13px;">举报人 ${escapeHtml(rep.reporterId)} 举报影评 ${escapeHtml(rep.reviewId)}</div>
                <div style="font-size:12px;color:var(--text-secondary);margin:2px 0 8px;">原因：${escapeHtml(rep.reason)}</div>
                <div style="display:flex;gap:6px;">
                  <button class="btn btn-sm" data-process="${escapeHtml(rep.id)}" data-decision="approved">通过（隐藏影评）</button>
                  <button class="btn btn-sm" data-process="${escapeHtml(rep.id)}" data-decision="rejected">驳回</button>
                </div>
              </div>`).join('') : '<div style="color:var(--text-secondary);font-size:13px;">暂无待处理举报</div>'}
          </div>
        </section>

        <section class="card" style="padding:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;">🔔 社区通知 <span style="font-size:12px;color:var(--text-secondary);">未读 ${unreadCount}</span></h3>
            <button id="commReadAll" class="btn btn-sm">全部已读</button>
          </div>
          <div style="display:grid;gap:8px;margin-top:10px;">
            ${notifications.length ? notifications.map((n) => `
              <div style="border:1px solid var(--border-color);border-radius:8px;padding:10px;opacity:${n.isRead ? 0.6 : 1};">
                <div style="font-size:13px;">${escapeHtml(n.message || n.type)}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
                  <span style="font-size:11px;color:var(--text-secondary);">${escapeHtml(n.type)} · ${escapeHtml(n.createdAt)}</span>
                  ${n.isRead ? '<span style="font-size:11px;color:var(--text-secondary);">已读</span>' : `<button class="btn btn-sm" data-notif-read="${escapeHtml(n.id)}">标记已读</button>`}
                </div>
              </div>`).join('') : '<div style="color:var(--text-secondary);font-size:13px;">暂无通知</div>'}
          </div>
        </section>
      </div>
    </div>
  `

  bindHandlers(container)
}

function bindHandlers(container) {
  // 切换社区身份
  container.querySelector('#commIdentityApply')?.addEventListener('click', () => {
    const val = container.querySelector('#commIdentity')?.value?.trim()
    if (val) {
      state.userId = val
      refresh(container)
    }
  })

  // 榜单周期
  container.querySelectorAll('#commPeriod button[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.period = btn.dataset.period
      refresh(container)
    })
  })

  // 发布影评
  container.querySelector('#commReviewForm')?.addEventListener('submit', async (e) => {
    e.preventDefault()
    const form = e.target
    const fd = new FormData(form)
    const num = (v) => (v === '' || v === null ? undefined : Number(v))
    const payload = {
      userId: state.userId,
      title: (fd.get('title') || '').trim(),
      movieId: (fd.get('movieId') || '').trim() || undefined,
      content: (fd.get('content') || '').trim() || undefined,
      movieTags: (fd.get('movieTags') || '').split(',').map((s) => s.trim()).filter(Boolean),
      storyScore: num(fd.get('storyScore')),
      visualScore: num(fd.get('visualScore')),
      performanceScore: num(fd.get('performanceScore')),
      soundtrackScore: num(fd.get('soundtrackScore')),
    }
    try {
      await api.createCommunityReview(payload)
      showToast('影评已发布', 'success')
      refresh(container)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })

  // 点赞
  container.querySelectorAll('button[data-like]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.likeCommunityReview(btn.dataset.like, state.userId)
        showToast('已点赞', 'success')
        refresh(container)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 举报
  container.querySelectorAll('button[data-report]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const reason = window.prompt('举报原因：')
      if (!reason) return
      try {
        await api.createCommunityReport({ reviewId: btn.dataset.report, reporterId: state.userId, reason })
        showToast('举报已提交', 'success')
        refresh(container)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 处理举报
  container.querySelectorAll('button[data-process]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.processCommunityReport(btn.dataset.process, { decision: btn.dataset.decision, adminId: state.userId })
        showToast('已处理', 'success')
        refresh(container)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 单条通知已读
  container.querySelectorAll('button[data-notif-read]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await api.markCommunityNotificationRead(btn.dataset.notifRead)
        refresh(container)
      } catch (err) {
        showToast(err.message, 'error')
      }
    })
  })

  // 全部已读
  container.querySelector('#commReadAll')?.addEventListener('click', async () => {
    try {
      await api.markAllCommunityNotificationsRead(state.userId)
      refresh(container)
    } catch (err) {
      showToast(err.message, 'error')
    }
  })
}
