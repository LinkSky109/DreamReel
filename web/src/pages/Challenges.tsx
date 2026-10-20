import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import type { Challenge } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Challenges.css'

type Filter = 'all' | 'active' | 'ended'

const IMAGES: Record<string, string> = {
  'challenge-dream': '/media/img/ocean-night.jpg',
  'challenge-city': '/media/img/city-night.jpg',
  'challenge-scifi': '/media/img/desert-dusk.jpg',
}
const FALLBACKS = ['/media/img/fog-mountain.jpg', '/media/img/forest-light.jpg', '/media/img/night-mountain.jpg']

function imageOf(challenge: Challenge, index: number) {
  return IMAGES[challenge.id] ?? FALLBACKS[index % FALLBACKS.length]
}

function dateLabel(value: string) {
  return value?.slice(0, 10).replaceAll('-', '.') ?? '—'
}

function progressOf(challenge: Challenge) {
  const start = new Date(challenge.startAt).getTime()
  const end = new Date(challenge.endAt).getTime()
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100))
}

export function ChallengesPage() {
  const navigate = useNavigate()
  const { t } = useLang()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Challenge | null>(null)

  const listQuery = useQuery({
    queryKey: ['challenges', filter],
    queryFn: () => api.listChallenges(filter),
  })

  const counts = useMemo(() => {
    const items = listQuery.data?.items ?? []
    return {
      all: items.length,
      active: items.filter((item) => item.status === 'active').length,
      ended: items.filter((item) => item.status !== 'active').length,
    }
  }, [listQuery.data])

  const allQuery = useQuery({
    queryKey: ['challenges', 'all'],
    queryFn: () => api.listChallenges('all'),
    staleTime: 30_000,
  })

  const countFor = (key: Filter) => {
    if (filter === key) return counts[key]
    const items = allQuery.data?.items ?? []
    return key === 'all' ? items.length : items.filter((item) => (key === 'active' ? item.status === 'active' : item.status !== 'active')).length
  }

  const detailQuery = useQuery({
    queryKey: ['challenge', selected?.id],
    queryFn: () => api.getChallengeDetail(selected!.id),
    enabled: Boolean(selected),
  })

  const join = useMutation({
    mutationFn: (challenge: Challenge) => api.joinChallenge(challenge.id, {}),
    onSuccess: (result) => {
      showToast(t('已创建投稿项目，去创作吧', 'Entry project created'), 'success')
      setSelected(null)
      navigate(`/project/${result.project.id}`)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const detail = detailQuery.data ?? (selected ? { ...selected, entries: [], entryCount: selected.entryCount ?? 0 } : null)
  const items = listQuery.data?.items ?? []

  return (
    <div className="dr-page challenges-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Challenges</p>
          <h1>{t('创作挑战', 'Challenges')}</h1>
          <p className="projects-lead">
            {t('用主题挑战驱动创作，优秀作品获得官方推荐与奖励。', 'Create around a theme and earn official features and rewards.')}
          </p>
        </div>
        <button type="button" className="dr-btn" onClick={() => navigate('/projects?create=1')}>
          <Icon name="plus" size={15} />
          {t('自由创作', 'Create freely')}
        </button>
      </div>

      <div className="challenge-toolbar">
        <div className="challenge-filters" role="group" aria-label={t('挑战筛选', 'Challenge filter')}>
          {(['all', 'active', 'ended'] as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'is-active' : ''}
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {key === 'all' ? t('全部', 'All') : key === 'active' ? t('进行中', 'Active') : t('已结束', 'Ended')}
              <span>{countFor(key)}</span>
            </button>
          ))}
        </div>
        <p className="challenge-tip">
          <Icon name="sparkles" size={13} />
          {t('参与后自动创建带主题说明的投稿项目', 'Joining creates a themed entry project')}
        </p>
      </div>

      {listQuery.isLoading ? (
        <div className="challenge-grid">
          {[0, 1, 2].map((key) => <div className="dr-skeleton challenge-skeleton" key={key} />)}
        </div>
      ) : listQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('挑战加载失败', 'Failed to load challenges')}：{(listQuery.error as Error).message}</p>
          <button className="dr-btn" onClick={() => listQuery.refetch()}>{t('重试', 'Retry')}</button>
        </div>
      ) : items.length === 0 ? (
        <div className="dr-card dr-state">
          <Icon name="trophy" size={24} />
          <p>{t('当前筛选下没有挑战', 'No challenges in this filter')}</p>
          <button className="dr-btn" onClick={() => setFilter('all')}>{t('查看全部', 'View all')}</button>
        </div>
      ) : (
        <div className="challenge-grid">
          {items.map((challenge, index) => {
            const ended = challenge.status !== 'active'
            const progress = progressOf(challenge)
            return (
              <article className={`challenge-card ${ended ? 'is-ended' : ''}`} key={challenge.id}>
                <div className="challenge-cover">
                  <img src={imageOf(challenge, index)} alt="" loading="lazy" />
                  <span className={`challenge-status ${ended ? 'is-ended' : ''}`}>
                    {ended ? t('已结束', 'Ended') : t('进行中', 'Active')}
                  </span>
                  <span className="challenge-index">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="challenge-body">
                  <div className="challenge-title-row">
                    <h2>{challenge.title}</h2>
                    <span>{challenge.entryCount ?? 0} {t('份投稿', 'entries')}</span>
                  </div>
                  <p className="challenge-theme">{challenge.theme}</p>
                  <p className="challenge-desc">{challenge.description}</p>
                  <div className="challenge-dates">
                    <span>{dateLabel(challenge.startAt)} — {dateLabel(challenge.endAt)}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="challenge-progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
                  <div className="challenge-reward">
                    <Icon name="gift" size={13} />
                    <span>{challenge.reward}</span>
                  </div>
                  <button type="button" className="dr-btn challenge-cta" onClick={() => setSelected(challenge)}>
                    {ended ? t('查看回顾', 'View recap') : t('查看与参与', 'View and join')}
                    <Icon name="arrow-right" size={14} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        title={selected?.title ?? ''}
        width={660}
        onClose={() => setSelected(null)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setSelected(null)}>{t('关闭', 'Close')}</button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={!detail || detail.status !== 'active' || join.isPending}
              onClick={() => detail && join.mutate(detail)}
            >
              {detail?.status !== 'active'
                ? t('挑战已结束', 'Challenge ended')
                : join.isPending
                  ? t('创建中…', 'Creating…')
                  : t('参与挑战，创建投稿项目', 'Join and create entry')}
            </button>
          </>
        }
      >
        {detailQuery.isLoading ? (
          <div className="dr-skeleton" style={{ height: 220 }} />
        ) : detailQuery.isError ? (
          <p className="dr-error">{(detailQuery.error as Error).message}</p>
        ) : detail ? (
          <div className="challenge-detail">
            <div className="challenge-detail-meta">
              <span>{dateLabel(detail.startAt)} — {dateLabel(detail.endAt)}</span>
              <span>{detail.entryCount} {t('份投稿', 'entries')}</span>
              <span className={detail.status === 'active' ? 'is-active' : ''}>
                {detail.status === 'active' ? t('进行中', 'Active') : t('已结束', 'Ended')}
              </span>
            </div>
            <p className="challenge-detail-theme">{t('主题', 'Theme')}：{detail.theme}</p>
            <p className="challenge-detail-desc">{detail.description}</p>
            <div className="challenge-detail-grid">
              <section>
                <h3>{t('参赛规则', 'Rules')}</h3>
                <ul>
                  {detail.rules.map((rule) => <li key={rule}>{rule}</li>)}
                </ul>
              </section>
              <section>
                <h3>{t('奖励', 'Reward')}</h3>
                <p>{detail.reward}</p>
              </section>
            </div>
            <section className="challenge-entries">
              <h3>{t('作品排行', 'Entries')}（{detail.entryCount}）</h3>
              {detail.entries.length === 0 ? (
                <p className="challenge-empty">{t('还没有投稿作品，成为第一个。', 'No entries yet. Be the first.')}</p>
              ) : (
                <div className="challenge-entry-list">
                  {detail.entries.map((entry, index) => (
                    <button key={entry.id} type="button" onClick={() => navigate(`/project/${entry.id}`)}>
                      <span className="challenge-rank">#{index + 1}</span>
                      <span className="challenge-entry-name">{entry.name}</span>
                      <span className="challenge-entry-like"><Icon name="heart" size={12} />{entry.likeCount ?? 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
