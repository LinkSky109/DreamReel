import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import { novelStageIndex } from '../../lib/novel'
import type { NovelDetail, NovelSeason, NovelSeriesEstimate } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import './SeriesTab.css'

function hours(seconds: number) {
  return (seconds / 3600).toFixed(1)
}

export function SeriesTab({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void }) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const locked = novelStageIndex(novel.stage) > novelStageIndex('series')

  const dataQuery = useQuery({
    queryKey: ['novel-series', novel.id],
    queryFn: async (): Promise<{ seasons: NovelSeason[]; estimate: NovelSeriesEstimate | null }> => {
      const [seasons, estimate] = await Promise.all([
        api.listNovelSeasons(novel.id),
        api.getNovelSeriesEstimate(novel.id).catch(() => null),
      ])
      return { seasons, estimate }
    },
  })

  const plan = useMutation({
    mutationFn: () => api.planNovelSeries(novel.id, {}),
    onSuccess: (result) => {
      const hit = result.buckets
        ? Math.round((result.buckets.inRange / Math.max(1, result.buckets.total)) * 100)
        : null
      showToast(
        t(
          `规划完成：${result.seasons} 季 · ${result.episodes} 集${hit != null ? ` · 时长命中 ${hit}%` : ''}`,
          `Planned ${result.seasons} seasons · ${result.episodes} episodes${hit != null ? ` · ${hit}% in range` : ''}`
        ),
        'success'
      )
      setConfirmOpen(false)
      queryClient.invalidateQueries({ queryKey: ['novel-series', novel.id] })
      queryClient.invalidateQueries({ queryKey: ['novel', novel.id] })
      onChanged()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const seasons = dataQuery.data?.seasons ?? []
  const planResult = plan.data
  const estimate = dataQuery.data?.estimate
  const support = estimate?.supportSeconds?.[String(estimate.charsPerSecond)] ?? estimate?.supportSeconds?.['4.5'] ?? 0
  const diff = support - (estimate?.plannedSeconds ?? 0)
  const aligned = estimate?.plannedSeconds ? Math.abs(diff) / estimate.plannedSeconds < 0.08 : false

  return (
    <>
      <section className="dr-card dr-series-head">
        <div className="dr-series-title">
          <h2>
            {t('分季分集', 'Seasons & episodes')}
            {locked ? <span className="dr-novel-locked">{t('已锁定', 'Locked')}</span> : null}
          </h2>
          <button
            className="dr-btn dr-btn-primary"
            type="button"
            disabled={locked || plan.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {plan.isPending
              ? t('规划中…', 'Planning…')
              : t('智能规划（LLM 大事件，每季≥200集）', 'Smart plan (LLM arcs, ≥200/season)')}
          </button>
        </div>

        <div className="dr-series-stats">
          <span>{t('季', 'Seasons')} {seasons.length}</span>
          <span>{t('集', 'Episodes')} {estimate?.episodes ?? 0}</span>
          <span>{t('每集目标', 'Target / episode')} {estimate?.episodeSeconds ?? 90}s</span>
          <span>{t('语速', 'Speech rate')} {estimate?.charsPerSecond ?? 4.5} {t('字/秒', 'chars/s')}</span>
        </div>

        {planResult ? (
          <div className="dr-series-plan-result" role="status" aria-live="polite">
            <span className="dr-tag">
              {planResult.provider === 'llm'
                ? t('LLM 大事件', 'LLM arcs')
                : t('规则回退', 'Heuristic')}
            </span>
            {planResult.buckets ? (
              <span>
                {t('85–95s 命中', '85–95s hit')}{' '}
                <strong>
                  {planResult.buckets.inRange}/{planResult.buckets.total}
                </strong>
                {`（${Math.round(
                  (planResult.buckets.inRange / Math.max(1, planResult.buckets.total)) * 100
                )}%）`}
              </span>
            ) : null}
            {planResult.exceptions ? (
              <span>
                {t('例外', 'Exceptions')} <strong>{planResult.exceptions}</strong>
              </span>
            ) : null}
          </div>
        ) : null}

        {estimate && estimate.totalChars > 0 ? (
          <div className="dr-series-estimate">
            <div>
              {t('正文', 'Text')}{' '}
              {estimate.totalChars >= 10000
                ? `${(estimate.totalChars / 1e6).toFixed(2)}M ${t('字', 'chars')}`
                : `${estimate.totalChars} ${t('字', 'chars')}`}{' '}
              · {t('规划', 'Planned')}{' '}
              <strong>{hours(estimate.plannedSeconds)}h</strong> · {t('按', 'at')}{' '}
              <strong>{estimate.charsPerSecond} {t('字/秒', 'chars/s')}</strong> {t('可支撑', 'supports')}{' '}
              <strong className={aligned ? 'is-good' : 'is-warn'}>{hours(support)}h</strong>
            </div>
            <div className="dr-series-estimate-detail">
              {diff >= 0 ? t('多 ', 'over ') : t('差 ', 'short ')}
              {hours(Math.abs(diff))}h ·{' '}
              {aligned ? t('基本吻合', 'well matched') : t('偏差偏大', 'large mismatch')} ·{' '}
              {t('参考：4 字/秒 ', 'Reference: 4 chars/s ')}
              {hours(estimate.supportSeconds?.['4'] ?? 0)}h / 5 {t('字/秒 ', 'chars/s ')}
              {hours(estimate.supportSeconds?.['5'] ?? 0)}h
            </div>
          </div>
        ) : null}
      </section>

      {dataQuery.isLoading ? (
        <div className="dr-series-list">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 62 }} />
          ))}
        </div>
      ) : dataQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('分季分集加载失败', 'Failed to load seasons')}：{(dataQuery.error as Error).message}</p>
          <button className="dr-btn" type="button" onClick={() => dataQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : seasons.length === 0 ? (
        <div className="dr-card dr-state dr-series-empty">
          <Icon name="film" size={24} />
          <h3>{t('暂无季/集', 'No seasons yet')}</h3>
          <p>{t('点「规划」把已摄取章节拆成季与集；规划会重建现有季/集。', 'Plan to split ingested chapters into seasons and episodes. Planning rebuilds existing seasons.')}</p>
          <button
            className="dr-btn dr-btn-primary"
            type="button"
            disabled={locked || plan.isPending}
            onClick={() => setConfirmOpen(true)}
          >
            {t('开始规划', 'Start planning')}
          </button>
        </div>
      ) : (
        <div className="dr-series-list">
          {seasons.slice(0, 30).map((season) => (
            <article className="dr-card dr-series-item" key={season.id}>
              <div className="dr-series-item-main">
                <strong>{season.title}</strong>
                {season.arcName && season.arcName !== season.title ? (
                  <span className="dr-series-arc">{season.arcName}</span>
                ) : null}
                <span className="dr-tag">{season.episodeCount} {t('集', 'episodes')}</span>
                {season.planProvider ? (
                  <span className="dr-tag">
                    {season.planProvider === 'llm' ? 'LLM' : t('规则', 'Rule')}
                  </span>
                ) : null}
              </div>
              {season.goal ? <p className="dr-series-goal">{season.goal}</p> : null}
              <div className="dr-series-item-meta">
                <span>{t('章', 'Chapters')} {season.chapterStart}–{season.chapterEnd}</span>
                {season.endingHook ? (
                  <span className="dr-series-hook">
                    {t('季末钩子', 'Season hook')}：{season.endingHook}
                  </span>
                ) : season.synopsis ? (
                  <span>{season.synopsis}</span>
                ) : null}
              </div>
            </article>
          ))}
          {seasons.length > 30 ? (
            <p className="dr-novel-note">{t(`仅显示前 30 季，共 ${seasons.length} 季。`, `Showing first 30 of ${seasons.length} seasons.`)}</p>
          ) : null}
        </div>
      )}

      <Modal
        open={confirmOpen}
        title={t('规划分季分集', 'Plan seasons')}
        onClose={() => (!plan.isPending ? setConfirmOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setConfirmOpen(false)} disabled={plan.isPending}>
              {t('取消', 'Cancel')}
            </button>
            <button className="dr-btn dr-btn-primary" type="button" disabled={plan.isPending} onClick={() => plan.mutate()}>
              {plan.isPending ? t('规划中…', 'Planning…') : t('确认规划', 'Plan')}
            </button>
          </>
        }
      >
        <p className="dr-modal-text">
          {t(
            '规划会按 LLM 识别的大事件分季，并按故事边界切集（每集 85–95s）。已有的季/集记录会被替换，确定继续？',
            'Planning groups major events into seasons and cuts episodes at story boundaries (85–95s each). Existing season/episode records will be replaced.'
          )}
        </p>
        <p className="dr-novel-note">
          {t(
            '首次规划需调用 LLM 识别大事件，可能耗时数分钟，请保持页面打开；完成后再次规划会复用缓存。',
            'The first plan calls the LLM to detect arcs and may take several minutes. Keep this page open; later plans reuse the cache.'
          )}
        </p>
      </Modal>
    </>
  )
}
