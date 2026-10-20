import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import { novelStageIndex } from '../../lib/novel'
import type { NovelDetail, NovelEpisode } from '../../domain/types'
import { Icon } from '../../components/Icon'
import './EpisodeTab.css'
import './EpisodeTab.css'

const PAGE_SIZE = 20

function badges(episode: NovelEpisode, t: (zh: string, en: string) => string) {
  const hasScript = Boolean(episode.screenplay?.shots?.length)
  const hasAsset = Boolean(episode.assets?.image?.url)
  const hasVideo = Boolean(episode.assets?.video?.url)
  const videoError = episode.assets?.video?.error
  return (
    <span className="dr-episode-badges">
      <span className={hasScript ? 'is-ok' : ''}>{t('剧本', 'Script')}{hasScript ? '✓' : '—'}</span>
      <span className={hasAsset ? 'is-ok' : ''}>{t('资产', 'Assets')}{hasAsset ? '✓' : '—'}</span>
      <span className={hasVideo ? 'is-ok' : videoError ? 'is-err' : ''} title={videoError ? String(videoError).slice(0, 120) : ''}>
        {t('成片', 'Video')}{hasVideo ? '✓' : videoError ? '✗' : '—'}
      </span>
    </span>
  )
}

export function EpisodeTab({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void }) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [seasonId, setSeasonId] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState<{ eid: string; label: string } | null>(null)
  const [bulk, setBulk] = useState<string | null>(null)

  const lkScript = novelStageIndex(novel.stage) > novelStageIndex('episodes')
  const lkAssets = novelStageIndex(novel.stage) > novelStageIndex('assets')
  const lkCompose = novelStageIndex(novel.stage) > novelStageIndex('compose')

  const seasonsQuery = useQuery({
    queryKey: ['novel-seasons', novel.id],
    queryFn: () => api.listNovelSeasons(novel.id),
  })
  const seasons = seasonsQuery.data ?? []
  const activeSeasonId = seasonId && seasons.some((season) => season.id === seasonId) ? seasonId : seasons[0]?.id ?? ''

  const episodesQuery = useQuery({
    queryKey: ['novel-episodes', novel.id, activeSeasonId],
    queryFn: () => api.listNovelEpisodes(novel.id, activeSeasonId),
    enabled: Boolean(activeSeasonId),
  })
  const subsetQuery = useQuery({
    queryKey: ['novel-season-assets', novel.id, activeSeasonId],
    queryFn: () => api.getSeasonAssetSubset(novel.id, activeSeasonId),
    enabled: Boolean(activeSeasonId),
  })

  const episodes = episodesQuery.data ?? []
  const subset = subsetQuery.data

  const filtered = useMemo(() => {
    const term = query.trim()
    if (!term) return episodes
    return episodes.filter(
      (episode) => String(episode.episodeNo) === term || (episode.title ?? '').includes(term)
    )
  }, [episodes, query])
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['novel-episodes', novel.id] })
    queryClient.invalidateQueries({ queryKey: ['novel-season-assets', novel.id] })
    queryClient.invalidateQueries({ queryKey: ['novel', novel.id] })
    onChanged()
  }

  const runEpisodeAction = async (
    episode: NovelEpisode,
    label: string,
    action: () => Promise<string>
  ) => {
    setBusy({ eid: episode.id, label })
    try {
      const message = await action()
      showToast(message, 'success')
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
      refresh()
    }
  }

  const generateScript = (episode: NovelEpisode) =>
    runEpisodeAction(episode, t('生成中…', 'Generating…'), async () => {
      const result = await api.generateEpisodeScript(novel.id, episode.id, {})
      return t(`剧本已生成（${result.screenplay?.shots?.length ?? 0} 分镜）`, `Script generated (${result.screenplay?.shots?.length ?? 0} shots)`)
    })

  const generateAssets = (episode: NovelEpisode) =>
    runEpisodeAction(episode, t('生成中…', 'Generating…'), async () => {
      const result = await api.generateEpisodeAssets(novel.id, episode.id, {})
      const error = result.assets?.video?.error
      if (error) throw new Error(t('资产部分完成，但视频生成失败：', 'Assets partially done; video failed: ') + String(error).slice(0, 120))
      return t('资产已生成', 'Assets generated')
    })

  const compose = (episode: NovelEpisode) =>
    runEpisodeAction(episode, t('合成中…', 'Composing…'), async () => {
      const result = await api.composeEpisode(novel.id, episode.id, {})
      return t(`成片完成（${result.fileName ?? ''}）`, `Video composed (${result.fileName ?? ''})`)
    })

  const handoff = (episode: NovelEpisode) =>
    runEpisodeAction(episode, t('导出中…', 'Exporting…'), async () => {
      const result = await api.exportEpisodeHandoff(novel.id, episode.id)
      return t('交接包已导出：', 'Handoff exported: ') + (result.dir ?? '')
    })

  const runBulk = async (task: 'script' | 'assets') => {
    if (!activeSeasonId) return
    setBulk(t('准备中…', 'Preparing…'))
    try {
      let guard = 0
      for (;;) {
        const result = await api.bulkGenerateSeason(novel.id, activeSeasonId, {
          task,
          onlyMissing: true,
          limit: 8,
          concurrency: 4,
        })
        setBulk(
          `${task === 'assets' ? t('资产', 'Assets') : t('剧本', 'Script')} ${result.done}/${result.total} · ${t('本轮', 'batch')} ${result.ok} ✓ / ${result.failed} ✗`
        )
        if (result.remaining <= 0 || result.processed === 0 || ++guard > 400) break
      }
      showToast(task === 'assets' ? t('本季批量资产完成', 'Season assets complete') : t('本季批量剧本完成', 'Season scripts complete'), 'success')
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBulk(null)
    }
  }

  const runSeasonAssets = async () => {
    if (!activeSeasonId) return
    setBulk(t('出图中…', 'Rendering…'))
    try {
      let guard = 0
      for (;;) {
        const result = await api.bulkGenerateSeasonAssets(novel.id, activeSeasonId, { limit: 3, concurrency: 2 })
        setBulk(t(`本季 ${result.withImages}/${result.subsetCount}`, `Season ${result.withImages}/${result.subsetCount}`))
        if (result.remaining <= 0 || result.processed === 0 || ++guard > 200) break
      }
      showToast(t('本季涉及的设定图已生成', 'Season assets generated'), 'success')
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBulk(null)
    }
  }

  const disabled = Boolean(busy) || Boolean(bulk)

  if (seasonsQuery.isLoading) {
    return <div className="dr-skeleton" style={{ height: 260 }} />
  }

  if (seasonsQuery.isError) {
    return (
      <div className="dr-card dr-state">
        <p>{t('季列表加载失败', 'Failed to load seasons')}：{(seasonsQuery.error as Error).message}</p>
        <button className="dr-btn" type="button" onClick={() => seasonsQuery.refetch()}>
          {t('重试', 'Retry')}
        </button>
      </div>
    )
  }

  if (!seasons.length) {
    return (
      <div className="dr-card dr-state dr-episode-empty">
        <Icon name="film" size={24} />
        <h3>{t('还没有季/集', 'No seasons yet')}</h3>
        <p>{t('先在「分季分集」完成规划，再回来生成单集内容。', 'Plan seasons first, then generate episode content.')}</p>
        <Link className="dr-btn dr-btn-primary" to={`/novel/${novel.id}?tab=series`}>
          {t('去分季分集', 'Go to seasons')}
        </Link>
      </div>
    )
  }

  return (
    <>
      <section className="dr-card dr-episode-head">
        <div className="dr-episode-toolbar">
          <label className="dr-inline-field">
            <span>{t('季', 'Season')}</span>
            <select
              className="dr-input"
              value={activeSeasonId}
              disabled={disabled}
              onChange={(event) => {
                setSeasonId(event.target.value)
                setPage(1)
                setQuery('')
              }}
            >
              {seasons.map((season) => (
                <option value={season.id} key={season.id}>
                  {season.title}（{season.episodeCount} {t('集', 'episodes')}）
                </option>
              ))}
            </select>
          </label>
          <span className="dr-episode-locks">
            {t('单集：剧本', 'Script')} {lkScript ? t('锁定', 'locked') : t('可改', 'editable')} / {t('资产', 'Assets')}{' '}
            {lkAssets ? t('锁定', 'locked') : t('可改', 'editable')} / {t('成片', 'Video')} {lkCompose ? t('锁定', 'locked') : t('可改', 'editable')}
          </span>
          <span className="dr-episode-spacer" />
          <button className="dr-btn" type="button" disabled={disabled || lkScript} onClick={() => runBulk('script')}>
            {t('本季批量生成剧本', 'Bulk scripts')}
          </button>
          <button className="dr-btn" type="button" disabled={disabled || lkAssets} onClick={() => runBulk('assets')}>
            {t('本季批量生成资产', 'Bulk assets')}
          </button>
          {bulk ? <span className="dr-episode-bulk">{bulk}</span> : null}
        </div>

        {subset ? (
          <div className="dr-episode-subset">
            <span>
              {t('本季设定图子集：涉及', 'Season asset subset:')} <strong>{subset.subsetCount}</strong>{' '}
              {t('张（已出图', 'used (rendered')} {subset.withImages} · {t('待出', 'pending')}{' '}
              <strong>{subset.remaining}</strong>）／{t('全书共', 'book total')} {subset.totalAssets} {t('张', 'assets')}
            </span>
            <button className="dr-btn" type="button" disabled={disabled || subset.remaining === 0} onClick={runSeasonAssets}>
              {t('生成本季涉及的设定图', 'Render season assets')}
            </button>
          </div>
        ) : null}
      </section>

      <div className="dr-episode-filters">
        <input
          className="dr-input"
          placeholder={t('搜集号 或 标题关键词', 'Search episode number or title')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setPage(1)
          }}
        />
        <span>
          {t('共', 'Total')} {filtered.length} {t('集', 'episodes')} · {t('第', 'Page')} {currentPage}/{totalPages} {t('页', '')}
        </span>
        <button className="dr-btn" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
          {t('上一页', 'Previous')}
        </button>
        <button className="dr-btn" type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
          {t('下一页', 'Next')}
        </button>
      </div>

      {episodesQuery.isLoading ? (
        <div className="dr-episode-list">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 76 }} />
          ))}
        </div>
      ) : episodesQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('单集加载失败', 'Failed to load episodes')}：{(episodesQuery.error as Error).message}</p>
          <button className="dr-btn" type="button" onClick={() => episodesQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : pageItems.length === 0 ? (
        <div className="dr-card dr-state">
          <p>{episodes.length ? t('没有匹配的集', 'No matching episodes') : t('该季暂无集，请先在分季分集规划', 'No episodes in this season')}</p>
        </div>
      ) : (
        <div className="dr-episode-list">
          {pageItems.map((episode) => {
            const episodeBusy = busy?.eid === episode.id
            return (
              <article className="dr-card dr-episode-item" key={episode.id}>
                <div className="dr-episode-main">
                  <div className="dr-episode-title">
                    <strong>#{episode.episodeNo}</strong> {episode.title}
                    <span>
                      · {episode.targetSeconds}s
                      {episode.screenplay?.totalSeconds ? ` · ${t('已成片', 'rendered')} ${episode.screenplay.totalSeconds}s` : ''}
                    </span>
                  </div>
                  {badges(episode, t)}
                </div>
                <div className="dr-episode-actions">
                  <button
                    className="dr-btn"
                    type="button"
                    disabled={disabled || lkScript}
                    onClick={() => generateScript(episode)}
                  >
                    {episodeBusy && busy?.label ? busy.label : episode.screenplay ? t('重生成剧本', 'Regenerate script') : t('生成剧本', 'Generate script')}
                  </button>
                  <Link className="dr-btn" to={`/novel/${novel.id}/shots/${episode.id}`}>
                    {t('分镜', 'Shots')}
                    {episode.screenplay?.shots?.length ? `（${episode.screenplay.shots.length}）` : ''}
                  </Link>
                  <button className="dr-btn" type="button" disabled={disabled || lkAssets} onClick={() => generateAssets(episode)}>
                    {t('生成资产', 'Generate assets')}
                  </button>
                  <button className="dr-btn" type="button" disabled={disabled || lkCompose} onClick={() => compose(episode)}>
                    {t('合成成片', 'Compose')}
                  </button>
                  <button className="dr-btn" type="button" disabled={disabled} onClick={() => handoff(episode)}>
                    {t('交接导出', 'Handoff')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <p className="dr-novel-note dr-episode-hint">
        {t(
          '「分镜」会打开旧版制作台的分镜详情，可管理参考图、外部回传视频与本集角色形象。',
          'Shots opens the legacy workspace for reference images, imported videos and episode character states.'
        )}
      </p>
    </>
  )
}
