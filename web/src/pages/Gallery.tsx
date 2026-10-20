import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { currentUserId } from '../lib/user'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import type { GalleryItem } from '../domain/types'
import './Gallery.css'
import { pluralize } from '../lib/format'

const CATEGORIES = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'short', zh: '故事短片', en: 'Short film' },
  { id: 'ad', zh: '产品广告', en: 'Product ad' },
  { id: 'vlog', zh: '旅行 Vlog', en: 'Travel vlog' },
  { id: 'knowledge', zh: '知识科普', en: 'Knowledge' },
  { id: 'music', zh: '音乐', en: 'Music' },
  { id: 'promo', zh: '社媒推广', en: 'Social promo' },
]

function formatDate(value?: string) {
  return value ? value.slice(0, 10) : ''
}

export function GalleryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const userId = useMemo(currentUserId, [])

  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState<'latest' | 'popular'>('latest')
  const [preview, setPreview] = useState<GalleryItem | null>(null)

  const galleryQuery = useQuery({
    queryKey: ['gallery', category, sort],
    queryFn: () => api.listGallery({ category, sort }),
  })

  const like = useMutation({
    mutationFn: (item: GalleryItem) => api.likeGalleryWork(item.id, userId),
    onSuccess: (result, item) => {
      showToast(result.liked ? t('已点赞', 'Liked') : t('已取消点赞', 'Like removed'))
      queryClient.setQueryData<{ total: number; items: GalleryItem[] }>(
        ['gallery', category, sort],
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.id === item.id ? { ...entry, likeCount: result.likeCount } : entry
                ),
              }
            : current
      )
      setPreview((current) =>
        current && current.id === item.id ? { ...current, likeCount: result.likeCount } : current
      )
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const remix = useMutation({
    mutationFn: (item: GalleryItem) => api.remixGalleryWork(item.id, userId),
    onSuccess: (result) => {
      showToast(
        t(
          `已复刻「${result.sourceName}」（${result.copiedShots} 个镜头）`,
          `Remixed “${result.sourceName}” (${result.copiedShots} shots)`
        )
      )
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setPreview(null)
      navigate(`/project/${result.remixId}`)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const openPreview = (item: GalleryItem) => {
    setPreview(item)
    void api.recordGalleryView(item.id).then(() => {
      queryClient.setQueryData<{ total: number; items: GalleryItem[] }>(
        ['gallery', category, sort],
        (current) =>
          current
            ? {
                ...current,
                items: current.items.map((entry) =>
                  entry.id === item.id ? { ...entry, viewCount: entry.viewCount + 1 } : entry
                ),
              }
            : current
      )
    }).catch(() => undefined)
  }

  const items = galleryQuery.data?.items ?? []

  return (
    <div className="dr-page gallery-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Gallery</p>
          <h1>{t('作品广场', 'Gallery')}</h1>
          <p className="projects-lead">
            {t('发现公开发布的短片，点赞或一键复刻为你的项目。', 'Discover published shorts, like them or remix into your projects.')}
          </p>
        </div>
        <Link className="dr-btn" to="/projects">
          <Icon name="folder" size={14} />
          {t('我的项目', 'My projects')}
        </Link>
      </div>

      <div className="gallery-toolbar">
        <div className="gallery-categories" role="group" aria-label={t('作品分类', 'Categories')}>
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={category === item.id ? 'is-active' : ''}
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {t(item.zh, item.en)}
            </button>
          ))}
        </div>
        <label className="gallery-sort">
          <span className="dr-label">{t('排序', 'Sort')}</span>
          <select
            className="dr-select"
            value={sort}
            onChange={(event) => setSort(event.target.value as 'latest' | 'popular')}
          >
            <option value="latest">{t('最新发布', 'Latest')}</option>
            <option value="popular">{t('最多点赞', 'Most liked')}</option>
          </select>
        </label>
      </div>

      {galleryQuery.isLoading ? (
        <div className="gallery-grid">
          {[0, 1, 2, 3].map((key) => (
            <div className="dr-skeleton gallery-skeleton" key={key} />
          ))}
        </div>
      ) : galleryQuery.isError ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">{t('作品加载失败', 'Failed to load gallery')}</div>
          <div style={{ fontSize: 12 }}>{(galleryQuery.error as Error).message}</div>
          <button type="button" className="dr-btn" onClick={() => galleryQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="compass" size={24} />
          </div>
          <div className="dr-state-title">{t('这个分类还没有作品', 'No works in this category')}</div>
          <p>{t('去发布你的第一部作品，或切换到其他分类。', 'Publish your first work or try another category.')}</p>
          <button type="button" className="dr-btn" onClick={() => setCategory('all')}>
            {t('查看全部', 'View all')}
          </button>
        </div>
      ) : (
        <div className="gallery-grid">
          {items.map((item) => (
            <article className="dr-card gallery-card" key={item.id}>
              <button type="button" className="gallery-cover" onClick={() => openPreview(item)} aria-label={t(`预览 ${item.name}，${item.shotCount} 镜`, `Preview ${item.name}, ${item.shotCount} shots`)}>
                {item.coverUrl ? (
                  <img src={item.coverUrl} alt="" loading="lazy" />
                ) : (
                  <span className="gallery-cover-fallback">
                    <Icon name="play" size={26} />
                  </span>
                )}
                <span className="gallery-play">
                  <Icon name="play" size={18} />
                </span>
                <span className="gallery-duration">{item.shotCount} {t('镜', pluralize(item.shotCount, 'shot'))}</span>
              </button>
              <div className="gallery-body">
                <Link className="gallery-author" to={`/creator/${item.authorId}`}>
                  <span className="gallery-avatar" aria-hidden="true">
                    {(item.authorId || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span>{item.authorId || t('创作者', 'Creator')}</span>
                </Link>
                <h2>{item.name}</h2>
                <p>{item.description || t('暂无简介', 'No description')}</p>
                <div className="gallery-foot">
                  <div className="gallery-stats">
                    <button
                      type="button"
                      className="gallery-like"
                      aria-label={t(`点赞 ${item.name}，当前 ${item.likeCount} 个赞`, `Like ${item.name}, ${item.likeCount} likes`)}
                      disabled={like.isPending}
                      onClick={() => like.mutate(item)}
                    >
                      <Icon name="heart" size={14} />
                      {item.likeCount}
                    </button>
                    <span>
                      <Icon name="play" size={13} />
                      {item.viewCount}
                    </span>
                    {item.publishedAt ? <span className="gallery-date">{formatDate(item.publishedAt)}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="dr-btn gallery-remix"
                    disabled={remix.isPending}
                    onClick={() => remix.mutate(item)}
                  >
                    <Icon name="refresh" size={13} />
                    {t('复刻', 'Remix')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        title={preview?.name ?? ''}
        width={880}
        onClose={() => setPreview(null)}
        footer={
          preview ? (
            <>
              <button
                type="button"
                className="dr-btn"
                onClick={() => like.mutate(preview)}
                disabled={like.isPending}
              >
                <Icon name="heart" size={14} />
                {preview.likeCount}
              </button>
              <button
                type="button"
                className="dr-btn dr-btn-primary"
                onClick={() => remix.mutate(preview)}
                disabled={remix.isPending}
              >
                <Icon name="refresh" size={14} />
                {remix.isPending ? t('复刻中…', 'Remixing…') : t('一键复刻', 'Remix project')}
              </button>
            </>
          ) : null
        }
      >
        {preview ? (
          <div className="gallery-preview">
            <div className="gallery-player">
              {preview.previewUrl ? (
                <video src={preview.previewUrl} controls playsInline preload="metadata" />
              ) : (
                <div className="gallery-player-empty">
                  <Icon name="film" size={32} />
                  <p>{t('该作品还没有可播放的成片，已展示项目封面。', 'No rendered video yet — showing the project cover.')}</p>
                </div>
              )}
            </div>
            <div className="gallery-preview-meta">
              <Link className="gallery-author" to={`/creator/${preview.authorId}`}>
                <span className="gallery-avatar" aria-hidden="true">
                  {(preview.authorId || '?').slice(0, 1).toUpperCase()}
                </span>
                <span>{preview.authorId}</span>
              </Link>
              <p>{preview.description || t('暂无简介', 'No description')}</p>
              <dl>
                <div>
                  <dt>{t('镜头', 'Shots')}</dt>
                  <dd>{preview.shotCount}</dd>
                </div>
                <div>
                  <dt>{t('播放', 'Views')}</dt>
                  <dd>{preview.viewCount}</dd>
                </div>
                <div>
                  <dt>{t('点赞', 'Likes')}</dt>
                  <dd>{preview.likeCount}</dd>
                </div>
                <div>
                  <dt>{t('风格', 'Style')}</dt>
                  <dd>{preview.style || '—'}</dd>
                </div>
              </dl>
              <Link className="dr-btn" to={`/project/${preview.id}`}>
                {t('打开项目', 'Open project')}
              </Link>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
