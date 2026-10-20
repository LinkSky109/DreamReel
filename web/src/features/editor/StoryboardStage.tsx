import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project, Shot } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { statusLabel, statusTone } from '../../lib/format'
import type { SaveState } from './EditorPage'
import { aspectRatioOf, cameraLabel, shotTypeLabel } from './utils'

type Props = {
  project: Project
  selectedShotId: string | null
  onSelect: (shotId: string) => void
  onRefresh: () => void
  onSaveState: (state: SaveState) => void
  styles: { id: string; name: string }[]
}

const FILTERS = [
  { id: 'all', zh: '全部', en: 'All' },
  { id: 'pending', zh: '待生成', en: 'Pending' },
  { id: 'generating', zh: '生成中', en: 'Generating' },
  { id: 'completed', zh: '已完成', en: 'Completed' },
  { id: 'failed', zh: '需重试', en: 'Failed' },
] as const

export function StoryboardStage({
  project,
  selectedShotId,
  onSelect,
  onRefresh,
  onSaveState,
  styles,
}: Props) {
  const { t, lang } = useLang()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all')
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [draft, setDraft] = useState({ description: '', duration: 5, dialogue: '', narration: '' })
  const dirtyRef = useRef(false)

  const shots = project.shots ?? []
  const hasNovelSource = shots.some((shot) => shot.sourceNovelId)
  const novelsQuery = useQuery({
    queryKey: ['novels', 'shot-source'],
    queryFn: () => api.listNovels(),
    enabled: hasNovelSource,
    staleTime: 60_000,
  })
  const novelTitle = (id?: string | null) =>
    (novelsQuery.data ?? []).find((novel) => novel.id === id)?.title ?? id ?? ''
  const selectedShot = shots.find((shot) => shot.id === selectedShotId) ?? shots[0]
  const filtered = filter === 'all' ? shots : shots.filter((shot) => shot.status === filter)
  const completed = shots.filter((shot) => shot.status === 'completed').length
  const generatable = shots.filter((shot) => !shot.locked && shot.status !== 'completed' && shot.status !== 'generating')

  useEffect(() => {
    if (!selectedShot) return
    dirtyRef.current = false
    setDraft({
      description: selectedShot.description ?? '',
      duration: selectedShot.duration ?? 5,
      dialogue: selectedShot.dialogue ?? '',
      narration: selectedShot.narration ?? '',
    })
  }, [selectedShot?.id, selectedShot?.updatedAt])

  // 检查器字段防抖保存（避免快速失焦丢失改动）
  useEffect(() => {
    if (!selectedShot || selectedShot.locked || !dirtyRef.current) return
    const timer = window.setTimeout(() => {
      void saveShot(draft)
    }, 700)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  useEffect(() => {
    if (!selectedShot) return
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable ||
          target.closest('[role="dialog"]'))
      ) {
        return
      }
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      const index = shots.findIndex((shot) => shot.id === selectedShot.id)
      const nextIndex = event.key === 'ArrowRight' ? index + 1 : index - 1
      if (nextIndex < 0 || nextIndex >= shots.length) return
      event.preventDefault()
      onSelect(shots[nextIndex].id)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedShot, shots, onSelect])

  const saveShot = async (value = draft) => {
    if (!selectedShot || selectedShot.locked) return
    const changed =
      value.description !== (selectedShot.description ?? '') ||
      value.duration !== (selectedShot.duration ?? 5) ||
      value.dialogue !== (selectedShot.dialogue ?? '') ||
      value.narration !== (selectedShot.narration ?? '')
    if (!changed) return
    onSaveState('saving')
    try {
      await api.updateShot(project.id, selectedShot.id, {
        description: value.description,
        duration: Number(value.duration) || 5,
        dialogue: value.dialogue,
        narration: value.narration,
      })
      dirtyRef.current = false
      onSaveState('saved')
      onRefresh()
    } catch (error) {
      dirtyRef.current = false
      onSaveState('error')
      showToast((error as Error).message, 'error')
    }
  }

  const patchDraft = (patch: Partial<typeof draft>) => {
    dirtyRef.current = true
    setDraft((current) => ({ ...current, ...patch }))
  }

  const lockMutation = useMutation({
    mutationFn: (shot: Shot) => api.lockShot(project.id, shot.id, !shot.locked),
    onSuccess: (_result, shot) => {
      showToast(shot.locked ? t('镜头已解锁', 'Shot unlocked') : t('镜头已锁定，批量生成会跳过', 'Shot locked'))
      onRefresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const versionMutation = useMutation({
    mutationFn: ({ shotId, index }: { shotId: string; index: number }) =>
      api.switchShotVersion(project.id, shotId, index),
    onSuccess: () => {
      showToast(t('已切换到历史版本', 'Switched version'))
      onRefresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const generateMutation = useMutation({
    mutationFn: async (shot: Shot) => {
      if (shot.status === 'completed') {
        return api.regenerateVideo({ projectId: project.id, shotId: shot.id, styleId: project.style || 'none' })
      }
      return api.generateVideo({
        projectId: project.id,
        shotId: shot.id,
        prompt: shot.description,
        duration: shot.duration,
        aspectRatio: aspectRatioOf(project),
        styleId: project.style || 'none',
      })
    },
    onSuccess: (_result, shot) => {
      showToast(t(`镜头 S${String(shot.index + 1).padStart(2, '0')} 生成已启动`, 'Shot generation started'))
      onRefresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const batchMutation = useMutation({
    mutationFn: () => api.generateAllVideos(project.id, { styleId: project.style || 'none' }),
    onSuccess: () => {
      showToast(t(`已启动 ${generatable.length} 个未锁定镜头`, `${generatable.length} shots started`))
      onRefresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const styleMutation = useMutation({
    mutationFn: (style: string) => api.updateProject(project.id, { style }),
    onSuccess: () => {
      showToast(t('视觉风格已更新', 'Style updated'))
      onRefresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const counts = useMemo(
    () => ({
      all: shots.length,
      pending: shots.filter((shot) => shot.status === 'pending').length,
      generating: shots.filter((shot) => shot.status === 'generating').length,
      completed,
      failed: shots.filter((shot) => shot.status === 'failed').length,
    }),
    [shots, completed]
  )

  return (
    <div className="ed-stage-body">
      <div className="ed-shot-toolbar dr-card">
        <div className="ed-filter-group" role="group" aria-label={t('按状态筛选', 'Filter by status')}>
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className="dr-chip"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {t(item.zh, item.en)} {counts[item.id]}
            </button>
          ))}
        </div>

        <div className="ed-shot-toolbar-right">
          <select
            className="dr-select"
            value={project.style || 'none'}
            onChange={(event) => styleMutation.mutate(event.target.value)}
            aria-label={t('视觉风格', 'Visual style')}
          >
            <option value="none">{t('无风格', 'No style')}</option>
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dr-btn"
            onClick={() => setInspectorOpen(true)}
            disabled={!selectedShot}
          >
            {t('检查器', 'Inspector')}
          </button>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            disabled={generatable.length === 0 || batchMutation.isPending}
            onClick={() => batchMutation.mutate()}
          >
            <Icon name="sparkles" size={15} />
            {t(`批量生成（${generatable.length}）`, `Generate ${generatable.length}`)}
          </button>
        </div>
      </div>

      {shots.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 56 }}>
          <div className="dr-state-icon">
            <Icon name="film" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有镜头', 'No shots yet')}</div>
          <div>{t('先在「剧本」生成或手动添加场次，再回到分镜。', 'Generate a script first.')}</div>
        </div>
      ) : (
        <div className="ed-storyboard-layout">
          <div className="ed-shot-grid">
            {filtered.map((shot) => (
              <ShotCard
                key={shot.id}
                shot={shot}
                source={
                  shot.sourceNovelId
                    ? { id: shot.sourceNovelId, title: novelTitle(shot.sourceNovelId) }
                    : null
                }
                selected={selectedShot?.id === shot.id}
                onSelect={() => onSelect(shot.id)}
                onGenerate={() => {
                  if (shot.locked) {
                    showToast(t('该镜头已锁定，请先解锁', 'Shot is locked'), 'error')
                    return
                  }
                  generateMutation.mutate(shot)
                }}
                generating={generateMutation.isPending && generateMutation.variables?.id === shot.id}
              />
            ))}
            {filtered.length === 0 ? (
              <div className="dr-state" style={{ gridColumn: '1 / -1', padding: 32 }}>
                {t('该状态下没有镜头', 'No shots with this status')}
              </div>
            ) : null}
          </div>

          {selectedShot ? (
            <aside className={`ed-inspector${inspectorOpen ? ' is-open' : ''}`} aria-label={t('镜头检查器', 'Shot inspector')}>
              <div className="ed-inspector-head">
                <div>
                  <strong>S{String(selectedShot.index + 1).padStart(2, '0')}</strong>
                  <span className={`dr-status ${statusTone(selectedShot.status)}`} style={{ marginLeft: 8 }}>
                    <span className="dr-dot" />
                    {statusLabel(selectedShot.status, lang)}
                  </span>
                </div>
                <button
                  type="button"
                  className="dr-icon-btn ed-inspector-close"
                  aria-label={t('关闭检查器', 'Close inspector')}
                  onClick={() => setInspectorOpen(false)}
                >
                  <Icon name="close" size={16} />
                </button>
              </div>

              <div className="dr-field">
                <label className="dr-label" htmlFor="shot-description">
                  {t('画面描述', 'Shot description')}
                </label>
                <textarea
                  id="shot-description"
                  className="dr-input"
                  style={{ minHeight: 84, padding: '8px 10px', resize: 'vertical' }}
                  value={draft.description}
                  disabled={selectedShot.locked}
                  onChange={(event) => patchDraft({ description: event.target.value })}
                  onBlur={() => void saveShot()}
                />
              </div>

              {selectedShot.sourceNovelId ? (
                <div className="dr-field">
                  <span className="dr-label">{t('来源', 'Source')}</span>
                  <Link className="ed-shot-source" to={`/novel/${selectedShot.sourceNovelId}?tab=storyboard`}>
                    《{novelTitle(selectedShot.sourceNovelId)}》· {t('分镜板', 'Storyboard')}
                    <Icon name="arrow-right" size={13} />
                  </Link>
                </div>
              ) : null}

              <div className="ed-inspector-grid">
                <div className="dr-field">
                  <label className="dr-label" htmlFor="shot-duration">
                    {t('时长（秒）', 'Duration')}
                  </label>
                  <input
                    id="shot-duration"
                    type="number"
                    min={1}
                    max={30}
                    className="dr-input"
                    value={draft.duration}
                    disabled={selectedShot.locked}
                    onChange={(event) => patchDraft({ duration: Number(event.target.value) || 5 })}
                    onBlur={() => void saveShot()}
                  />
                </div>
                <div className="dr-field">
                  <span className="dr-label">{t('机位 / 运动', 'Camera')}</span>
                  <span className="ed-readonly">
                    {shotTypeLabel(selectedShot.shotType, lang)} · {cameraLabel(selectedShot.cameraMovement, lang)}
                  </span>
                </div>
              </div>

              <div className="dr-field">
                <label className="dr-label" htmlFor="shot-dialogue">
                  {t('对白', 'Dialogue')}
                </label>
                <input
                  id="shot-dialogue"
                  className="dr-input"
                  value={draft.dialogue}
                  disabled={selectedShot.locked}
                  onChange={(event) => patchDraft({ dialogue: event.target.value })}
                  onBlur={() => void saveShot()}
                />
              </div>

              <div className="dr-field">
                <label className="dr-label" htmlFor="shot-narration">
                  {t('旁白', 'Narration')}
                </label>
                <input
                  id="shot-narration"
                  className="dr-input"
                  value={draft.narration}
                  disabled={selectedShot.locked}
                  onChange={(event) => patchDraft({ narration: event.target.value })}
                  onBlur={() => void saveShot()}
                />
              </div>

              {selectedShot.characterIds?.length ? (
                <div className="dr-field">
                  <span className="dr-label">{t('角色', 'Characters')}</span>
                  <div className="dr-tag-row">
                    {selectedShot.characterIds.map((characterId) => {
                      const character = project.characters?.find((item) => item.id === characterId)
                      return (
                        <span className="dr-tag" key={characterId}>
                          {character?.name ?? characterId}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ) : null}

              {selectedShot.errorMessage ? (
                <div className="ed-inspector-error">{selectedShot.errorMessage}</div>
              ) : null}

              <div className="ed-inspector-actions">
                <button
                  type="button"
                  className="dr-btn dr-btn-primary"
                  disabled={selectedShot.locked || generateMutation.isPending}
                  onClick={() => generateMutation.mutate(selectedShot)}
                >
                  <Icon name="sparkles" size={15} />
                  {selectedShot.status === 'completed' ? t('重新生成', 'Regenerate') : t('生成本镜', 'Generate')}
                </button>
                <button
                  type="button"
                  className="dr-btn"
                  onClick={() => lockMutation.mutate(selectedShot)}
                  disabled={lockMutation.isPending}
                >
                  <Icon name={selectedShot.locked ? 'check' : 'shield'} size={15} />
                  {selectedShot.locked ? t('已锁定', 'Locked') : t('锁定', 'Lock')}
                </button>
                {selectedShot.videoUrl ? (
                  <a className="dr-btn" href={selectedShot.videoUrl} target="_blank" rel="noreferrer">
                    <Icon name="play" size={15} />
                    {t('打开视频', 'Open video')}
                  </a>
                ) : null}
              </div>

              {selectedShot.status === 'generating' ? (
                <div className="ed-generating">
                  <div className="ed-indeterminate">
                    <span />
                  </div>
                  <span className="dr-hint">{t('生成中，完成后自动刷新', 'Generating; refreshes automatically')}</span>
                </div>
              ) : null}

              {(selectedShot.versions?.length ?? 0) > 0 ? (
                <div className="dr-field">
                  <span className="dr-label">{t('历史版本', 'Versions')}</span>
                  <div className="dr-tag-row">
                    {selectedShot.versions?.map((version, index) => (
                      <button
                        key={`${version.videoUrl}-${index}`}
                        type="button"
                        className="dr-chip"
                        onClick={() => versionMutation.mutate({ shotId: selectedShot.id, index })}
                      >
                        v{index + 1}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </aside>
          ) : null}
        </div>
      )}

      {inspectorOpen ? (
        <div className="ed-inspector-scrim" onClick={() => setInspectorOpen(false)} aria-hidden="true" />
      ) : null}
    </div>
  )
}

function ShotCard({
  shot,
  source,
  selected,
  onSelect,
  onGenerate,
  generating,
}: {
  shot: Shot
  source: { id: string; title: string } | null
  selected: boolean
  onSelect: () => void
  onGenerate: () => void
  generating: boolean
}) {
  const { t, lang } = useLang()
  return (
    <article className={`ed-shot-card${selected ? ' is-selected' : ''}`}>
      <div
        className="ed-shot-select"
        role="button"
        tabIndex={0}
        onClick={onSelect}
        aria-pressed={selected}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
          }
        }}
      >
        <div className="ed-shot-thumb">
          {shot.videoUrl ? (
            <video src={`${shot.videoUrl}#t=0.1`} preload="metadata" muted playsInline />
          ) : (
            <span className="ed-shot-placeholder">{t('待生成', 'Pending')}</span>
          )}
          {shot.locked ? (
            <span className="ed-shot-lock" title={t('已锁定', 'Locked')}>
              <Icon name="shield" size={13} />
            </span>
          ) : null}
          {shot.status === 'generating' ? (
            <span className="ed-shot-progress">
              <span />
            </span>
          ) : null}
        </div>
        <div className="ed-shot-body">
          <div className="ed-shot-head">
            <span className="ed-shot-no">S{String(shot.index + 1).padStart(2, '0')}</span>
            <span className={`dr-status ${statusTone(shot.status)}`}>
              <span className="dr-dot" />
              {statusLabel(shot.status, lang)}
            </span>
            <span className="ed-shot-duration">{shot.duration}s</span>
          </div>
          <p className="ed-shot-desc">{shot.description || t('未填写画面描述', 'No description')}</p>
          <div className="ed-shot-meta">
            <span>{shotTypeLabel(shot.shotType, lang)}</span>
            <span>{cameraLabel(shot.cameraMovement, lang)}</span>
            {(shot.versions?.length ?? 0) > 0 ? <span>v{(shot.versions?.length ?? 0) + 1}</span> : null}
            {source ? (
              <Link
                className="ed-shot-source"
                to={`/novel/${source.id}?tab=storyboard`}
                onClick={(event) => event.stopPropagation()}
              >
                {t('小说', 'Novel')} · {source.title}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      <div className="ed-shot-actions">
        <button
          type="button"
          className="dr-btn"
          disabled={shot.locked || generating}
          onClick={onGenerate}
        >
          <Icon name="sparkles" size={14} />
          {shot.status === 'completed' ? t('重新生成', 'Regenerate') : t('生成本镜', 'Generate')}
        </button>
      </div>
    </article>
  )
}
