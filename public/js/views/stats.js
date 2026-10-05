import { api } from '../api.js'
import { showToast } from '../app.js'
import { i18n } from '../i18n.js'

const STYLE_NAMES = {
  none: '无风格',
  nolan: '诺兰',
  'wes-anderson': '韦斯·安德森',
  tarantino: '昆汀',
  'wong-kar-wai': '王家卫',
  'studio-ghibli': '吉卜力',
  'blade-runner': '赛博朋克',
  minimalist: '极简主义',
  documentary: '纪录片',
  noir: '黑色电影',
  cinematic: '电影感',
}

const PLATFORM_NAMES = {
  landscape: '横屏 16:9',
  portrait: '竖屏 9:16',
  square: '方形 1:1',
}

/**
 * 渲染统计仪表盘页面
 */
export async function renderStatsPage(container) {
  container.innerHTML = `
    <div class="stats-page">
      <div class="stats-header">
        <h1 class="stats-title">📊 ${i18n.t('dashboard')}</h1>
        <p class="stats-subtitle">${i18n.t('usageTrend')}</p>
      </div>

      <div class="loading-overlay">
        <div class="loading"></div>
        <span>${i18n.t('loading')}</span>
      </div>
    </div>
  `

  try {
    const data = await api.getDashboard()
    renderStatsContent(container, data)
  } catch (err) {
    container.innerHTML = `
      <div class="stats-page">
        <div class="empty-state">
          <div class="empty-state-icon">⚠️</div>
          <div class="empty-state-text">加载失败：${err.message}</div>
        </div>
      </div>
    `
  }
}

