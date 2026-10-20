import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { NOVEL_STAGES, novelStageIndex, novelStageLabel } from '../lib/novel'
import type { NovelChunk, NovelDetail } from '../domain/types'
import { Icon } from '../components/Icon'
import { CharactersTab } from '../features/novel/CharactersTab'
import { WorldTab } from '../features/novel/WorldTab'
import { SeriesTab } from '../features/novel/SeriesTab'
import { EpisodeTab } from '../features/novel/EpisodeTab'
import { ArtTab } from '../features/novel/ArtTab'
import { SyncTab } from '../features/novel/SyncTab'
import { Modal } from '../components/Modal'
import './NovelDetail.css'

type TabKey = 'stage' | 'source' | 'characters' | 'world' | 'series' | 'episode' | 'art' | 'sync'

const TABS: { key: TabKey; zh: string; en: string }[] = [
  { key: 'stage', zh: '阶段', en: 'Stage' },
  { key: 'source', zh: '来源', en: 'Source' },
  { key: 'characters', zh: '角色', en: 'Characters' },
  { key: 'world', zh: '世界观', en: 'World' },
  { key: 'series', zh: '分季分集', en: 'Seasons' },
  { key: 'episode', zh: '单集', en: 'Episodes' },
  { key: 'art', zh: '设定图集', en: 'Art' },
  { key: 'sync', zh: '风格/同步', en: 'Style / Sync' },
]

