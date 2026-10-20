import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { relativeTime } from '../lib/format'
import type { CommunityReview, CommunityReviewInput } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Community.css'

type Period = 'daily' | 'weekly' | 'monthly'

const DIMENSIONS: { key: 'storyScore' | 'visualScore' | 'performanceScore' | 'soundtrackScore'; zh: string; en: string }[] = [
  { key: 'storyScore', zh: '故事', en: 'Story' },
  { key: 'visualScore', zh: '画面', en: 'Visual' },
  { key: 'performanceScore', zh: '表演', en: 'Performance' },
  { key: 'soundtrackScore', zh: '配乐', en: 'Sound' },
]

const EMPTY_SCORES = { storyScore: 4, visualScore: 4, performanceScore: 4, soundtrackScore: 4 }

function currentUserId() {
  try {
    const raw = localStorage.getItem('dreamreel_user')
    return raw ? JSON.parse(raw)?.id || 'usr_a' : 'usr_a'
  } catch {
    return 'usr_a'
  }
}

function ScoreBars({ review, compact = false }: { review: CommunityReview; compact?: boolean }) {
  const { t } = useLang()
  return (
    <div className={`community-scores ${compact ? 'is-compact' : ''}`}>
      {DIMENSIONS.map((dimension) => {
        const score = Number(review[dimension.key]) || 0
        const display = score / 2
        return (
          <div className="community-score" key={dimension.key}>
            <span>{t(dimension.zh, dimension.en)}</span>
            <i><b style={{ width: `${Math.min(100, (score / 10) * 100)}%` }} /></i>
            <strong>{display.toFixed(1)}</strong>
          </div>
        )
      })}
    </div>
  )
}

