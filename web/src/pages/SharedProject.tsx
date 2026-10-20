import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { Icon } from '../components/Icon'
import { formatDate, statusLabel, statusTone } from '../lib/format'
import { totalDuration } from '../features/editor/utils'

export function SharedProjectPage() {
  const { token = '' } = useParams()
  const { t } = useLang()

  const sharedQuery = useQuery({
    queryKey: ['shared', token],
    queryFn: () => api.getSharedProject(token),
    retry: false,
  })

  const projectQuery = useQuery({
    queryKey: ['shared', 'project', sharedQuery.data?.projectId],
    queryFn: () => api.getProject(sharedQuery.data!.projectId),
    enabled: Boolean(sharedQuery.data?.projectId),
    retry: false,
  })

  if (sharedQuery.isLoading || projectQuery.isLoading) {
    return (
      <div className="dr-page">
        <div className="dr-card dr-state" style={{ padding: 48 }}>
          {t('加载分享内容…', 'Loading shared project…')}
        </div>
      </div>
    )
  }

  if (sharedQuery.isError || !sharedQuery.data) {
    return (
      <div className="dr-page">
        <div className="dr-card dr-state" style={{ padding: 56 }}>
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">{t('分享链接无效', 'Invalid share link')}</div>
          <div>
            {t('链接可能已关闭公开访问，或项目已被删除。', 'Public access may be off, or the project was deleted.')}
          </div>
        </div>
      </div>
    )
  }

  const project = projectQuery.data
  if (!project) {
    return (
      <div className="dr-page">
        <div className="dr-card dr-state" style={{ padding: 56 }}>
          <div className="dr-state-title">{t('项目不可用', 'Project unavailable')}</div>
        </div>
      </div>
    )
  }

  const shots = project.shots ?? []
  const shareQuery = `?share=${encodeURIComponent(token)}`

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <div className="dr-eyebrow">{t('分享预览', 'Shared preview')} · {formatDate()}</div>
          <h1 className="dr-display">{project.name}</h1>
          <p className="dr-page-sub">{project.description || t('暂无简介', 'No synopsis')}</p>
        </div>
        <span className="dr-status is-generating">
          <span className="dr-dot" />
          {t('只读预览', 'Read-only')}
        </span>
      </div>

      <div className="dr-grid dr-grid-6" style={{ marginBottom: 18 }}>
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

      <div className="dr-project-grid">
        {shots.map((shot) => (
          <article className="dr-card dr-project-card" key={shot.id}>
            <div className="dr-project-cover">
              {shot.videoUrl ? (
                <video
                  src={`${shot.videoUrl}${shareQuery}`}
                  controls
                  preload="metadata"
                  playsInline
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div className="dr-project-cover-fallback">{t('未生成', 'Not generated')}</div>
              )}
            </div>
            <div className="dr-project-body">
              <div className="dr-project-title">
                S{String(shot.index + 1).padStart(2, '0')} · {shot.description}
              </div>
              <div className="dr-project-meta">
                <span className={`dr-status ${statusTone(shot.status)}`}>
                  <span className="dr-dot" />
                  {statusLabel(shot.status)}
                </span>
                <span>{shot.duration}s</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