export function NovelDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { t, lang } = useLang()
  const queryClient = useQueryClient()
  const [chapterOpen, setChapterOpen] = useState<NovelChunk | null>(null)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null)

  const tabParam = params.get('tab') as TabKey | null
  const tab: TabKey = TABS.some((item) => item.key === tabParam) ? (tabParam as TabKey) : 'stage'

  const novelQuery = useQuery({
    queryKey: ['novel', id],
    queryFn: () => api.getNovel(id),
    enabled: Boolean(id),
  })
  const charactersQuery = useQuery({
    queryKey: ['novel-characters', id, 'rail'],
    queryFn: () => api.listNovelCharacters(id),
    enabled: Boolean(id),
  })
  const entitiesQuery = useQuery({
    queryKey: ['novel-world-entities', id],
    queryFn: () => api.listNovelWorldEntities(id),
    enabled: Boolean(id),
  })
  const chunksQuery = useQuery({
    queryKey: ['novel-chunks', id],
    queryFn: () => api.getNovelChunks(id, true),
    enabled: Boolean(id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['novel', id] })
    queryClient.invalidateQueries({ queryKey: ['novel-characters', id] })
    queryClient.invalidateQueries({ queryKey: ['novel-world-entities', id] })
    queryClient.invalidateQueries({ queryKey: ['novels'] })
  }

  const openChapter = async (chunk: NovelChunk) => {
    if (chunk.text) {
      setChapterOpen(chunk)
      return
    }
    try {
      const full = await api.getNovelChunk(id, chunk.id)
      setChapterOpen(full)
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const markMutation = useMutation({
    mutationFn: ({ chapter, para }: { chapter: number; para: number }) => api.toggleNovelMark(id, chapter, para),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['novel', id] }),
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const confirmAll = useMutation({
    mutationFn: () => api.confirmAllNovelReview(id),
    onSuccess: (result) => {
      showToast(t(`已确认 ${result.characters} 个角色、${result.entities} 个世界观实体`, `Confirmed ${result.characters} characters and ${result.entities} entities`), 'success')
      invalidate()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(params)
    if (key === 'stage') next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
    setInspectorOpen(false)
  }

  if (novelQuery.isLoading) {
    return (
      <div className="dr-page">
        <div className="dr-skeleton" style={{ height: 120, marginBottom: 14 }} />
        <div className="dr-skeleton" style={{ height: 260 }} />
      </div>
    )
  }

  if (novelQuery.isError || !novelQuery.data) {
    return (
      <div className="dr-page">
        <div className="dr-card dr-state">
          <h2>{t('小说不存在或加载失败', 'Novel not found')}</h2>
          <p>{(novelQuery.error as Error | null)?.message}</p>
          <Link className="dr-btn" to="/novels">
            {t('返回小说列表', 'Back to novels')}
          </Link>
        </div>
      </div>
    )
  }

  const novel = novelQuery.data
  const characters = charactersQuery.data ?? []
  const entities = entitiesQuery.data ?? []
  const chunks = chunksQuery.data ?? []
  const currentIndex = novelStageIndex(novel.stage)
  const progress = Math.round(((currentIndex + 1) / NOVEL_STAGES.length) * 100)
  const approved = novel.reviewStats?.approved ?? characters.filter((item) => item.status === 'approved').length
  const marks = novel.marks ?? []
  const selectedCharacter = characters.find((item) => item.id === selectedCharacterId) ?? null
  const selectedEntity = entities.find((item) => item.id === selectedEntityId) ?? null

  const saveReview = async (status: string, note: string) => {
    if (selectedCharacter) {
      await api.reviewNovelCharacter(id, selectedCharacter.id, {
        status: status as 'pending' | 'approved' | 'revision',
        note,
      })
    } else if (selectedEntity) {
      await api.reviewNovelWorldEntity(id, selectedEntity.id, {
        status: status as 'pending' | 'confirmed' | 'revision',
        note,
      })
    }
    invalidate()
  }
  const tabMeta = TABS.find((item) => item.key === tab) ?? TABS[0]
  const nextTab: TabKey =
    tab === 'stage' || tab === 'source'
      ? 'characters'
      : tab === 'characters'
        ? 'world'
        : tab === 'world'
          ? 'series'
          : tab === 'series'
            ? 'episode'
            : tab === 'episode'
              ? 'art'
              : tab === 'art'
                ? 'sync'
                : 'stage'
  const descriptions: Record<TabKey, { zh: string; en: string }> = {
    stage: { zh: '推进阶段并锁定已完成部分。', en: 'Advance stages and lock completed work.' },
    source: { zh: '导入链接或正文，清洗分章。', en: 'Import a URL or text and split chapters.' },
    characters: { zh: '从全书抽取角色卡，审校并选定备选。', en: 'Extract, review and select character cards.' },
    world: { zh: '整理世界规则、势力、事件与关系。', en: 'Organize rules, factions, events and relations.' },
    series: { zh: '把章节规划成季与集。', en: 'Plan chapters into seasons and episodes.' },
    episode: { zh: '生成剧本、资产与成片。', en: 'Generate scripts, assets and final cuts.' },
    art: { zh: '为图生视频准备成套设定图。', en: 'Prepare reference art for image-to-video.' },
    sync: { zh: '统一风格，打包并同步产物。', en: 'Set style, package and sync deliverables.' },
  }

  return (
    <div className="dr-page novel-workbench">
      <div className="nv-top">
        <div className="nv-top-main">
          <Link className="nv-back" to="/novels" aria-label={t('返回小说剧场', 'Back to novels')}>
            <Icon name="arrow-left" size={15} />
          </Link>
          <div>
            <h1>{novel.title}</h1>
            <div className="nv-top-meta">
              <span>{novel.author || t('佚名', 'Unknown')}</span>
              <span className="sep">·</span>
              <span>{novel.category || t('小说改编', 'Novel adaptation')}</span>
              <span className="sep">·</span>
              <span>{novel.counts?.chapters ?? chunks.length} {t('章', 'ch')}</span>
              <span className="sep">·</span>
              <span>{characters.length} {t('角色', 'chars')}</span>
              <span className="sep">·</span>
              <span>{novel.counts?.episodes ?? 0} {t('集', 'eps')}</span>
              <span className={`nv-status-pill is-${novel.stage === 'compose' ? 'completed' : 'progress'}`}>
                {novelStageLabel(novel.stage, lang)}
              </span>
            </div>
          </div>
        </div>
        <div className="nv-top-actions">
          <button className="dr-btn nv-inspector-toggle" type="button" onClick={() => setInspectorOpen(true)}>
            <Icon name="sliders" size={14} />
            {t('概览', 'Overview')}
          </button>
          <button className="dr-btn" type="button" onClick={() => setTab('characters')}>
            <Icon name="refresh" size={14} />
            {t('重新抽取', 'Re-extract')}
          </button>
          <button className="dr-btn dr-btn-primary" type="button" onClick={() => setTab('episode')}>
            <Icon name="film" size={14} />
            {t('进入制作', 'Produce')}
          </button>
        </div>
      </div>

      <div className="nv-summary">
        <div className="nv-summary-cell">
          <div className="nv-summary-value">{novel.counts?.chapters ?? chunks.length}</div>
          <div className="nv-summary-label">{t('章节', 'Chapters')}</div>
        </div>
        <div className="nv-summary-cell">
          <div className="nv-summary-value">{characters.length}</div>
          <div className="nv-summary-label">{t('角色卡', 'Characters')}</div>
        </div>
        <div className="nv-summary-cell">
          <div className="nv-summary-value">{entities.length}</div>
          <div className="nv-summary-label">{t('世界观实体', 'World entities')}</div>
        </div>
        <div className="nv-summary-cell">
          <div className="nv-summary-value">{progress}%</div>
          <div className="nv-summary-label">
            {t('已确认', 'Approved')} {approved}/{characters.length}
          </div>
        </div>
      </div>

      <div className="nv-layout">
        <aside className="nv-rail" aria-label={t('小说目录', 'Novel navigation')}>
          <div className="nv-rail-group">
            <div className="nv-rail-title">
              <span>{t('制作流程', 'Production')}</span>
              <span>{TABS.length}</span>
            </div>
            {TABS.map((item, index) => {
              const stageForTab = index < NOVEL_STAGES.length ? NOVEL_STAGES[index] : null
              const state = stageForTab
                ? novelStageIndex(novel.stage) > novelStageIndex(stageForTab)
                  ? 'done'
                  : novelStageIndex(novel.stage) === novelStageIndex(stageForTab)
                    ? 'current'
                    : 'todo'
                : 'todo'
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`nv-rail-item ${tab === item.key ? 'is-active' : ''}`}
                  aria-current={tab === item.key}
                  onClick={() => setTab(item.key)}
                >
                  <span className="nv-rail-no">{String(index + 1).padStart(2, '0')}</span>
                  <span className="nv-rail-name">{lang === 'en' ? item.en : item.zh}</span>
                  <span className={`nv-rail-state is-${state}`} />
                </button>
              )
            })}
          </div>

          <div className="nv-rail-group">
            <div className="nv-rail-title">
              <span>{t('章节', 'Chapters')}</span>
              <span>{chunks.length}</span>
            </div>
            {chunks.slice(0, 8).map((chunk) => {
              const markedCount = marks.filter((mark) => mark.chapter === chunk.index).length
              return (
                <button key={chunk.id} type="button" className="nv-rail-item" onClick={() => void openChapter(chunk)}>
                  <span className="nv-rail-no">{String(chunk.index + 1).padStart(2, '0')}</span>
                  <span className="nv-rail-name">{chunk.chapterTitle || t('未命名章节', 'Untitled')}</span>
                  {markedCount ? <span className="nv-rail-badge">{markedCount}</span> : null}
                </button>
              )
            })}
            {chunks.length === 0 ? (
              <button type="button" className="nv-rail-item" onClick={() => setTab('source')}>
                <span className="nv-rail-no">＋</span>
                <span className="nv-rail-name">{t('导入正文', 'Import text')}</span>
              </button>
            ) : null}
            {chunks.length > 8 ? (
              <button type="button" className="nv-rail-item" onClick={() => setTab('source')}>
                <span className="nv-rail-no">…</span>
                <span className="nv-rail-name">{t(`其余 ${chunks.length - 8} 章`, `${chunks.length - 8} more`)}</span>
              </button>
            ) : null}
          </div>

          <div className="nv-rail-group">
            <div className="nv-rail-title">
              <span>{t('角色卡', 'Characters')}</span>
              <span>{characters.length}</span>
            </div>
            {characters.slice(0, 6).map((character) => (
              <button
                key={character.id}
                type="button"
                className={`nv-rail-item ${selectedCharacterId === character.id ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedCharacterId(character.id)
                  setSelectedEntityId(null)
                  setTab('characters')
                  setInspectorOpen(true)
                }}
              >
                <span className="nv-rail-avatar">{character.name.slice(0, 1)}</span>
                <span className="nv-rail-name">{character.name}</span>
                <span
                  className={`nv-rail-state is-${
                    character.status === 'approved' ? 'done' : character.status === 'revision' ? 'revision' : 'todo'
                  }`}
                />
              </button>
            ))}
            {characters.length === 0 ? (
              <button type="button" className="nv-rail-item" onClick={() => setTab('characters')}>
                <span className="nv-rail-no">＋</span>
                <span className="nv-rail-name">{t('生成角色', 'Extract characters')}</span>
              </button>
            ) : null}
          </div>

          <div className="nv-rail-group">
            <div className="nv-rail-title">
              <span>{t('世界观', 'World')}</span>
              <span>{entities.length}</span>
            </div>
            {entities.slice(0, 6).map((entity) => (
              <button
                key={entity.id}
                type="button"
                className={`nv-rail-item ${selectedEntityId === entity.id ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedEntityId(entity.id)
                  setSelectedCharacterId(null)
                  setTab('world')
                  setInspectorOpen(true)
                }}
              >
                <span className="nv-rail-no">◇</span>
                <span className="nv-rail-name">{entity.name}</span>
                <span
                  className={`nv-rail-state is-${
                    entity.status === 'confirmed' ? 'done' : entity.status === 'revision' ? 'revision' : 'todo'
                  }`}
                />
              </button>
            ))}
            {entities.length === 0 ? (
              <button type="button" className="nv-rail-item" onClick={() => setTab('world')}>
                <span className="nv-rail-no">＋</span>
                <span className="nv-rail-name">{t('抽取世界观', 'Extract world')}</span>
              </button>
            ) : null}
          </div>
        </aside>

        <section className="nv-main" aria-live="polite">
          <div className="nv-main-head">
            <div>
              <p className="nv-eyebrow">{novelStageLabel(novel.stage, lang)}</p>
              <h2>{lang === 'en' ? tabMeta.en : tabMeta.zh}</h2>
              <p>{t(descriptions[tab].zh, descriptions[tab].en)}</p>
            </div>
            <button className="dr-btn" type="button" onClick={() => setTab(nextTab)}>
              {t('下一步', 'Next')}
              <Icon name="arrow-right" size={14} />
            </button>
          </div>

          {tab === 'stage' ? <StageTab novel={novel} onAdvanced={invalidate} /> : null}
          {tab === 'source' ? <SourceTab novel={novel} onIngested={invalidate} /> : null}
          {tab === 'characters' ? <CharactersTab novel={novel} onChanged={invalidate} /> : null}
          {tab === 'world' ? <WorldTab novel={novel} onChanged={invalidate} /> : null}
          {tab === 'series' ? <SeriesTab novel={novel} onChanged={invalidate} /> : null}
          {tab === 'episode' ? <EpisodeTab novel={novel} onChanged={invalidate} /> : null}
          {tab === 'art' ? <ArtTab novel={novel} onChanged={invalidate} /> : null}
          {tab === 'sync' ? <SyncTab novel={novel} onChanged={invalidate} /> : null}
        </section>

        <aside className={`nv-inspector ${inspectorOpen ? 'is-open' : ''}`} aria-label={t('审校检查器', 'Review inspector')}>
          {selectedCharacter ? (
            <ReviewInspector
              key={selectedCharacter.id}
              kind="character"
              name={selectedCharacter.name}
              status={selectedCharacter.status}
              note={selectedCharacter.note ?? ''}
              onSave={saveReview}
              onConfirmAll={() => confirmAll.mutate()}
              onClose={() => {
                setSelectedCharacterId(null)
                setInspectorOpen(false)
              }}
            />
          ) : selectedEntity ? (
            <ReviewInspector
              key={selectedEntity.id}
              kind="world"
              name={selectedEntity.name}
              status={selectedEntity.status ?? 'pending'}
              note={selectedEntity.note ?? ''}
              onSave={saveReview}
              onConfirmAll={() => confirmAll.mutate()}
              onClose={() => {
                setSelectedEntityId(null)
                setInspectorOpen(false)
              }}
            />
          ) : (
            <>
              <div className="nv-inspector-head">
                <div>
                  <p className="nv-eyebrow">{t('制作概览', 'Overview')}</p>
                  <h2>{novelStageLabel(novel.stage, lang)}</h2>
                </div>
                <button className="dr-icon-btn nv-inspector-close" type="button" aria-label={t('关闭概览', 'Close overview')} onClick={() => setInspectorOpen(false)}>
                  <Icon name="close" size={15} />
                </button>
              </div>
              <div className="nv-inspector-body">
                <div className="nv-progress-block">
                  <div className="nv-progress-row">
                    <span>{t('总进度', 'Overall progress')}</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="nv-progress-track">
                    <span style={{ width: `${progress}%` }} />
                  </div>
                </div>
                <dl className="nv-inspector-list">
                  <div><dt>{t('章节', 'Chapters')}</dt><dd>{novel.counts?.chapters ?? chunks.length}</dd></div>
                  <div><dt>{t('段落标记', 'Paragraph marks')}</dt><dd>{marks.length}</dd></div>
                  <div><dt>{t('角色卡', 'Characters')}</dt><dd>{characters.length}</dd></div>
                  <div><dt>{t('已确认', 'Approved')}</dt><dd>{approved}</dd></div>
                  <div><dt>{t('世界观', 'World')}</dt><dd>{entities.length}</dd></div>
                  <div><dt>{t('季 / 集', 'Seasons / eps')}</dt><dd>{novel.counts?.seasons ?? 0} / {novel.counts?.episodes ?? 0}</dd></div>
                </dl>
                <button className="dr-btn" type="button" disabled={confirmAll.isPending} onClick={() => confirmAll.mutate()}>
                  {confirmAll.isPending ? t('确认中…', 'Confirming…') : t('全部确认', 'Confirm all')}
                </button>
                <div className="nv-inspector-next">
                  <span>{t('下一步', 'Next step')}</span>
                  <strong>{lang === 'en' ? TABS.find((item) => item.key === nextTab)?.en : TABS.find((item) => item.key === nextTab)?.zh}</strong>
                  <button className="dr-btn dr-btn-primary" type="button" onClick={() => setTab(nextTab)}>
                    {t('继续', 'Continue')}
                  </button>
                </div>
                <div className="nv-inspector-links">
                  <button type="button" onClick={() => setTab('characters')}>{t('审校角色', 'Review characters')}</button>
                  <button type="button" onClick={() => setTab('world')}>{t('审校世界观', 'Review world')}</button>
                  <button type="button" onClick={() => setTab('series')}>{t('分季分集', 'Seasons')}</button>
                  <button type="button" onClick={() => setTab('episode')}>{t('单集制作', 'Episodes')}</button>
                  <button type="button" onClick={() => setTab('sync')}>{t('风格与同步', 'Style & sync')}</button>
                </div>
              </div>
            </>
          )}
        </aside>
        <button className={`nv-inspector-scrim ${inspectorOpen ? 'is-open' : ''}`} type="button" aria-label={t('关闭概览', 'Close overview')} onClick={() => setInspectorOpen(false)} />
      </div>

      <Modal
        open={Boolean(chapterOpen)}
        title={chapterOpen?.chapterTitle || t('章节', 'Chapter')}
        onClose={() => setChapterOpen(null)}
        width={720}
        footer={
          <button className="dr-btn" type="button" onClick={() => setChapterOpen(null)}>
            {t('关闭', 'Close')}
          </button>
        }
      >
        <div className="nv-reader">
          <p className="nv-reader-meta">
            CHAPTER {String((chapterOpen?.index ?? 0) + 1).padStart(2, '0')} · {novel.title}
          </p>
          <p className="nv-reader-hint">
            {t('点击段落标记为分镜素材；再次点击取消。', 'Click a paragraph to mark it as storyboard material.')}
          </p>
          {(chapterOpen?.text ?? '').split(/\n+/).filter(Boolean).map((paragraph, index) => {
            const marked = marks.some((mark) => mark.chapter === (chapterOpen?.index ?? 0) && mark.para === index)
            return (
              <button
                key={index}
                type="button"
                className={`nv-reader-para ${marked ? 'is-marked' : ''}`}
                aria-pressed={marked}
                onClick={() => markMutation.mutate({ chapter: chapterOpen?.index ?? 0, para: index })}
              >
                {paragraph}
              </button>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

function StageTab({
  novel,
  onAdvanced,
}: {
  novel: NovelDetail
  onAdvanced: () => void
}) {
  const { t, lang } = useLang()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const current = novelStageIndex(novel.stage)
  const next = NOVEL_STAGES[Math.min(current + 1, NOVEL_STAGES.length - 1)]
  const atEnd = current >= NOVEL_STAGES.length - 1

  const advance = useMutation({
    mutationFn: () => api.advanceNovel(novel.id),
    onSuccess: () => {
      showToast(t('已推进阶段', 'Stage advanced'), 'success')
      setConfirmOpen(false)
      onAdvanced()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <>
      <section className="dr-card dr-novel-stage">
        <h2>{t('阶段进度', 'Stage progress')}</h2>
        <ol className="dr-stage-list">
          {NOVEL_STAGES.map((stage, index) => {
            const state = index < current ? 'done' : index === current ? 'active' : 'todo'
            return (
              <li key={stage} className={`dr-stage-pill is-${state}`}>
                <span className="dr-stage-index">{index + 1}</span>
                {novelStageLabel(stage, lang)}
                {state === 'done' ? <Icon name="check" size={13} /> : null}
              </li>
            )
          })}
        </ol>
        <p className="dr-novel-note">
          {t(
            '进入下一阶段后，之前的阶段将锁定不可修改。角色设定卡 / 世界观设定集可先多次生成备选，选定后再推进。',
            'Advancing locks earlier stages. Generate multiple candidate sets first, select one, then advance.'
          )}
        </p>
        <button
          className="dr-btn dr-btn-primary"
          type="button"
          disabled={atEnd || advance.isPending}
          onClick={() => setConfirmOpen(true)}
        >
          {atEnd
            ? t('已完成全部阶段', 'All stages complete')
            : t(`推进到下一阶段（${novelStageLabel(next, 'zh')}）`, `Advance to ${novelStageLabel(next, 'en')}`)}
        </button>
      </section>

      <Modal
        open={confirmOpen}
        title={t('推进阶段', 'Advance stage')}
        onClose={() => (!advance.isPending ? setConfirmOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setConfirmOpen(false)} disabled={advance.isPending}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={advance.isPending}
              onClick={() => advance.mutate()}
            >
              {advance.isPending ? t('推进中…', 'Advancing…') : t('确认推进', 'Advance')}
            </button>
          </>
        }
      >
        <p className="dr-modal-text">
          {t(
            `推进到「${novelStageLabel(next, 'zh')}」后，「${novelStageLabel(novel.stage, 'zh')}」及更早阶段将锁定，确定继续？`,
            `Advance to "${novelStageLabel(next, 'en')}"? Earlier stages will be locked.`
          )}
        </p>
      </Modal>
    </>
  )
}

function SourceTab({ novel, onIngested }: { novel: NovelDetail; onIngested: () => void }) {
  const { t } = useLang()
  const [url, setUrl] = useState(novel.sourceRef ?? '')
  const [text, setText] = useState('')
  const locked = novelStageIndex(novel.stage) > novelStageIndex('source')

  useEffect(() => {
    setUrl(novel.sourceRef ?? '')
  }, [novel.sourceRef])

  const ingest = useMutation({
    mutationFn: () => {
      if (url.trim()) return api.ingestNovel(novel.id, { sourceType: 'qishuxia-txt', url: url.trim() })
      return api.ingestNovel(novel.id, { sourceType: 'text', text })
    },
    onSuccess: (result) => {
      const chapters = result.chapters ?? result.chunks ?? 0
      showToast(t(`摄取完成，共 ${chapters} 章`, `Ingested ${chapters} chapters`), 'success')
      onIngested()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const submit = () => {
    if (!url.trim() && !text.trim()) {
      showToast(t('请填写书籍链接或粘贴文本', 'Enter a URL or paste text'), 'error')
      return
    }
    ingest.mutate()
  }

  return (
    <section className="dr-card dr-novel-source">
      <div className="dr-novel-source-head">
        <h2>
          {t('来源', 'Source')}
          {locked ? <span className="dr-novel-locked">{t('已锁定', 'Locked')}</span> : null}
        </h2>
        <span className="dr-novel-chapters">
          {t('已摄取', 'Ingested')} {novel.counts?.chapters ?? 0} {t('章', 'chapters')}
        </span>
      </div>

      <label className="dr-field">
        <span>{t('书籍链接（TXT 下载，只下载一次）', 'Book URL (downloaded once)')}</span>
        <input
          className="dr-input"
          value={url}
          disabled={locked}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://www.qishuxia.com/book/..."
          inputMode="url"
        />
      </label>

      <label className="dr-field">
        <span>{t('或粘贴小说文本', 'Or paste novel text')}</span>
        <textarea
          className="dr-input dr-novel-textarea"
          rows={5}
          value={text}
          disabled={locked}
          onChange={(event) => setText(event.target.value)}
          placeholder={t('粘贴正文后摄取，会按章节标题清洗分章', 'Paste text; chapters are split by headings')}
        />
      </label>

      <div className="dr-novel-source-actions">
        <button
          className="dr-btn dr-btn-primary"
          type="button"
          disabled={locked || ingest.isPending}
          onClick={submit}
        >
          {ingest.isPending ? t('摄取中…', 'Ingesting…') : t('摄取（TXT/文本）', 'Ingest (TXT / text)')}
        </button>
        <span className="dr-novel-note">
          {t('清洗后文本为准；已摄取的章节会用于后续抽取。', 'Cleaned text is authoritative; ingested chapters feed extraction.')}
        </span>
      </div>
    </section>
  )
}

function ReviewInspector({
  kind,
  name,
  status,
  note,
  onSave,
  onConfirmAll,
  onClose,
}: {
  kind: 'character' | 'world'
  name: string
  status: string
  note: string
  onSave: (status: string, note: string) => Promise<void>
  onConfirmAll: () => void
  onClose: () => void
}) {
  const { t } = useLang()
  const [draft, setDraft] = useState(note)
  const [busy, setBusy] = useState(false)
  const options =
    kind === 'character'
      ? [
          { key: 'pending', label: t('待审', 'Pending') },
          { key: 'approved', label: t('已确认', 'Approved') },
          { key: 'revision', label: t('需修订', 'Revision') },
        ]
      : [
          { key: 'pending', label: t('待审', 'Pending') },
          { key: 'confirmed', label: t('已确认', 'Confirmed') },
          { key: 'revision', label: t('需修订', 'Revision') },
        ]

  const save = async (nextStatus = status) => {
    setBusy(true)
    try {
      await onSave(nextStatus, draft)
      showToast(t('审校状态已保存', 'Review saved'), 'success')
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="nv-inspector-head">
        <div>
          <p className="nv-eyebrow">{t('审校检查器', 'Review inspector')}</p>
          <h2>{name}</h2>
        </div>
        <button className="dr-icon-btn nv-inspector-close" type="button" aria-label={t('关闭审校', 'Close review')} onClick={onClose}>
          <Icon name="close" size={15} />
        </button>
      </div>
      <div className="nv-inspector-body">
        <div className="nv-review-states">
          {options.map((option) => (
            <button
              key={option.key}
              type="button"
              className={`nv-review-state is-${option.key} ${status === option.key ? 'is-active' : ''}`}
              aria-pressed={status === option.key}
              disabled={busy}
              onClick={() => save(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <dl className="nv-inspector-list">
          <div><dt>{t('类型', 'Type')}</dt><dd>{kind === 'character' ? t('角色卡', 'Character') : t('世界观实体', 'World entity')}</dd></div>
          <div><dt>{t('当前状态', 'Status')}</dt><dd>{options.find((option) => option.key === status)?.label ?? status}</dd></div>
        </dl>
        <label className="dr-field">
          <span>{t('审校备注', 'Review note')}</span>
          <textarea
            className="dr-input nv-review-note"
            rows={4}
            placeholder={t('记录需要回原文核对的地方…', 'Notes to verify against the source…')}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button className="dr-btn dr-btn-primary" type="button" disabled={busy} onClick={() => save()}>
          {busy ? t('保存中…', 'Saving…') : t('保存备注', 'Save note')}
        </button>
        <button className="dr-btn" type="button" disabled={busy} onClick={onConfirmAll}>
          {t('全部确认', 'Confirm all')}
        </button>
        <button className="dr-btn" type="button" onClick={onClose}>
          {t('返回概览', 'Back to overview')}
        </button>
      </div>
    </>
  )
}