export function CommunityPage() {
  const queryClient = useQueryClient()
  const { t, lang } = useLang()
  const userId = useMemo(currentUserId, [])
  const [period, setPeriod] = useState<Period>('weekly')
  const [writeOpen, setWriteOpen] = useState(false)
  const [selected, setSelected] = useState<CommunityReview | null>(null)
  const [reportTarget, setReportTarget] = useState<CommunityReview | null>(null)
  const [reportReason, setReportReason] = useState('')
  const [title, setTitle] = useState('')
  const [movieId, setMovieId] = useState('')
  const [content, setContent] = useState('')
  const [tags, setTags] = useState('')
  const [scores, setScores] = useState(EMPTY_SCORES)
  const [formError, setFormError] = useState('')

  const reviewsQuery = useQuery({ queryKey: ['community', 'reviews'], queryFn: () => api.listCommunityReviews({ limit: 50 }) })
  const leaderboardQuery = useQuery({
    queryKey: ['community', 'leaderboard', period],
    queryFn: () => api.getCommunityLeaderboard(period, 10),
  })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'community-films'],
    queryFn: () => api.listProjects({ limit: 100 }),
    staleTime: 60_000,
  })

  const reviews = reviewsQuery.data ?? []
  const leaderboard = leaderboardQuery.data?.leaderboard ?? []

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['community'] })
  }

  const createReview = useMutation({
    mutationFn: (payload: CommunityReviewInput) => api.createCommunityReview({ ...payload, userId }),
    onSuccess: () => {
      showToast(t('影评已发布', 'Review published'), 'success')
      setWriteOpen(false)
      setTitle('')
      setMovieId('')
      setContent('')
      setTags('')
      setScores(EMPTY_SCORES)
      setFormError('')
      invalidate()
    },
    onError: (error: Error) => setFormError(error.message),
  })

  const like = useMutation({
    mutationFn: (review: CommunityReview) => api.likeCommunityReview(review.id, userId),
    onSuccess: (data) => {
      setSelected((current) => (current?.id === data.id ? data : current))
      showToast(t('已点赞', 'Liked'), 'success')
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const report = useMutation({
    mutationFn: () => api.createCommunityReport({ reviewId: reportTarget!.id, reporterId: userId, reason: reportReason.trim() }),
    onSuccess: () => {
      showToast(t('举报已提交，我们会尽快处理', 'Report submitted'), 'success')
      setReportTarget(null)
      setReportReason('')
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const openReview = async (reviewId: string) => {
    const local = reviews.find((review) => review.id === reviewId)
    if (local) {
      setSelected(local)
      return
    }
    try {
      setSelected(await api.getCommunityReview(reviewId))
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const submitReview = () => {
    if (!title.trim()) {
      setFormError(t('请填写影评标题', 'Title is required'))
      return
    }
    if (!content.trim()) {
      setFormError(t('请填写影评正文', 'Review body is required'))
      return
    }
    setFormError('')
    createReview.mutate({
      title: title.trim(),
      movieId: movieId.trim() || undefined,
      content: content.trim(),
      movieTags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      storyScore: scores.storyScore * 2,
      visualScore: scores.visualScore * 2,
      performanceScore: scores.performanceScore * 2,
      soundtrackScore: scores.soundtrackScore * 2,
    })
  }

  return (
    <div className="dr-page community-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Community</p>
          <h1>{t('影评社区', 'Community')}</h1>
          <p className="projects-lead">
            {t('用四维评分与逐镜点评记录观感，发现值得看的作品。', 'Review films across four dimensions and find what is worth watching.')}
          </p>
        </div>
        <button type="button" className="dr-btn dr-btn-primary" onClick={() => setWriteOpen(true)}>
          <Icon name="plus" size={15} />
          {t('写影评', 'Write a review')}
        </button>
      </div>

      <div className="community-layout">
        <section className="community-feed" aria-label={t('影评列表', 'Reviews')}>
          {reviewsQuery.isLoading ? (
            <>{[0, 1].map((key) => <div className="dr-skeleton community-skeleton" key={key} />)}</>
          ) : reviewsQuery.isError ? (
            <div className="dr-card dr-state">
              <p>{t('影评加载失败', 'Failed to load reviews')}：{(reviewsQuery.error as Error).message}</p>
              <button className="dr-btn" onClick={() => reviewsQuery.refetch()}>{t('重试', 'Retry')}</button>
            </div>
          ) : reviews.length === 0 ? (
            <div className="dr-card dr-state community-empty">
              <Icon name="message" size={26} />
              <p>{t('社区还没有影评，写下第一篇。', 'No reviews yet. Write the first one.')}</p>
              <button className="dr-btn dr-btn-primary" onClick={() => setWriteOpen(true)}>{t('写影评', 'Write a review')}</button>
            </div>
          ) : (
            reviews.map((review) => (
              <article className="community-card" key={review.id}>
                <div className="community-card-head">
                  <div>
                    <button type="button" className="community-title" onClick={() => setSelected(review)}>
                      {review.title}
                    </button>
                    <div className="community-byline">
                      <span>@{review.userId}</span>
                      {review.movieId ? <span>{t('影片', 'Film')} · {review.movieId}</span> : null}
                      <span>{relativeTime(review.createdAt, lang)}</span>
                    </div>
                  </div>
                  <div className="community-overall">
                    <strong>{(Number(review.overallScore) / 2).toFixed(1)}</strong>
                    <span>/ 5</span>
                  </div>
                </div>
                <ScoreBars review={review} compact />
                {review.content ? <p className="community-content">{review.content}</p> : null}
                <div className="community-card-foot">
                  <div className="community-tags">
                    {review.movieTags?.map((tag) => <span key={tag}>{tag}</span>)}
                  </div>
                  <div className="community-actions">
                    <button type="button" onClick={() => like.mutate(review)} disabled={like.isPending}>
                      <Icon name="heart" size={13} />
                      {review.likeCount ?? 0}
                    </button>
                    <button type="button" onClick={() => { setReportTarget(review); setReportReason('') }}>
                      <Icon name="alert" size={13} />
                      {t('举报', 'Report')}
                    </button>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <aside className="community-side">
          <section className="community-panel">
            <div className="community-panel-head">
              <h2>{t('热评榜', 'Leaderboard')}</h2>
              <div className="community-period" role="group" aria-label={t('榜单周期', 'Leaderboard period')}>
                {(['daily', 'weekly', 'monthly'] as Period[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={period === key ? 'is-active' : ''}
                    aria-pressed={period === key}
                    onClick={() => setPeriod(key)}
                  >
                    {key === 'daily' ? t('日', 'D') : key === 'weekly' ? t('周', 'W') : t('月', 'M')}
                  </button>
                ))}
              </div>
            </div>
            {leaderboardQuery.isLoading ? (
              <div className="dr-skeleton" style={{ height: 120 }} />
            ) : leaderboard.length === 0 ? (
              <p className="community-note">{t('本周期暂无上榜影评。', 'No ranked reviews this period.')}</p>
            ) : (
              <ol className="community-leaderboard">
                {leaderboard.map((item) => (
                  <li key={item.reviewId}>
                    <button type="button" onClick={() => openReview(item.reviewId)}>
                      <span className="community-rank">{String(item.rank).padStart(2, '0')}</span>
                      <span className="community-rank-title">{item.title}</span>
                      <span className="community-heat">{Number(item.heat).toFixed(1)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="community-panel">
            <h2>{t('社区公告', 'Guidelines')}</h2>
            <ul className="community-rules">
              <li>{t('评分基于完整观看，四项独立打分。', 'Rate after watching; score each dimension independently.')}</li>
              <li>{t('剧透请标注，正文避免人身攻击。', 'Mark spoilers and keep criticism about the work.')}</li>
              <li>{t('举报会进入人工审核，重复举报无效。', 'Reports go to review; duplicates are rejected.')}</li>
            </ul>
            <p className="community-note">{t('当前身份', 'Identity')}：@{userId}</p>
          </section>
        </aside>
      </div>

      <Modal
        open={writeOpen}
        title={t('写影评', 'Write a review')}
        width={640}
        onClose={() => (!createReview.isPending ? setWriteOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setWriteOpen(false)}>{t('取消', 'Cancel')}</button>
            <button className="dr-btn dr-btn-primary" type="button" disabled={createReview.isPending} onClick={submitReview}>
              {createReview.isPending ? t('发布中…', 'Publishing…') : t('发布影评', 'Publish')}
            </button>
          </>
        }
      >
        <div className="community-form">
          <label className="dr-field">
            <span>{t('标题', 'Title')} *</span>
            <input className="dr-input" value={title} maxLength={80} onChange={(event) => setTitle(event.target.value)} placeholder={t('一句话说清你的判断', 'One line that states your take')} />
          </label>
          <label className="dr-field">
            <span>{t('影片', 'Film')}</span>
            <input className="dr-input" list="community-films" value={movieId} onChange={(event) => setMovieId(event.target.value)} placeholder={t('片名或影片 ID', 'Film title or ID')} />
            <datalist id="community-films">
              {(projectsQuery.data?.items ?? []).map((project) => <option key={project.id} value={project.name} />)}
            </datalist>
          </label>
          <div className="community-score-form">
            {DIMENSIONS.map((dimension) => (
              <label key={dimension.key}>
                <span>{t(dimension.zh, dimension.en)}</span>
                <input
                  type="range"
                  min={0}
                  max={5}
                  step={0.5}
                  value={scores[dimension.key]}
                  onChange={(event) => setScores({ ...scores, [dimension.key]: Number(event.target.value) })}
                />
                <output>{scores[dimension.key].toFixed(1)}</output>
              </label>
            ))}
          </div>
          <label className="dr-field">
            <span>{t('正文', 'Review')} *</span>
            <textarea className="dr-input" rows={5} value={content} maxLength={2000} onChange={(event) => setContent(event.target.value)} placeholder={t('哪些镜头、表演或声音支撑了你的评分？', 'Which shots, performances or sounds shaped your score?')} />
          </label>
          <label className="dr-field">
            <span>{t('标签', 'Tags')}</span>
            <input className="dr-input" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="sci-fi, slow-burn, neon" />
          </label>
          {formError ? <p className="dr-error" role="alert">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(selected)}
        title={selected?.title ?? ''}
        width={660}
        onClose={() => setSelected(null)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setSelected(null)}>{t('关闭', 'Close')}</button>
            {selected ? (
              <button
                className="dr-btn"
                type="button"
                onClick={() => {
                  setReportTarget(selected)
                  setSelected(null)
                  setReportReason('')
                }}
              >
                {t('举报', 'Report')}
              </button>
            ) : null}
            {selected ? (
              <button className="dr-btn dr-btn-primary" type="button" onClick={() => like.mutate(selected)} disabled={like.isPending}>
                <Icon name="heart" size={14} />
                {t('点赞', 'Like')} {selected.likeCount ?? 0}
              </button>
            ) : null}
          </>
        }
      >
        {selected ? (
          <div className="community-detail">
            <div className="community-byline">
              <span>@{selected.userId}</span>
              {selected.movieId ? <span>{t('影片', 'Film')} · {selected.movieId}</span> : null}
              <span>{relativeTime(selected.createdAt, lang)}</span>
              <span>{t('综合', 'Overall')} {(Number(selected.overallScore) / 2).toFixed(1)} / 5</span>
            </div>
            <ScoreBars review={selected} />
            <p className="community-detail-body">{selected.content}</p>
            <div className="community-tags">
              {selected.movieTags?.map((tag) => <span key={tag}>{tag}</span>)}
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(reportTarget)}
        title={t('举报影评', 'Report review')}
        width={460}
        onClose={() => (!report.isPending ? setReportTarget(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setReportTarget(null)}>{t('取消', 'Cancel')}</button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={reportReason.trim().length < 4 || report.isPending}
              onClick={() => report.mutate()}
            >
              {report.isPending ? t('提交中…', 'Submitting…') : t('提交举报', 'Submit')}
            </button>
          </>
        }
      >
        <div className="community-form">
          <p className="community-note">{t('举报', 'Reporting')}《{reportTarget?.title}》</p>
          <label className="dr-field">
            <span>{t('原因', 'Reason')} *</span>
            <textarea
              className="dr-input"
              rows={4}
              value={reportReason}
              onChange={(event) => setReportReason(event.target.value)}
              placeholder={t('请说明具体问题（至少 4 个字）', 'Describe the issue (at least 4 characters)')}
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
