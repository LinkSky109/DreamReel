import { useEffect, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { Icon } from '../components/Icon'
import { formatDate, statusLabel, statusTone } from '../lib/format'
import { totalDuration } from '../features/editor/utils'
import './SharedProject.css'

function ShareFrame({ children }: { children: ReactNode }) {
  const { t } = useLang()
  return (
    <div className="share-shell">
      <header className="share-topbar">
        <Link className="share-brand" to="/">
          <span className="share-brand-mark" aria-hidden="true">
            DR
          </span>
          <span>
            DreamReel <em>梦卷</em>
          </span>
        </Link>
        <div className="share-topbar-actions">
          <span className="share-readonly">
            <Icon name="shield" size={13} />
            {t('只读分享', 'Read-only share')}
          </span>
          <Link className="dr-btn" to="/">
            {t('打开 DreamReel', 'Open DreamReel')}
          </Link>
        </div>
      </header>
      <main className="share-main dr-page">{children}</main>
      <footer className="share-foot">
        <span>{t('由 DreamReel 生成并分享', 'Generated and shared with DreamReel')}</span>
        <span>© {new Date().getFullYear()} DreamReel</span>
      </footer>
    </div>
  )
}

export function SharedProjectPage() {
  const { token = '' } = useParams()
  const { t, lang } = useLang()

  const sharedQuery = useQuery({
    queryKey: ['shared', token],
    queryFn: () => api.getSharedProject(token),
    retry: false,
  })

  const projectQuery = useQuery({
    queryKey: ['shared', 'project', token],
    queryFn: () => api.getSharedProjectDetail(token),
    enabled: Boolean(sharedQuery.data?.projectId),
    retry: false,
  })

  const project = projectQuery.data

  useEffect(() => {
    if (project?.name) document.title = `${project.name} · DreamReel`
    return () => {
      document.title = 'DreamReel / 梦卷 — AI 短片创作平台'
    }
  }, [project?.name])

  if (sharedQuery.isLoading || projectQuery.isLoading) {
    return (
      <ShareFrame>
        <div className="dr-card dr-state share-state" role="status">
          <div className="dr-skeleton" style={{ height: 28, width: 260 }} />
          <div className="dr-skeleton" style={{ height: 160, width: '100%' }} />
          <span>{t('加载分享内容…', 'Loading shared project…')}</span>
        </div>
      </ShareFrame>
    )
  }

  if (sharedQuery.isError || !sharedQuery.data) {
    return (
      <ShareFrame>
        <div className="dr-card dr-state share-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">{t('分享链接无效', 'Invalid share link')}</div>
          <p>{t('链接可能已关闭公开访问，或项目已被删除。', 'Public access may be off, or the project was deleted.')}</p>
        </div>
      </ShareFrame>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <ShareFrame>
        <div className="dr-card dr-state share-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">{t('项目不可用', 'Project unavailable')}</div>
          <p>{t('项目可能已被删除，或当前分享链接没有访问权限。', 'The project may be deleted or this link no longer has access.')}</p>
        </div>
      </ShareFrame>
    )
  }

  const shots = project.shots ?? []
  const shareQuery = `?share=${encodeURIComponent(token)}`

  return (
    <ShareFrame>
      <div className="share-head">
        <div>
          <div className="dr-eyebrow">
            {t('分享预览', 'Shared preview')} · {formatDate(new Date(), lang)}
          </div>
          <h1 className="dr-display">{project.name}</h1>
          <p className="dr-page-sub">{project.description || t('暂无简介', 'No synopsis')}</p>
        </div>
        <span className="dr-status is-generating">
          <span className="dr-dot" />
          {t('只读预览', 'Read-only')}
        </span>
      </div>

      <div className="share-stats">
        {[
          { label: t('镜头', 'Shots'), value: shots.length },
          { label: t('时长', 'Duration'), value: `${totalDuration(shots)}s` },
          { label: t('角色', 'Characters'), value: project.characters?.length ?? 0 },
          { label: t('画幅', 'Aspect'), value: project.platform === 'portrait' ? '9:16' : '16:9' },
        ].map((item) => (
          <div className="dr-card dr-stat" key={item.label}>
            <span className="dr-stat-value">{item.value}</span>
            <span className="dr-stat-label">{item.label}</span>
          </div>
        ))}
      </div>

      {shots.length === 0 ? (
        <div className="dr-card dr-state share-state">
          <div className="dr-state-icon">
            <Icon name="film" size={24} />
          </div>
          <div className="dr-state-title">{t('还没有镜头', 'No shots yet')}</div>
          <p>{t('作者还在制作中，稍后再来看看。', 'The creator is still working on it. Check back later.')}</p>
        </div>
      ) : (
        <div className="share-grid">
          {shots.map((shot) => (
            <article className="dr-card share-card" key={shot.id}>
              <div className="share-cover">
                {shot.videoUrl ? (
                  <video src={`${shot.videoUrl}${shareQuery}`} controls preload="metadata" playsInline />
                ) : shot.imageUrl ? (
                  <img src={`${shot.imageUrl}${shareQuery}`} alt="" loading="lazy" />
                ) : (
                  <div className="share-cover-fallback">{t('未生成', 'Not generated')}</div>
                )}
              </div>
              <div className="share-card-body">
                <div className="share-card-title">
                  S{String(shot.index + 1).padStart(2, '0')} · {shot.description}
                </div>
                <div className="share-card-meta">
                  <span className={`dr-status ${statusTone(shot.status)}`}>
                    <span className="dr-dot" />
                    {statusLabel(shot.status, lang)}
                  </span>
                  <span>{shot.duration}s</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </ShareFrame>
  )
}
