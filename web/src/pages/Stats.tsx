import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { projectCover } from '../lib/media'
import { formatNumber, pluralize, progressOf, relativeTime } from '../lib/format'
import { Icon } from '../components/Icon'
import './Stats.css'

type Bilingual = { zh: string; en: string }

const STYLE_NAMES: Record<string, Bilingual> = {
  none: { zh: '无风格', en: 'No style' },
  nolan: { zh: '诺兰', en: 'Nolan' },
  'wes-anderson': { zh: '韦斯·安德森', en: 'Wes Anderson' },
  tarantino: { zh: '昆汀', en: 'Tarantino' },
  'wong-kar-wai': { zh: '王家卫', en: 'Wong Kar-wai' },
  'studio-ghibli': { zh: '吉卜力', en: 'Studio Ghibli' },
  'blade-runner': { zh: '赛博朋克', en: 'Cyberpunk' },
  minimalist: { zh: '极简主义', en: 'Minimalist' },
  documentary: { zh: '纪录片', en: 'Documentary' },
  noir: { zh: '黑色电影', en: 'Film noir' },
  cinematic: { zh: '电影感', en: 'Cinematic' },
  clean: { zh: '干净', en: 'Clean' },
}

const PLATFORM_NAMES: Record<string, Bilingual> = {
  landscape: { zh: '横屏 16:9', en: 'Landscape 16:9' },
  portrait: { zh: '竖屏 9:16', en: 'Portrait 9:16' },
  square: { zh: '方形 1:1', en: 'Square 1:1' },
}

function bilingualLabel(map: Record<string, Bilingual>, key: string | undefined, lang: 'zh' | 'en'): string {
  if (!key) return lang === 'en' ? 'Unknown' : '未知'
  const item = map[key]
  return item ? (lang === 'en' ? item.en : item.zh) : key
}

