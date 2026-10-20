import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import type { NovelShot } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { AuthImage } from '../components/AuthImage'
import { AuthVideo } from '../components/AuthVideo'
import './ShotsPage.css'

type StateDraft = { appearance: string; equipment: string; injuries: string; abilities: string }

const CATEGORY_LABEL: Record<string, string> = {
  character: '角色',
  clothing: '衣物',
  equipment: '装备',
  architecture: '建筑',
  scene: '场景',
  prop: '道具',
  other: '其他',
}

export function ShotsPage() {
  const { id = '', eid = '' } = useParams()
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const [pickerShot, setPickerShot] = useState<number | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerCat, setPickerCat] = useState('')
  const [drafts, setDrafts] = useState<Record<string, StateDraft>>({})

  const novelQuery = useQuery({ queryKey: ['novel', id], queryFn: () => api.getNovel(id), enabled: Boolean(id) })
  const episodesQuery = useQuery({
    queryKey: ['novel-episodes', id],
    queryFn: () => api.listNovelEpisodes(id),
    enabled: Boolean(id),
  })
  const shotsQuery = useQuery({
    queryKey: ['novel-shots', id, eid],
    queryFn: () => api.listEpisodeShots(id, eid),
    enabled: Boolean(id && eid),
  })
  const assetsQuery = useQuery({
    queryKey: ['novel-assets', id],
    queryFn: () => api.listNovelAssets(id),
    enabled: Boolean(id),
  })
  const statesQuery = useQuery({
    queryKey: ['novel-episode-states', id, eid],
    queryFn: () => api.listEpisodeStates(id, eid),
    enabled: Boolean(id && eid),
  })

  const episode = (episodesQuery.data ?? []).find((item) => item.id === eid)
  const shots = shotsQuery.data ?? []
  const assets = (assetsQuery.data?.assets ?? []).filter((asset) => Boolean(asset.imageUrl))
  const categories = useMemo(() => Array.from(new Set(assets.map((asset) => asset.category))), [assets])
  const stateItems = statesQuery.data?.items ?? []

  useEffect(() => {
    const next: Record<string, StateDraft> = {}
    for (const item of stateItems) {
      const source = item.exact ?? item.effective ?? {}
      next[item.characterId] = {
        appearance: source.appearance ?? '',
        equipment: source.equipment ?? '',
        injuries: source.injuries ?? '',
        abilities: source.abilities ?? '',
      }
    }
    setDrafts(next)
  }, [statesQuery.data])

  const refreshShots = () => queryClient.invalidateQueries({ queryKey: ['novel-shots', id, eid] })
  const refreshStates = () => queryClient.invalidateQueries({ queryKey: ['novel-episode-states', id, eid] })

  const runShotAction = async (key: string, action: () => Promise<string>) => {
    setBusy(key)
    try {
      const message = await action()
      showToast(message, 'success')
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const autoRefs = () =>
    runShotAction('auto', async () => {
      const result = await api.autoRefsEpisodeShots(id, eid)
      refreshShots()
      return t(`自动匹配：${result.shotsTouched} 个分镜、新增 ${result.refsAdded} 张参考图`, `Matched ${result.shotsTouched} shots, added ${result.refsAdded} refs`)
    })

  const exportHandoff = () =>
    runShotAction('export', async () => {
      const result = await api.exportEpisodeShotHandoff(id, eid)
      return t(`已导出 ${result.shotCount} 分镜（${result.refCount} 参考图）→ ${result.dir}`, `Exported ${result.shotCount} shots → ${result.dir}`)
    })

  const importVideos = () =>
    runShotAction('import', async () => {
      const result = await api.importEpisodeShotVideos(id, eid)
      refreshShots()
      return result.missing.length
        ? t(`导入 ${result.imported.length}/${result.total} 段（缺：${result.missing.join(',')}）`, `Imported ${result.imported.length}/${result.total} (missing: ${result.missing.join(',')})`)
        : t(`导入 ${result.imported.length}/${result.total} 段`, `Imported ${result.imported.length}/${result.total}`)
    })

  const setRefs = async (shot: NovelShot, refs: string[]) => {
    try {
      await api.setEpisodeShotRefs(id, eid, shot.index, refs)
      refreshShots()
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const generateStates = () =>
    runShotAction('states', async () => {
      const result = await api.generateEpisodeStates(id, eid)
      refreshStates()
      return t(`本集角色形象已生成（${result.count} 个）`, `Episode states generated (${result.count})`)
    })

  const saveState = async (characterId: string, name: string) => {
    const episodeNo = statesQuery.data?.episodeNo
    if (!episodeNo) return
    const draft = drafts[characterId]
    setBusy(`state-${characterId}`)
    try {
      await api.upsertCharacterState(id, characterId, episodeNo, draft)
      showToast(t(`「${name}」第 ${episodeNo} 集形象已保存`, `${name} episode ${episodeNo} state saved`), 'success')
      refreshStates()
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(null)
    }
  }

  const pickerShotData = pickerShot !== null ? shots.find((shot) => shot.index === pickerShot) : null
  const pickerAssets = assets.filter((asset) => {
    const term = pickerSearch.trim()
    return (
      (!pickerCat || asset.category === pickerCat) &&
      (!term || asset.name.includes(term) || (CATEGORY_LABEL[asset.category] ?? asset.category).includes(term))
    )
  })

  if (novelQuery.isLoading || shotsQuery.isLoading) {
    return (
      <div className="dr-page">
        <div className="dr-skeleton" style={{ height: 100, marginBottom: 14 }} />
        <div className="dr-skeleton" style={{ height: 320 }} />
      </div>
    )
  }

  if (shotsQuery.isError) {
    return (
      <div className="dr-page">
        <div className="dr-card dr-state">
          <h2>{t('分镜加载失败', 'Failed to load shots')}</h2>
          <p>{(shotsQuery.error as Error).message}</p>
          <Link className="dr-btn" to={`/novel/${id}?tab=episode`}>
            {t('返回单集', 'Back to episodes')}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="dr-page dr-shots-page">
      <Link className="dr-novel-back" to={`/novel/${id}?tab=episode`}>
        <Icon name="arrow-left" size={14} />
        {t('返回单集', 'Back to episodes')}
      </Link>

      <div className="dr-shots-head">
        <div>
          <h1 className="dr-page-title">
            {t('分镜 / 外部生成', 'Shots / external generation')}
          </h1>
          <p className="dr-page-sub">
            {episode ? `#${episode.episodeNo} ${episode.title}` : eid} · {t('分镜', 'Shots')} {shots.length} ·{' '}
            {t('已回传', 'Returned')} {shots.filter((shot) => shot.videoUrl).length} ·{' '}
            {t('已配参考图', 'With refs')} {shots.filter((shot) => shot.referenceImages.length).length}
          </p>
        </div>
        <div className="dr-shots-actions">
          <button className="dr-btn" type="button" disabled={Boolean(busy)} onClick={autoRefs}>
            {t('自动匹配参考图', 'Auto-match refs')}
          </button>
          <button className="dr-btn dr-btn-primary" type="button" disabled={Boolean(busy)} onClick={exportHandoff}>
            {t('导出分镜清单', 'Export manifest')}
          </button>
          <button className="dr-btn" type="button" disabled={Boolean(busy)} onClick={importVideos}>
            {t('导入回传视频', 'Import videos')}
          </button>
        </div>
      </div>

      <p className="dr-novel-note">
        {t(
          '流程：导出 manifest + refs → 外部工具逐分镜生成 → 放回 storage/videos/novels/<id>/shots/<eid>/shotNN.mp4 → 导入 → 成片按分镜拼接。',
          'Flow: export manifest + refs → generate externally → place shotNN.mp4 in the episode shots folder → import → compose.'
        )}
      </p>

      {shots.length === 0 ? (
        <div className="dr-card dr-state dr-shots-empty">
          <Icon name="film" size={24} />
          <h3>{t('该集暂无分镜', 'No shots yet')}</h3>
          <p>{t('先在单集页生成剧本，再回来配置参考图。', 'Generate the episode script first.')}</p>
          <Link className="dr-btn" to={`/novel/${id}?tab=episode`}>
            {t('去生成剧本', 'Go to episodes')}
          </Link>
        </div>
      ) : (
        <div className="dr-shot-list">
          {shots.map((shot) => (
            <article className="dr-card dr-shot-card" key={shot.index}>
              <div className="dr-shot-head">
                <div>
                  <strong>#{shot.index}</strong>
                  <span>{shot.duration}s</span>
                  {shot.videoUrl ? <span className="dr-shot-returned">{t('✅ 已回传', '✅ returned')}</span> : <span className="dr-shot-pending">{t('待生成', 'pending')}</span>}
                </div>
                <div className="dr-shot-actions">
                  <button className="dr-btn" type="button" onClick={() => setPickerShot(shot.index)}>
                    <Icon name="plus" size={13} />
                    {t('添加参考图', 'Add refs')}
                  </button>
                </div>
              </div>
              {shot.description ? <p className="dr-shot-desc">{shot.description}</p> : null}
              {shot.dialogue ? <p className="dr-shot-dialogue">{t('台词：', 'Dialogue: ')}{shot.dialogue}</p> : null}

              <div className="dr-shot-refs">
                <span>{t('参考图', 'Refs')}（{shot.referenceImages.length}）</span>
                <div className="dr-shot-ref-grid">
                  {shot.referenceImages.map((url) => (
                    <span className="dr-shot-ref" key={url}>
                      <AuthImage src={url} alt={t('参考图', 'Reference')} />
                      <button
                        type="button"
                        aria-label={t('移除参考图', 'Remove reference')}
                        onClick={() => setRefs(shot, shot.referenceImages.filter((item) => item !== url))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {shot.referenceImages.length === 0 ? (
                    <span className="dr-shot-no-refs">{t('暂无参考图', 'No references')}</span>
                  ) : null}
                </div>
              </div>

              {shot.videoUrl ? (
                <div className="dr-shot-video">
                  <AuthVideo src={shot.videoUrl} />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}

      <section className="dr-card dr-episode-states">
        <div className="dr-episode-states-head">
          <div>
            <h2>{t('本集角色形象', 'Episode character states')}</h2>
            <p className="dr-novel-note">
              {t(
                `第 ${statesQuery.data?.episodeNo ?? '?'} 集，随剧情时间演进；出图/出片按这里的外观与装备生成。`,
                `Episode ${statesQuery.data?.episodeNo ?? '?'} states drive appearance/equipment in generation.`
              )}
            </p>
          </div>
          <button className="dr-btn" type="button" disabled={Boolean(busy)} onClick={generateStates}>
            {t('生成 / 刷新本集形象', 'Generate states')}
          </button>
        </div>

        {statesQuery.isLoading ? (
          <div className="dr-skeleton" style={{ height: 100 }} />
        ) : stateItems.length === 0 ? (
          <p className="dr-novel-note">{t('该集尚无角色形象，点「生成 / 刷新本集形象」。', 'No states yet. Generate them above.')}</p>
        ) : (
          <div className="dr-state-list">
            {stateItems.map((item) => {
              const draft = drafts[item.characterId] ?? { appearance: '', equipment: '', injuries: '', abilities: '' }
              const fallback = !item.exact && item.effective
              return (
                <div className="dr-state-item" key={item.characterId}>
                  <div className="dr-state-name">
                    <strong>{item.name}</strong>
                    <span className={fallback ? 'is-fallback' : 'is-exact'}>
                      {item.exact ? t('本集已定', 'set for this episode') : t(`沿用第${item.effective?.episodeNo ?? '?'}集`, `inherited from ep ${item.effective?.episodeNo ?? '?'}`)}
                    </span>
                  </div>
                  <div className="dr-state-fields">
                    {(['appearance', 'equipment', 'injuries', 'abilities'] as const).map((field) => (
                      <input
                        key={field}
                        className="dr-input"
                        placeholder={t(
                          { appearance: '外观', equipment: '装备（本集已持有）', injuries: '伤势/状态', abilities: '能力阶段' }[field],
                          field
                        )}
                        value={draft[field]}
                        disabled={Boolean(busy)}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.characterId]: { ...draft, [field]: event.target.value },
                          }))
                        }
                      />
                    ))}
                  </div>
                  <button
                    className="dr-btn"
                    type="button"
                    disabled={Boolean(busy)}
                    onClick={() => saveState(item.characterId, item.name)}
                  >
                    {busy === `state-${item.characterId}` ? t('保存中…', 'Saving…') : t('保存本集形象', 'Save state')}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      <Modal
        open={pickerShot !== null}
        title={t(`为分镜 #${pickerShot ?? ''} 选择参考图`, `Choose refs for shot #${pickerShot ?? ''}`)}
        onClose={() => setPickerShot(null)}
        width={760}
        footer={
          <button className="dr-btn dr-btn-primary" type="button" onClick={() => setPickerShot(null)}>
            {t('完成', 'Done')}
          </button>
        }
      >
        <div className="dr-ref-picker">
          <div className="dr-ref-filters">
            <input
              className="dr-input"
              placeholder={t('搜索名称/类别', 'Search name/category')}
              value={pickerSearch}
              onChange={(event) => setPickerSearch(event.target.value)}
            />
            <select className="dr-input" value={pickerCat} onChange={(event) => setPickerCat(event.target.value)}>
              <option value="">{t('全部类别', 'All categories')}</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABEL[category] ?? category}
                </option>
              ))}
            </select>
            <span>{t('已选', 'Selected')} {pickerShotData?.referenceImages.length ?? 0}</span>
          </div>
          {pickerAssets.length === 0 ? (
            <p className="dr-novel-note">{t('没有可用设定图，请先在设定图集出图。', 'No rendered assets. Generate some in the art tab first.')}</p>
          ) : (
            <div className="dr-ref-grid">
              {pickerAssets.slice(0, 120).map((asset) => {
                const selected = Boolean(pickerShotData?.referenceImages.includes(asset.imageUrl ?? ''))
                return (
                  <button
                    key={asset.id}
                    type="button"
                    className={`dr-ref-option ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => {
                      if (!pickerShotData || !asset.imageUrl) return
                      const next = selected
                        ? pickerShotData.referenceImages.filter((url) => url !== asset.imageUrl)
                        : [...pickerShotData.referenceImages, asset.imageUrl]
                      setRefs(pickerShotData, next)
                    }}
                  >
                    <AuthImage src={asset.imageUrl} alt={asset.name} />
                    <span>{asset.name}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
