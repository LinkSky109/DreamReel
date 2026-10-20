import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import {
  formatDate,
  progressOf,
  projectStatus,
  relativeTime,
  statusLabel,
  statusTone,
  totalDuration,
} from '../lib/format'
import type { Project } from '../domain/types'
import { Icon } from '../components/Icon'
import { projectCover } from '../lib/media'
import { readWorkspacePreferences } from '../lib/preferences'

function greeting(hour: number, lang: string): string {
  if (lang === 'en') {
    if (hour < 6) return 'Working late'
    if (hour < 12) return 'Good morning'
    if (hour < 18) return 'Good afternoon'
    return 'Good evening'
  }
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

export function DashboardPage() {
  const navigate = useNavigate()
  const { t, lang } = useLang()

  const projectsQuery = useQuery({
    queryKey: ['projects', 'dashboard'],
    queryFn: () => api.listProjects({ limit: 200 }),
  })
  const recentQuery = useQuery({
    queryKey: ['projects', 'recent'],
    queryFn: () => api.getRecentProjects(6),
  })
  const templatesQuery = useQuery({
    queryKey: ['templates', 'dashboard'],
    queryFn: () => api.listTemplates(),
  })

  const isLoading = projectsQuery.isLoading || recentQuery.isLoading
  const isError = projectsQuery.isError || recentQuery.isError

  if (isLoading) {
    return (
      <div className="dr-page">
        <div className="dr-skeleton" style={{ height: 36, width: 260, marginBottom: 16 }} />
        <div className="dr-hero">
          <div className="dr-skeleton" style={{ height: 220 }} />
          <div className="dr-skeleton" style={{ height: 220 }} />
        </div>
        <div className="dr-grid dr-grid-3" style={{ marginTop: 16 }}>
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 180 }} />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="dr-page">
        <div className="dr-state dr-card">
          <div className="dr-state-icon">
            <Icon name="alert" size={20} />
          </div>
          <div className="dr-state-title">{t('工作台加载失败', 'Failed to load dashboard')}</div>
          <div>{t('请检查后端服务是否可用，然后重试。', 'Check that the backend is running, then retry.')}</div>
          <button
            type="button"
            className="dr-btn"
            onClick={() => {
              projectsQuery.refetch()
              recentQuery.refetch()
            }}
          >
            {t('重试', 'Retry')}
          </button>
        </div>
      </div>
    )
  }

  const projects = projectsQuery.data?.items ?? []
  const active = projects.filter((project) => projectStatus(project) === 'in-progress')
  const completed = projects.filter((project) => projectStatus(project) === 'completed')
  const continueProject =
    [...active].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? projects[0]

  const recent = (recentQuery.data?.projects ?? projects).slice(0, 6)
  const templates = (templatesQuery.data?.items ?? []).slice(0, 4)
  const generatedShots = projects.reduce(
    (sum, project) =>
      sum + (project.shots ?? []).filter((shot) => shot.status === 'completed').length,
    0
  )
  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const weeklyCompleted = completed.filter(
    (project) => Date.parse(project.updatedAt) >= weekAgo
  ).length

  const hour = new Date().getHours()

  const workspaceName = readWorkspacePreferences().workspaceName
  const displayName = workspaceName.endsWith('工作室')
    ? workspaceName.slice(0, -'工作室'.length)
    : workspaceName && workspaceName !== '我的工作区'
      ? workspaceName
      : t('创作者', 'creator')
  const completedShots = (project: Project) =>
    (project.shots ?? []).filter((shot) => shot.status === 'completed').length
  const pendingShots = (project: Project) =>
    (project.shots ?? []).filter((shot) => shot.status !== 'completed').length
  const week = (() => {
    const date = new Date()
    const first = new Date(date.getFullYear(), 0, 1)
    return Math.ceil(((date.getTime() - first.getTime()) / 86400000 + first.getDay() + 1) / 7)
  })()
  const queue = [...active, ...recent.filter((item) => !active.some((a) => a.id === item.id))].slice(0, 3)

  return (
    <div className="dr-page dash-page">
      <header className="dash-head">
        <div>
          <p className="dash-eyebrow">Workbench · {formatDate()}</p>
          <h1>
            {greeting(hour, lang)}，{displayName}。
          </h1>
          <p className="dash-lead">
            {continueProject
              ? t(
                  `《${continueProject.name}》还有 ${pendingShots(continueProject)} 个镜头待处理，另外 ${Math.max(active.length - 1, 0)} 个项目等待下一步。`,
                  `"${continueProject.name}" has ${pendingShots(continueProject)} shots pending. ${Math.max(active.length - 1, 0)} more projects need your next step.`
                )
              : t('从一句话开始，把故事拆成剧本、分镜和可交付的短片。', 'Start with one line and turn it into a script, storyboard and film.')}
          </p>
        </div>
        <button type="button" className="dr-btn dr-btn-primary dash-create" onClick={() => navigate('/projects?create=1')}>
          <Icon name="plus" size={15} />
          {t('新建项目', 'New project')}
        </button>
      </header>

      {projects.length === 0 ? (
        <div className="dr-card dr-state dash-empty">
          <div className="dr-state-icon">
            <Icon name="sparkles" size={22} />
          </div>
          <div className="dr-state-title">{t('从一句话开始', 'Start with one line')}</div>
          <p>{t('还没有项目。创建一个项目，生成剧本与分镜，再逐镜生成、配音、剪辑。', 'No projects yet. Create one, generate a script and storyboard, then produce shots.')}</p>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => navigate('/projects?create=1')}>
            <Icon name="plus" size={15} />
            {t('新建第一个项目', 'Create your first project')}
          </button>
        </div>
      ) : (
        <>
          <div className="dash-grid">
            {continueProject ? (
              <article className="continue-card">
                <img src={projectCover(continueProject)} alt="" />
                <div className="continue-body">
                  <div className="continue-kicker">
                    <span className="continue-pill">{t('继续创作', 'Continue')}</span>
                    <span>{t('上次编辑', 'Last edited')} {relativeTime(continueProject.updatedAt)}</span>
                  </div>
                  <h2>{continueProject.name}</h2>
                  <p className="continue-sub">
                    {(continueProject.shots ?? []).length} {t('个镜头', 'shots')} · {completedShots(continueProject)} {t('已生成', 'generated')} ·{' '}
                    {pendingShots(continueProject)} {t('待处理', 'pending')}
                    {continueProject.style ? ` · ${continueProject.style}` : ''}
                  </p>
                  <div className="continue-progress">
                    <div className="continue-bar">
                      <span style={{ width: `${progressOf(continueProject)}%` }} />
                    </div>
                    <span className="continue-pct">{progressOf(continueProject)}%</span>
                  </div>
                  <div className="continue-actions">
                    <button className="dr-btn continue-primary" type="button" onClick={() => navigate(`/project/${continueProject.id}?tab=shots`)}>
                      <Icon name="play" size={15} />
                      {t('进入故事板', 'Open storyboard')}
                    </button>
                    <button className="continue-link" type="button" onClick={() => navigate(`/project/${continueProject.id}?tab=script`)}>
                      {t('查看剧本', 'View script')}
                      <Icon name="arrow-right" size={14} />
                    </button>
                  </div>
                </div>
              </article>
            ) : null}

            <aside className="side-panel">
              <div className="side-panel-head">
                <h2>{t('最近制作', 'Recent work')}</h2>
                <span>WEEK {week}</span>
              </div>
              <div className="stat-strip">
                <div className="stat-cell">
                  <div className="stat-value">{active.length}</div>
                  <div className="stat-label">{t('进行中', 'In progress')}</div>
                </div>
                <div className="stat-cell">
                  <div className="stat-value">{generatedShots}</div>
                  <div className="stat-label">{t('已生成镜头', 'Shots done')}</div>
                </div>
                <div className="stat-cell">
                  <div className="stat-value">{weeklyCompleted}</div>
                  <div className="stat-label">{t('本周成片', 'This week')}</div>
                </div>
              </div>
              <div className="side-queue">
                {queue.map((project) => (
                  <Link className="queue-row" key={project.id} to={`/project/${project.id}?tab=shots`}>
                    <span className="queue-thumb">
                      <img src={projectCover(project)} alt="" />
                    </span>
                    <span className="queue-copy">
                      <span className="queue-name">{project.name}</span>
                      <span className="queue-meta">
                        <span className="queue-dot" />
                        {statusLabel(projectStatus(project))} · {pendingShots(project)} {t('镜待处理', 'pending')}
                      </span>
                    </span>
                    <span className="queue-mini">
                      <span>{progressOf(project)}%</span>
                      <span className="queue-track">
                        <span style={{ width: `${progressOf(project)}%` }} />
                      </span>
                    </span>
                  </Link>
                ))}
                {queue.length === 0 ? <p className="dr-hint" style={{ padding: 16 }}>{t('暂无进行中的任务', 'Nothing in progress')}</p> : null}
              </div>
              <div className="side-panel-foot">
                <Link to="/projects">
                  {t('查看全部项目', 'View all projects')}
                  <Icon name="arrow-right" size={14} />
                </Link>
              </div>
            </aside>
          </div>

          <section className="dash-section" aria-labelledby="recent-title">
            <div className="dash-section-head">
              <div>
                <h2 id="recent-title">{t('最近项目', 'Recent projects')}</h2>
                <p>{t('从上次停下的地方继续。', 'Pick up where you left off.')}</p>
              </div>
              <Link className="dash-head-link" to="/projects">
                {t('全部项目', 'All projects')}
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>
            <div className="dr-project-grid">
              {recent.slice(0, 6).map((project) => (
                <DashboardProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>

          <section className="dash-section" aria-labelledby="templates-title">
            <div className="dash-section-head">
              <div>
                <h2 id="templates-title">{t('从模板开始', 'Start from a template')}</h2>
                <p>{t('选一个结构，把想法直接放进去。', 'Choose a structure and drop your idea in.')}</p>
              </div>
              <Link className="dash-head-link" to="/templates">
                {t('浏览模板库', 'Browse templates')}
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>
            <div className="dr-template-grid">
              {templates.map((template, index) => (
                <Link
                  className="dr-template-tile"
                  key={template.id}
                  to={`/templates?template=${encodeURIComponent(template.id)}`}
                  style={{ ['--tile-hue' as string]: `${(index * 47 + 205) % 360}` }}
                >
                  <span className="dr-template-tile-icon">{template.icon ?? '◈'}</span>
                  <span className="dr-template-tile-name">{template.name}</span>
                  <span className="dr-template-tile-meta">
                    {template.category}
                    {template.config?.targetDuration ? ` · ${template.config.targetDuration}s` : ''}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function DashboardProjectCard({ project }: { project: Project }) {
  const { t } = useLang()
  const status = projectStatus(project)
  const shots = project.shots ?? []

  return (
    <Link className="dr-card dr-card-hover dr-project-card" to={`/project/${project.id}`}>
      <div className="dr-project-cover">
        <img src={projectCover(project)} alt="" loading="lazy" />
        <span className={`dr-project-status ${statusTone(status)}`}>{statusLabel(status)}</span>
        <span className="dr-project-duration">{totalDuration(project)}s</span>
      </div>
      <div className="dr-project-body">
        <div className="dr-project-title">{project.name}</div>
        <div className="dr-project-meta">
          <span className={`dr-status ${statusTone(status)}`}>
            <span className="dr-dot" />
            {statusLabel(status)}
          </span>
          <span>{shots.length} {t('镜', 'shots')}</span>
        </div>
        <div className="dr-project-foot">
          <span className="dr-hint">{relativeTime(project.updatedAt)}</span>
          <span className="dr-hint">{progressOf(project)}%</span>
        </div>
      </div>
    </Link>
  )
}
