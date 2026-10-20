import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { currentUserId } from '../lib/user'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Creator.css'
import { pluralize } from '../lib/format'

function formatDate(value?: string) {
  return value ? value.slice(0, 10) : '—'
}

export function CreatorPage() {
  const { name = '' } = useParams()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const myUserId = useMemo(currentUserId, [])

  const [editOpen, setEditOpen] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [isPublic, setIsPublic] = useState(false)

  const creatorQuery = useQuery({
    queryKey: ['creator', name],
    queryFn: () => api.getCreatorPage(name),
    enabled: Boolean(name),
  })

  const page = creatorQuery.data
  const profile = page?.profile
  const isMe = Boolean(profile && (profile.userId === myUserId || name === myUserId))

  useEffect(() => {
    if (!profile) return
    setDisplayName(profile.displayName)
    setBio(profile.bio ?? '')
    setIsPublic(profile.isPublic)
  }, [profile])

  const saveProfile = useMutation({
    mutationFn: () => api.updateCreatorProfile(name, { displayName: displayName.trim(), bio, isPublic }),
    onSuccess: (result) => {
      queryClient.setQueryData(
        ['creator', name],
        page ? { ...page, profile: result.profile } : page
      )
      setEditOpen(false)
      showToast(t('创作者资料已保存', 'Creator profile saved'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (creatorQuery.isLoading) {
    return (
      <div className="dr-page creator-page">
        <div className="dr-skeleton" style={{ height: 150 }} />
        <div className="creator-metrics" style={{ marginTop: 16 }}>
          {[0, 1, 2, 3].map((key) => (
            <div className="dr-skeleton creator-metric" key={key} />
          ))}
        </div>
      </div>
    )
  }

  if (creatorQuery.isError || !page || !profile) {
    return (
      <div className="dr-page creator-page">
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">{t('创作者未加载', 'Creator failed to load')}</div>
          <div style={{ fontSize: 12 }}>{(creatorQuery.error as Error | null)?.message ?? t('创作者不存在。', 'Creator not found.')}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="dr-btn dr-btn-primary" onClick={() => creatorQuery.refetch()}>
              {t('重试', 'Retry')}
            </button>
            <Link className="dr-btn" to="/gallery">
              {t('返回作品广场', 'Back to gallery')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="dr-page creator-page">
      <Link className="creator-back" to="/gallery">
        <Icon name="arrow-left" size={15} />
        {t('作品广场', 'Gallery')}
      </Link>

      <header className="dr-card creator-head">
        <div className="creator-avatar" aria-hidden="true">
          {profile.displayName.slice(0, 1).toUpperCase()}
        </div>
        <div className="creator-head-main">
          <div className="creator-name-row">
            <h1>{profile.displayName}</h1>
            <span className={`creator-visibility ${profile.isPublic ? 'is-public' : ''}`}>
              {profile.isPublic ? t('公开主页', 'Public') : t('私密主页', 'Private')}
            </span>
          </div>
          <p>{profile.bio || t('这位创作者还没有填写简介。', 'This creator has no bio yet.')}</p>
          <small>
            {t('加入于', 'Joined')} {formatDate(profile.createdAt)} · {profile.userId}
          </small>
        </div>
        <div className="creator-head-actions">
          {isMe ? (
            <button type="button" className="dr-btn dr-btn-primary" onClick={() => setEditOpen(true)}>
              <Icon name="settings" size={14} />
              {t('编辑资料', 'Edit profile')}
            </button>
          ) : (
            <button
              type="button"
              className="dr-btn"
              onClick={() => showToast(t('关注功能后端待接入', 'Follow API is not available yet'))}
            >
              <Icon name="star" size={14} />
              {t('关注', 'Follow')}
            </button>
          )}
        </div>
      </header>

      <div className="creator-metrics">
        {[
          { labelZh: '作品数', labelEn: 'Works', value: page.stats.workCount },
          { labelZh: '总时长', labelEn: 'Duration', value: `${page.stats.totalDuration}s` },
          { labelZh: '已完成', labelEn: 'Completed', value: page.stats.completedCount },
          { labelZh: '获赞', labelEn: 'Likes', value: page.stats.likeCount },
        ].map((item) => (
          <div className="dr-card creator-metric" key={item.labelEn}>
            <span>{t(item.labelZh, item.labelEn)}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <section aria-labelledby="creator-works-title">
        <div className="creator-section-head">
          <h2 id="creator-works-title">{t('公开作品', 'Works')}</h2>
          <span>{t(`共 ${page.works.length} 部`, `${page.works.length} total`)}</span>
        </div>

        {page.works.length === 0 ? (
          <div className="dr-card dr-state">
            <div className="dr-state-icon">
              <Icon name="film" size={24} />
            </div>
            <div className="dr-state-title">{t('还没有作品', 'No works yet')}</div>
            <p>{t('创建并发布第一部作品后，会出现在这里。', 'Publish your first work and it will appear here.')}</p>
            <Link className="dr-btn dr-btn-primary" to="/projects?create=1">
              {t('新建项目', 'New project')}
            </Link>
          </div>
        ) : (
          <div className="creator-grid">
            {page.works.map((work) => (
              <Link className="dr-card dr-card-hover creator-work" to={`/project/${work.id}`} key={work.id}>
                <span className="creator-work-cover">
                  {work.coverUrl ? <img src={work.coverUrl} alt="" loading="lazy" /> : <Icon name="film" size={22} />}
                </span>
                <span className="creator-work-body">
                  <strong>{work.name}</strong>
                  <small>
                    {work.shotCount} {t('镜头', pluralize(work.shotCount, 'shot'))} · {work.status} · {formatDate(work.updatedAt)}
                  </small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>

      <Modal
        open={editOpen}
        title={t('编辑创作者资料', 'Edit creator profile')}
        width={480}
        onClose={() => (!saveProfile.isPending ? setEditOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setEditOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={!displayName.trim() || saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              {saveProfile.isPending ? t('保存中…', 'Saving…') : t('保存', 'Save')}
            </button>
          </>
        }
      >
        <div className="creator-form">
          <label className="dr-field">
            <span className="dr-label">{t('昵称', 'Display name')}</span>
            <input
              className="dr-input"
              value={displayName}
              maxLength={40}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </label>
          <label className="dr-field">
            <span className="dr-label">{t('简介', 'Bio')}</span>
            <textarea
              className="dr-textarea"
              rows={4}
              maxLength={300}
              value={bio}
              onChange={(event) => setBio(event.target.value)}
            />
          </label>
          <label className="creator-public">
            <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
            <span>
              <strong>{t('公开创作者主页', 'Public creator page')}</strong>
              <small>{t('关闭后他人无法通过作品广场进入你的主页。', 'When off, others cannot reach your page from the gallery.')}</small>
            </span>
          </label>
        </div>
      </Modal>
    </div>
  )
}
