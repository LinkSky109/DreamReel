import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { NOVEL_STAGES, novelStageIndex, novelStageLabel } from '../lib/novel'
import type { NovelDetail } from '../domain/types'
import { Icon } from '../components/Icon'
import { CharactersTab } from '../features/novel/CharactersTab'
import { WorldTab } from '../features/novel/WorldTab'
import { SeriesTab } from '../features/novel/SeriesTab'
import { Modal } from '../components/Modal'
import './NovelDetail.css'

type TabKey = 'stage' | 'source' | 'characters' | 'world' | 'series' | 'episode' | 'art' | 'sync'

const TABS: { key: TabKey; zh: string; en: string; migrated: boolean }[] = [
  { key: 'stage', zh: '阶段', en: 'Stage', migrated: true },
  { key: 'source', zh: '来源', en: 'Source', migrated: true },
  { key: 'characters', zh: '角色', en: 'Characters', migrated: true },
  { key: 'world', zh: '世界观', en: 'World', migrated: true },
  { key: 'series', zh: '分季分集', en: 'Seasons', migrated: true },
  { key: 'episode', zh: '单集', en: 'Episodes', migrated: false },
  { key: 'art', zh: '设定图集', en: 'Art', migrated: false },
  { key: 'sync', zh: '风格/同步', en: 'Style / Sync', migrated: false },
]

export function NovelDetailPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const { t, lang } = useLang()
  const queryClient = useQueryClient()

  const tabParam = params.get('tab') as TabKey | null
  const tab: TabKey = TABS.some((item) => item.key === tabParam) ? (tabParam as TabKey) : 'stage'
  const tabMeta = TABS.find((item) => item.key === tab)

  const novelQuery = useQuery({
    queryKey: ['novel', id],
    queryFn: () => api.getNovel(id),
    enabled: Boolean(id),
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['novel', id] })
    queryClient.invalidateQueries({ queryKey: ['novels'] })
  }

  const setTab = (key: TabKey) => {
    const next = new URLSearchParams(params)
    if (key === 'stage') next.delete('tab')
    else next.set('tab', key)
    setParams(next, { replace: true })
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

  return (
    <div className="dr-page dr-novel-detail">
      <Link className="dr-novel-back" to="/novels">
        <Icon name="arrow-left" size={14} />
        {t('返回列表', 'Back to list')}
      </Link>

      <div className="dr-novel-head">
        <div>
          <h1 className="dr-page-title">{novel.title}</h1>
          <p className="dr-page-sub">
            {novel.author || '-'} · {novel.category || '-'} ·{' '}
            {t('阶段', 'Stage')} <strong>{novelStageLabel(novel.stage, lang)}</strong> ·{' '}
            {t('章', 'Ch')} {novel.counts?.chapters ?? 0} · {t('角色', 'Char')}{' '}
            {novel.counts?.characters ?? 0} · {t('集', 'Ep')} {novel.counts?.episodes ?? 0}
          </p>
        </div>
      </div>

      <div className="dr-novel-tabs" role="tablist" aria-label={t('小说制作阶段', 'Novel workspace tabs')}>
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`dr-novel-tab ${tab === item.key ? 'is-active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {lang === 'en' ? item.en : item.zh}
            {!item.migrated ? <span className="dr-novel-tab-dot" aria-hidden="true" /> : null}
          </button>
        ))}
      </div>

      {tab === 'stage' ? <StageTab novel={novel} onAdvanced={invalidate} /> : null}
      {tab === 'source' ? <SourceTab novel={novel} onIngested={invalidate} /> : null}
      {tab === 'characters' ? <CharactersTab novel={novel} onChanged={invalidate} /> : null}
      {tab === 'world' ? <WorldTab novel={novel} onChanged={invalidate} /> : null}
      {tab === 'series' ? <SeriesTab novel={novel} onChanged={invalidate} /> : null}
      {tabMeta && !tabMeta.migrated ? <LegacyTab novelId={id} tab={tab} label={lang === 'en' ? tabMeta.en : tabMeta.zh} /> : null}
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

function LegacyTab({ novelId, tab, label }: { novelId: string; tab: string; label: string }) {
  const { t } = useLang()
  return (
    <section className="dr-card dr-state dr-novel-legacy">
      <Icon name="info" size={22} />
      <h2>{t(`「${label}」仍在旧版制作台`, `${label} is still in the legacy workspace`)}</h2>
      <p>
        {t(
          '该模块尚未迁移到新版界面。打开旧版后会自动定位到对应标签，数据完全一致。',
          'This module is not migrated yet. The legacy workspace opens on the same tab with identical data.'
        )}
      </p>
      <Link className="dr-btn dr-btn-primary" to={`/novel-legacy/${novelId}?tab=${tab}`}>
        <Icon name="arrow-left" size={14} />
        {t('在旧版打开此模块', 'Open in legacy workspace')}
      </Link>
    </section>
  )
}