export function StatsPage() {
  const { t, lang } = useLang()
  const [range, setRange] = useState(14)

  const dashboardQuery = useQuery({
    queryKey: ['stats', 'dashboard'],
    queryFn: () => api.getStatsDashboard(),
  })
  const trendQuery = useQuery({
    queryKey: ['stats', 'trend', range],
    queryFn: () => api.getStatsTrend(range),
  })

  if (dashboardQuery.isLoading) {
    return (
      <div className="dr-page">
        <div className="dr-skeleton" style={{ height: 90, marginBottom: 16 }} />
        <div className="dr-skeleton" style={{ height: 260 }} />
      </div>
    )
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <div className="dr-page">
        <div className="dr-card dr-state">
          <h2>{t('创作数据加载失败', 'Failed to load analytics')}</h2>
          <p>{(dashboardQuery.error as Error | null)?.message}</p>
          <button className="dr-btn" onClick={() => dashboardQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      </div>
    )
  }

  const data = dashboardQuery.data
  const trend = trendQuery.data ?? data.trend
  const overview = data.overview
  const max = Math.max(1, ...trend.flatMap((day) => [day.videoGenerations, day.projectsCreated, day.exports]))
  const totalTrend = trend.reduce((sum, day) => sum + day.videoGenerations, 0)
  const styleTotal = Math.max(1, data.styleDistribution.reduce((sum, item) => sum + item.count, 0))
  const videoPercent = data.quotaUsage.video.daily.limit
    ? Math.min(100, Math.round((data.quotaUsage.video.daily.used / data.quotaUsage.video.daily.limit) * 100))
    : 0
  const dubbingPercent = data.quotaUsage.dubbing.monthly.limit
    ? Math.min(100, Math.round((data.quotaUsage.dubbing.monthly.used / data.quotaUsage.dubbing.monthly.limit) * 100))
    : 0

  return (
    <div className="dr-page stats-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Analytics</p>
          <h1>{t('创作数据', 'Analytics')}</h1>
          <p className="projects-lead">
            {t(
              '看清时间花在哪里。数据只统计当前工作区，不包含团队其他成员。',
              'See where the time goes. Metrics cover the current workspace only.'
            )}
          </p>
        </div>
        <select
          className="dr-select stats-range"
          value={range}
          onChange={(event) => setRange(Number(event.target.value))}
          aria-label={t('时间范围', 'Time range')}
        >
          <option value={14}>{t('最近 14 天', 'Last 14 days')}</option>
          <option value={30}>{t('最近 30 天', 'Last 30 days')}</option>
        </select>
      </div>

      <div className="stats-hero">
        <div className="stats-hero-cell">
          <span>{t('已生成镜头', 'Generated shots')}</span>
          <strong>{formatNumber(overview.completedShots, lang)}</strong>
          <small>{t('共', 'of')} {formatNumber(overview.totalShots, lang)} {t('个镜头', pluralize(overview.totalShots, 'shot'))}</small>
        </div>
        <div className="stats-hero-cell">
          <span>{t('镜头完成率', 'Completion rate')}</span>
          <strong>{overview.completionRate}%</strong>
          <small>{t('完成状态占比', 'completed share')}</small>
        </div>
        <div className="stats-hero-cell">
          <span>{t('项目总数', 'Projects')}</span>
          <strong>{formatNumber(overview.totalProjects, lang)}</strong>
          <small>{formatNumber(overview.totalCharacters, lang)} {t('个角色', pluralize(overview.totalCharacters, 'character'))}</small>
        </div>
        <div className="stats-hero-cell">
          <span>{t('视频生成', 'Video generations')}</span>
          <strong>{formatNumber(overview.totalVideoGenerations, lang)}</strong>
          <small>{formatNumber(overview.totalExports, lang)} {t('次导出', pluralize(overview.totalExports, 'export'))}</small>
        </div>
      </div>

      <div className="stats-grid">
        <section className="stats-panel stats-chart-panel">
          <div className="stats-panel-head">
            <div>
              <h2>{t('创作趋势', 'Creation trend')}</h2>
              <p>{t(`最近 ${range} 天，每日生成/新建/导出`, `${range} days of generation, projects and exports`)}</p>
            </div>
            <span className="stats-chip">{t('视频', 'Video')} {totalTrend}</span>
          </div>
          <div className="stats-chart" role="img" aria-label={t('创作趋势柱状图', 'Creation trend bar chart')}>
            {trend.map((day) => {
              const label = day.date.slice(5).replace('-', '/')
              return (
                <div className="stats-bar-col" key={day.date}>
                  <div className="stats-bars">
                    <span
                      className="stats-bar is-video"
                      style={{ height: `${Math.max(3, (day.videoGenerations / max) * 100)}%` }}
                      title={`${label} · ${t('视频', 'video')} ${day.videoGenerations}`}
                    />
                    <span
                      className="stats-bar is-project"
                      style={{ height: `${Math.max(3, (day.projectsCreated / max) * 100)}%` }}
                      title={`${label} · ${t('项目', 'project')} ${day.projectsCreated}`}
                    />
                    <span
                      className="stats-bar is-export"
                      style={{ height: `${Math.max(3, (day.exports / max) * 100)}%` }}
                      title={`${label} · ${t('导出', 'export')} ${day.exports}`}
                    />
                  </div>
                  <span className="stats-day">{label}</span>
                </div>
              )
            })}
          </div>
          <div className="stats-legend">
            <span><i className="is-video" />{t('视频生成', 'Video')}</span>
            <span><i className="is-project" />{t('新建项目', 'Projects')}</span>
            <span><i className="is-export" />{t('导出', 'Exports')}</span>
          </div>
        </section>

        <section className="stats-panel stats-quota-panel">
          <div className="stats-panel-head">
            <h2>{t('额度使用', 'Quota')}</h2>
            <span className="stats-chip">{t('本月', 'This month')}</span>
          </div>
          <div className="stats-meters">
            <div className="stats-meter">
              <div className="stats-meter-top">
                <span>{t('视频生成（今日）', 'Video (today)')}</span>
                <span>{data.quotaUsage.video.daily.used} / {data.quotaUsage.video.daily.limit}</span>
              </div>
              <div className="stats-meter-track"><span style={{ width: `${videoPercent}%` }} /></div>
            </div>
            <div className="stats-meter">
              <div className="stats-meter-top">
                <span>{t('配音时长（本月）', 'Dubbing (month)')}</span>
                <span>
                  {Math.round(data.quotaUsage.dubbing.monthly.used / 60)} / {Math.round(data.quotaUsage.dubbing.monthly.limit / 60)} {t('分', 'min')}
                </span>
              </div>
              <div className="stats-meter-track is-green"><span style={{ width: `${dubbingPercent}%` }} /></div>
            </div>
          </div>

          <h3 className="stats-subtitle">{t('风格分布', 'Style distribution')}</h3>
          <div className="stats-styles">
            {data.styleDistribution.slice(0, 5).map((item) => (
              <div className="stats-style" key={item.styleId ?? item.count}>
                <span>{bilingualLabel(STYLE_NAMES, item.styleId, lang)}</span>
                <div className="stats-style-track"><span style={{ width: `${(item.count / styleTotal) * 100}%` }} /></div>
                <span>{item.count}</span>
              </div>
            ))}
            {data.styleDistribution.length === 0 ? <p className="dr-hint">{t('暂无数据', 'No data')}</p> : null}
          </div>

          <h3 className="stats-subtitle">{t('画幅分布', 'Aspect distribution')}</h3>
          <div className="stats-platforms">
            {data.platformDistribution.map((item) => (
              <span className="dr-tag" key={item.platform}>
                {bilingualLabel(PLATFORM_NAMES, item.platform, lang)} · {item.count}
              </span>
            ))}
            {data.platformDistribution.length === 0 ? <span className="dr-hint">{t('暂无数据', 'No data')}</span> : null}
          </div>
        </section>
      </div>

      <section className="dash-section">
        <div className="dash-section-head">
          <div>
            <h2>{t('最近项目', 'Recent projects')}</h2>
            <p>{t('最近的创作活动。', 'Latest activity.')}</p>
          </div>
          <Link className="dash-head-link" to="/projects">
            {t('全部项目', 'All projects')}
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>
        <div className="dr-project-grid">
          {data.recentProjects.map((project) => (
            <Link className="dr-card dr-card-hover dr-project-card" to={`/project/${project.id}`} key={project.id}>
              <div className="dr-project-cover">
                <img src={projectCover(project)} alt="" loading="lazy" />
              </div>
              <div className="dr-project-body">
                <div className="dr-project-title">{project.name}</div>
                <div className="dr-project-meta">
                  <span>{project.shots?.length ?? 0} {t('镜', pluralize(project.shots?.length ?? 0, 'shot'))}</span>
                  <span>{progressOf(project)}%</span>
                  <span>{relativeTime(project.updatedAt, lang)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