function renderStatsContent(container, data) {
  const { overview, trend, styleDistribution, platformDistribution, quotaUsage, recentProjects } = data

  container.innerHTML = `
    <div class="stats-page">
      <div class="stats-header">
        <h1 class="stats-title">📊 创作数据</h1>
        <p class="stats-subtitle">你的创作活动概览</p>
      </div>

      <!-- 概览卡片 -->
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-card-icon">🎬</div>
          <div class="stat-card-value">${overview.totalProjects}</div>
          <div class="stat-card-label">项目总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">📹</div>
          <div class="stat-card-value">${overview.totalShots}</div>
          <div class="stat-card-label">镜头总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">✅</div>
          <div class="stat-card-value">${overview.completedShots}</div>
          <div class="stat-card-label">已完成镜头</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">🎨</div>
          <div class="stat-card-value">${overview.totalCharacters}</div>
          <div class="stat-card-label">角色总数</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">⚡</div>
          <div class="stat-card-value">${overview.totalVideoGenerations}</div>
          <div class="stat-card-label">视频生成次数</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon">📤</div>
          <div class="stat-card-value">${overview.totalExports}</div>
          <div class="stat-card-label">导出次数</div>
        </div>
      </div>

      <div class="stats-grid">
        <!-- 创作趋势 -->
        <div class="stats-panel">
          <h3 class="stats-panel-title">📈 近 14 天创作趋势</h3>
          <div class="trend-chart">
            ${renderTrendChart(trend)}
          </div>
          <div class="trend-legend">
            <span class="legend-item"><span class="legend-dot" style="background: var(--accent)"></span>视频生成</span>
            <span class="legend-item"><span class="legend-dot" style="background: var(--success)"></span>新建项目</span>
            <span class="legend-item"><span class="legend-dot" style="background: var(--warning)"></span>导出</span>
          </div>
        </div>

        <!-- 额度使用 -->
        <div class="stats-panel">
          <h3 class="stats-panel-title">💎 额度使用</h3>
          <div class="quota-section">
            <div class="quota-item">
              <div class="quota-label">
                <span>视频生成（今日）</span>
                <span>${quotaUsage.video.daily.used}/${quotaUsage.video.daily.limit}</span>
              </div>
              <div class="quota-bar">
                <div class="quota-fill" style="width: ${(quotaUsage.video.daily.used / quotaUsage.video.daily.limit) * 100}%"></div>
              </div>
            </div>
            <div class="quota-item">
              <div class="quota-label">
                <span>配音时长（本月）</span>
                <span>${Math.round(quotaUsage.dubbing.monthly.used / 60)}分/${Math.round(quotaUsage.dubbing.monthly.limit / 60)}分</span>
              </div>
              <div class="quota-bar">
                <div class="quota-fill" style="width: ${(quotaUsage.dubbing.monthly.used / quotaUsage.dubbing.monthly.limit) * 100}%; background: var(--success)"></div>
              </div>
            </div>
          </div>
          <div class="completion-rate">
            <div class="completion-label">镜头完成率</div>
            <div class="completion-value">${overview.completionRate}%</div>
            <div class="completion-ring">
              <svg viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-tertiary)" stroke-width="8"/>
                <circle cx="50" cy="50" r="40" fill="none" stroke="var(--accent)" stroke-width="8"
                  stroke-dasharray="${2 * Math.PI * 40}"
                  stroke-dashoffset="${2 * Math.PI * 40 * (1 - overview.completionRate / 100)}"
                  transform="rotate(-90 50 50)" stroke-linecap="round"/>
              </svg>
            </div>
          </div>
        </div>

        <!-- 风格分布 -->
        <div class="stats-panel">
          <h3 class="stats-panel-title">🎨 风格偏好</h3>
          ${styleDistribution.length > 0 ? `
            <div class="style-distribution">
              ${styleDistribution.slice(0, 6).map((item) => `
                <div class="style-item">
                  <div class="style-name">${STYLE_NAMES[item.styleId] || item.styleId}</div>
                  <div class="style-bar">
                    <div class="style-fill" style="width: ${(item.count / styleDistribution[0].count) * 100}%"></div>
                  </div>
                  <div class="style-count">${item.count}</div>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-hint">暂无风格使用数据</div>'}
        </div>

        <!-- 平台分布 -->
        <div class="stats-panel">
          <h3 class="stats-panel-title">📱 平台分布</h3>
          ${platformDistribution.length > 0 ? `
            <div class="platform-distribution">
              ${platformDistribution.map((item) => `
                <div class="platform-item">
                  <div class="platform-name">${PLATFORM_NAMES[item.platform] || item.platform}</div>
                  <div class="platform-count">${item.count} 个项目</div>
                </div>
              `).join('')}
            </div>
          ` : '<div class="empty-hint">暂无平台数据</div>'}
        </div>
      </div>

      <!-- 最近项目 -->
      <div class="stats-panel">
        <h3 class="stats-panel-title">🕐 最近活跃项目</h3>
        ${recentProjects.length > 0 ? `
          <div class="recent-projects">
            ${recentProjects.map((p) => `
              <a href="#/project/${p.id}" class="recent-project-item">
                <div class="recent-project-name">${escapeHtml(p.name)}</div>
                <div class="recent-project-meta">
                  <span>${p.completedShots}/${p.shotCount} 镜头</span>
                  <span>${STYLE_NAMES[p.style] || p.style}</span>
                  <span>${formatDate(p.updatedAt)}</span>
                </div>
              </a>
            `).join('')}
          </div>
        ` : '<div class="empty-hint">暂无项目</div>'}
      </div>
    </div>
  `
}

function renderTrendChart(trend) {
  const maxValue = Math.max(...trend.map((d) => Math.max(d.videoGenerations, d.projectsCreated, d.exports)), 1)
  const chartHeight = 120

  return `
    <div class="trend-bars">
      ${trend.map((day) => {
        const videoHeight = (day.videoGenerations / maxValue) * chartHeight
        const projectHeight = (day.projectsCreated / maxValue) * chartHeight
        const exportHeight = (day.exports / maxValue) * chartHeight
        const dateLabel = day.date.slice(5) // MM-DD
        return `
          <div class="trend-bar-group" title="${day.date}: 视频${day.videoGenerations} 项目${day.projectsCreated} 导出${day.exports}">
            <div class="trend-bar-stack">
              <div class="trend-bar video" style="height: ${videoHeight}px"></div>
              <div class="trend-bar project" style="height: ${projectHeight}px"></div>
              <div class="trend-bar export" style="height: ${exportHeight}px"></div>
            </div>
            <div class="trend-bar-label">${dateLabel}</div>
          </div>
        `
      }).join('')}
    </div>
  `
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return '刚刚'
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  return date.toLocaleDateString('zh-CN')
}
