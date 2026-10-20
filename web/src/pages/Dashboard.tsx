import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import {
  formatDate,
  platformLabel,
  progressOf,
  projectStatus,
  relativeTime,
  statusLabel,
  statusTone,
  totalDuration,
} from '../lib/format'
import type { Project } from '../domain/types'
import { Icon } from '../components/Icon'

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
  const quotaQuery = useQuery({ queryKey: ['quota'], queryFn: () => api.getQuota() })

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

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <div className="dr-eyebrow">{formatDate()}</div>
          <h1 className="dr-display">
            {greeting(hour, lang)}
            {t('，现在该继续创作了', ' — ready to keep creating')}
          </h1>
          <p className="dr-page-sub">
            {t(
              '一句话、一部小说，都能走到可交付的短片。',
              'From one line or one novel to a deliverable short film.'
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="dr-btn dr-btn-primary dr-btn-lg"
            onClick={() => navigate('/projects?create=1')}
          >
            <Icon name="plus" size={16} />
            {t('新建项目', 'New project')}
          </button>
          <Link className="dr-btn dr-btn-lg" to="/templates">
            {t('从模板开始', 'Start from template')}
          </Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 64 }}>
          <div className="dr-state-icon">
            <Icon name="sparkles" size={22} />
          </div>
          <div className="dr-state-title">{t('从一句话开始', 'Start with one line')}</div>
          <div style={{ maxWidth: 420 }}>
            {t(
              '还没有项目。创建一个项目，生成剧本与分镜，再逐镜生成、配音、剪辑。',
              'No projects yet. Create one, generate a script and storyboard, then produce shots.'
            )}
          </div>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            onClick={() => navigate('/projects?create=1')}
          >
            <Icon name="plus" size={15} />
            {t('新建第一个项目', 'Create your first project')}
          </button>
        </div>
      ) : (
        <>
          <div className="dr-hero">
            {continueProject ? (
              <section className="dr-card dr-continue" aria-labelledby="continue-title">
                <div className="dr-continue-cover" aria-hidden="true" />
                <div className="dr-eyebrow">{t('继续创作', 'Continue')}</div>
                <h2 id="continue-title" style={{ fontSize: 24, lineHeight: 1.25 }}>
                  {continueProject.name}
                </h2>
                <div className="dr-continue-meta">
                  <span className={`dr-status ${statusTone(projectStatus(continueProject))}`}>
                    <span className="dr-dot" />
                    {statusLabel(projectStatus(continueProject))}
                  </span>
                  <span>{platformLabel(continueProject.platform)}</span>
                  <span>{continueProject.shots?.length ?? 0} {t('镜', 'shots')}</span>
                  <span>{totalDuration(continueProject)}s</span>
                </div>
                <div>
                  <div className="dr-progress" aria-label={t('项目进度', 'Project progress')}>
                    <span style={{ width: `${progressOf(continueProject)}%` }} />
                  </div>
                  <div className="dr-hint" style={{ marginTop: 6 }}>
                    {progressOf(continueProject)}% · {t('下一步', 'Next')}：
                    {projectStatus(continueProject) === 'empty'
                      ? t('生成剧本', 'Generate script')
                      : t('继续生成分镜', 'Continue storyboard')}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
                  <button
                    type="button"
                    className="dr-btn dr-btn-primary"
                    onClick={() => navigate(`/project/${continueProject.id}?tab=shots`)}
                  >
                    {t('进入分镜', 'Open storyboard')}
                    <Icon name="arrow-right" size={15} />
                  </button>
                  <button
                    type="button"
                    className="dr-btn"
                    onClick={() => navigate(`/project/${continueProject.id}?tab=script`)}
                  >
                    {t('查看剧本', 'View script')}
                  </button>
                </div>
              </section>
            ) : null}

            <section className="dr-card dr-queue" aria-labelledby="queue-title">
              <div className="dr-section-head" style={{ marginBottom: 4 }}>
                <h2 className="dr-section-title" id="queue-title">
                  {t('制作队列', 'Production queue')}
                </h2>
                <span className="dr-hint">{weeklyCompleted} {t('本周完成', 'done this week')}</span>
              </div>
              {active.length === 0 ? (
                <div className="dr-state" style={{ padding: 24 }}>
                  <div>{t('暂无进行中的任务', 'Nothing in progress')}</div>
                </div>
              ) : (
                active.slice(0, 3).map((project) => {
                  const pending = (project.shots ?? []).filter(
                    (shot) => shot.status !== 'completed'
                  ).length
                  return (
                    <Link
                      className="dr-queue-item"
                      key={project.id}
                      to={`/project/${project.id}?tab=shots`}
                    >
                      <div className="dr-queue-main">
                        <div className="dr-queue-title">{project.name}</div>
                        <div className="dr-queue-sub">
                          {statusLabel(projectStatus(project))} · {pending} {t('镜待处理', 'shots pending')}
                        </div>
                      </div>
                      <Icon name="arrow-right" size={15} />
                    </Link>
                  )
                })
              )}
              <div className="dr-grid dr-grid-3" style={{ gap: 8, marginTop: 'auto' }}>
                <div className="dr-card dr-stat" style={{ padding: 10 }}>
                  <span className="dr-stat-value">{active.length}</span>
                  <span className="dr-stat-label">{t('进行中', 'In progress')}</span>
                </div>
                <div className="dr-card dr-stat" style={{ padding: 10 }}>
                  <span className="dr-stat-value">{generatedShots}</span>
                  <span className="dr-stat-label">{t('已生成镜头', 'Shots generated')}</span>
                </div>
                <div className="dr-card dr-stat" style={{ padding: 10 }}>
                  <span className="dr-stat-value">{quotaQuery.data?.video.daily.remaining ?? '—'}</span>
                  <span className="dr-stat-label">{t('今日额度', 'Today quota')}</span>
                </div>
              </div>
            </section>
          </div>

          <section className="dr-section" aria-labelledby="recent-title">
            <div className="dr-section-head">
              <h2 className="dr-section-title" id="recent-title">
                {t('最近项目', 'Recent projects')}
              </h2>
              <Link className="dr-btn dr-btn-ghost" to="/projects">
                {t('查看全部', 'View all')}
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>
            <div className="dr-project-grid">
              {recent.map((project) => (
                <DashboardProjectCard key={project.id} project={project} />
              ))}
            </div>
          </section>

          <section className="dr-section" aria-labelledby="templates-title">
            <div className="dr-section-head">
              <h2 className="dr-section-title" id="templates-title">
                {t('从模板开始', 'Start from a template')}
              </h2>
              <Link className="dr-btn dr-btn-ghost" to="/templates">
                {t('全部模板', 'All templates')}
                <Icon name="arrow-right" size={14} />
              </Link>
            </div>
            <div className="dr-grid dr-grid-3">
              {templates.map((template) => (
                <Link
                  className="dr-card dr-card-hover dr-template-card"
                  key={template.id}
                  to={`/templates?template=${encodeURIComponent(template.id)}`}
                >
                  <div className="dr-template-name">{template.name}</div>
                  <div className="dr-template-desc">{template.description}</div>
                  <div className="dr-tag-row">
                    <span className="dr-tag">{template.category}</span>
                    {template.config?.targetDuration ? (
                      <span className="dr-tag">{template.config.targetDuration}s</span>
                    ) : null}
                  </div>
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
        {project.coverUrl ? (
          <img src={project.coverUrl} alt="" loading="lazy" />
        ) : (
          <div className="dr-project-cover-fallback">{t('暂无封面', 'No cover')}</div>
        )}
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
