import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import { formatValue } from '../../lib/format'
import { novelStageIndex } from '../../lib/novel'
import type {
  NovelDetail,
  NovelSchema,
  NovelWorldEntity,
  NovelWorldRelation,
  NovelWorldSet,
  NovelWorldSummary,
} from '../../domain/types'
import { Icon } from '../../components/Icon'
import { ExtractStatus, hasActiveJobs } from './ExtractStatus'
import './WorldTab.css'
import './WorldTab.css'

type WorldData = {
  summary: NovelWorldSummary
  entities: NovelWorldEntity[]
  relations: NovelWorldRelation[]
  sets: NovelWorldSet[]
  schema: NovelSchema | null
}

export function WorldTab({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void }) {
  const { t, lang } = useLang()
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState<'llm' | 'heuristic'>('llm')
  const [typeFilter, setTypeFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const locked = novelStageIndex(novel.stage) > novelStageIndex('world')

  const dataQuery = useQuery({
    queryKey: ['novel-world', novel.id],
    queryFn: async (): Promise<WorldData> => {
      const [summary, entities, relations, sets, schema] = await Promise.all([
        api.getNovelWorld(novel.id),
        api.listNovelWorldEntities(novel.id),
        api.listNovelWorldRelations(novel.id).catch(() => []),
        api.listNovelWorldSets(novel.id).catch(() => []),
        api.getNovelSchema(novel.id).catch(() => null),
      ])
      return { summary, entities, relations, sets, schema }
    },
  })

  const statusQuery = useQuery({
    queryKey: ['novel-extract-status', novel.id],
    queryFn: () => api.getNovelExtractStatus(novel.id).catch(() => ({})),
    refetchInterval: (query) => (hasActiveJobs(query.state.data) ? 2000 : false),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['novel-world', novel.id] })
    queryClient.invalidateQueries({ queryKey: ['novel-extract-status', novel.id] })
    onChanged()
  }

  const extract = useMutation({
    mutationFn: () => api.extractNovelWorld(novel.id, { provider }),
    onSuccess: (result) => {
      if (result.degraded) {
        showToast(t('LLM 调用失败，已回退启发式：结果可能为空/粗糙，请检查「模型」是否可用', 'LLM failed; heuristic fallback may be rough.'), 'error')
      } else {
        showToast(t(`已生成世界观备选：${result.entities} 个实体`, `Generated ${result.entities} world entities`), 'success')
      }
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const bulkReview = useMutation({
    mutationFn: (status: 'pending' | 'confirmed' | 'revision') =>
      api.bulkReviewNovel(novel.id, { kind: 'world', ids: [...selected], status }),
    onSuccess: (result) => {
      showToast(t(`已更新 ${result.updated} 个世界观实体`, `Updated ${result.updated} entities`), 'success')
      setSelected(new Set())
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const selectSet = useMutation({
    mutationFn: (setId: string) => api.selectNovelWorldSet(novel.id, setId),
    onSuccess: () => {
      showToast(t('已切换备选', 'Candidate set selected'), 'success')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const data = dataQuery.data
  const summary = data?.summary
  const entities = data?.entities ?? []
  const relations = data?.relations ?? []
  const sets = data?.sets ?? []
  const schema = data?.schema

  const typeLabels = useMemo(() => {
    const fromSchema = Object.fromEntries((schema?.world?.types ?? []).map((item) => [item.key, item.label]))
    const fallback: Record<string, { zh: string; en: string }> = {
      world: { zh: '世界规则', en: 'World rules' },
      power: { zh: '力量体系', en: 'Power system' },
      rule: { zh: '律法与禁忌', en: 'Laws & taboos' },
      race: { zh: '种族物种', en: 'Races & species' },
      faction: { zh: '势力组织', en: 'Factions' },
      event: { zh: '重大事件', en: 'Major events' },
      item: { zh: '装备宝物', en: 'Artifacts' },
      location: { zh: '地域风貌', en: 'Geography' },
      culture: { zh: '文化风俗', en: 'Culture & customs' },
      prophecy: { zh: '预言传说', en: 'Prophecy & legends' },
      conflict: { zh: '冲突体系', en: 'Conflicts' },
      civilization: { zh: '文明体系', en: 'Civilizations' },
      narrative: { zh: '叙事特色', en: 'Narrative style' },
      other: { zh: '其他', en: 'Other' },
    }
    const localized = Object.fromEntries(
      Object.entries(fallback).map(([key, value]) => [key, lang === 'en' ? value.en : value.zh])
    )
    return { ...localized, ...fromSchema }
  }, [schema, lang])

  const attrLabels = schema?.world?.attributes ?? {}
  const filtered = entities.filter((entity) => {
    const term = query.trim().toLowerCase()
    const matchesType = typeFilter === 'all' || entity.type === typeFilter
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'confirmed' ? (entity.status ?? 'pending') === 'confirmed' : (entity.status ?? 'pending') === statusFilter)
    const matchesQuery =
      !term ||
      entity.name.toLowerCase().includes(term) ||
      (entity.aliases ?? []).some((alias) => alias.toLowerCase().includes(term)) ||
      (entity.description ?? '').toLowerCase().includes(term)
    return matchesType && matchesStatus && matchesQuery
  })
  const PAGE_SIZE = 30
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const typeKeys = Object.keys(typeLabels).filter((key) => (summary?.byType?.[key] ?? 0) > 0)
  const busy = extract.isPending

  return (
    <>
      <section className="dr-card dr-world-head">
        <div className="dr-world-title">
          <h2>
            {t('世界观', 'World')}
            {locked ? <span className="dr-novel-locked">{t('已锁定', 'Locked')}</span> : null}
          </h2>
          <div className="dr-world-controls">
            <label className="dr-inline-field">
              <span>{t('引擎', 'Engine')}</span>
              <select
                className="dr-input"
                value={provider}
                disabled={locked || busy}
                onChange={(event) => setProvider(event.target.value as 'llm' | 'heuristic')}
              >
                <option value="llm">{t('LLM（真实）', 'LLM')}</option>
                <option value="heuristic">{t('启发式（离线）', 'Heuristic (offline)')}</option>
              </select>
            </label>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={locked || busy}
              onClick={() => extract.mutate()}
            >
              {extract.isPending ? t('生成中…', 'Generating…') : t('生成世界观（新备选）', 'Generate world')}
            </button>
          </div>
        </div>

        <ExtractStatus jobs={statusQuery.data} />

        <div className="dr-world-stats">
          <span>{t('实体', 'Entities')} {summary?.total ?? 0}</span>
          <span>{t('关系', 'Relations')} {summary?.relations ?? 0}</span>
          {typeKeys.map((key) => (
            <span key={key}>
              {typeLabels[key]} {summary?.byType?.[key] ?? 0}
            </span>
          ))}
        </div>

        {summary?.missingCoreTypes?.length ? (
          <p className="dr-world-warning">
            {t('缺失核心类型：', 'Missing core types: ')}
            {summary.missingCoreTypes.join('、')}
            {t('（可换引擎或增大章节范围）', ' (try another engine or more chapters)')}
          </p>
        ) : null}

        {sets.length ? (
          <div className="dr-character-sets">
            <span>{t('备选集合：', 'Candidate sets:')}</span>
            {sets.map((set) => (
              <button
                key={set.id}
                type="button"
                className={`dr-chip ${set.selected ? 'is-active' : ''}`}
                aria-pressed={set.selected}
                disabled={locked || selectSet.isPending || set.live === 0}
                title={set.live === 0 ? t('该备选的数据已被早期版本清除，无法恢复', 'This set is no longer available') : ''}
                onClick={() => selectSet.mutate(set.id)}
              >
                {set.count} {t('实体', 'entities')} · {set.provider}
                {set.selected ? t('（当前）', ' (current)') : ''}
                {set.live === 0 ? t('（已失效）', ' (stale)') : ''}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {dataQuery.isLoading ? (
        <div className="dr-world-grid">
          <div className="dr-skeleton" style={{ height: 240 }} />
          <div className="dr-skeleton" style={{ height: 240 }} />
        </div>
      ) : dataQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('世界观加载失败', 'Failed to load world')}：{(dataQuery.error as Error).message}</p>
          <button className="dr-btn" type="button" onClick={() => dataQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : entities.length === 0 ? (
        <div className="dr-card dr-state dr-world-empty">
          <Icon name="globe" size={24} />
          <h3>{t('暂无世界观实体', 'No world entities yet')}</h3>
          <p>{t('摄取章节后点「生成世界观」，也可用「角色」页的联合抽取。', 'Ingest chapters, then generate world or use the combined extraction.')}</p>
        </div>
      ) : (
        <>
          <div className="dr-world-filters" role="group" aria-label={t('世界观类型', 'World types')}>
            <button
              type="button"
              className={`dr-chip ${typeFilter === 'all' ? 'is-active' : ''}`}
              aria-pressed={typeFilter === 'all'}
              onClick={() => { setTypeFilter('all'); setPage(1) }}
            >
              {t('全部', 'All')} {entities.length}
            </button>
            {typeKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`dr-chip ${typeFilter === key ? 'is-active' : ''}`}
                aria-pressed={typeFilter === key}
                onClick={() => { setTypeFilter(key); setPage(1) }}
              >
                {typeLabels[key]} {summary?.byType?.[key] ?? 0}
              </button>
            ))}
          </div>

          <div className="dr-world-search">
            <input
              className="dr-input"
              placeholder={t('搜索实体名、别名或描述', 'Search name, alias or description')}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
            />
            <div className="dr-character-status" role="group" aria-label={t('审校状态', 'Review status')}>
              {[
                ['all', t('全部', 'All')],
                ['pending', t('待审', 'Pending')],
                ['confirmed', t('已确认', 'Confirmed')],
                ['revision', t('需修订', 'Revision')],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`dr-chip ${statusFilter === value ? 'is-active' : ''}`}
                  aria-pressed={statusFilter === value}
                  onClick={() => {
                    setStatusFilter(value)
                    setPage(1)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <span>{t('匹配', 'Matched')} {filtered.length} / {entities.length}</span>
          </div>

          <div className="dr-bulk-bar">
            <label className="dr-select-all">
              <input
                type="checkbox"
                checked={filtered.length > 0 && filtered.every((entity) => selected.has(entity.id))}
                onChange={(event) => {
                  setSelected((current) => {
                    const next = new Set(current)
                    for (const entity of filtered) {
                      if (event.target.checked) next.add(entity.id)
                      else next.delete(entity.id)
                    }
                    return next
                  })
                }}
              />
              {t('全选筛选结果', 'Select all filtered')}
            </label>
            <span>{t('已选', 'Selected')} {selected.size}</span>
            <button className="dr-btn" type="button" disabled={!selected.size || bulkReview.isPending} onClick={() => bulkReview.mutate('confirmed')}>
              {t('确认', 'Confirm')}
            </button>
            <button className="dr-btn" type="button" disabled={!selected.size || bulkReview.isPending} onClick={() => bulkReview.mutate('revision')}>
              {t('需修订', 'Revision')}
            </button>
            <button className="dr-btn" type="button" disabled={!selected.size || bulkReview.isPending} onClick={() => bulkReview.mutate('pending')}>
              {t('设为待审', 'Set pending')}
            </button>
            <button className="dr-btn" type="button" disabled={!selected.size} onClick={() => setSelected(new Set())}>
              {t('清除选择', 'Clear')}
            </button>
          </div>

          <div className="dr-world-grid">
            <section className="dr-card dr-world-entities">
              <h3>
                {t('实体', 'Entities')}
                {typeFilter === 'all' ? '' : ` · ${typeLabels[typeFilter] ?? typeFilter}`}
              </h3>
              <div className="dr-world-entity-list">
                {pageItems.length ? (
                  pageItems.map((entity) => {
                    const labels = Object.fromEntries(
                      (attrLabels[entity.type] ?? []).map((attr) => [attr.key, attr.label])
                    )
                    const rows = Object.entries(entity.attributes ?? {}).filter(([, value]) => formatValue(value, lang))
                    return (
                      <details className="dr-world-entity" key={entity.id}>
                        <summary>
                          <input
                            type="checkbox"
                            className="dr-select-check"
                            checked={selected.has(entity.id)}
                            aria-label={t(`选择 ${entity.name}`, `Select ${entity.name}`)}
                            onClick={(event) => event.stopPropagation()}
                            onChange={() =>
                              setSelected((current) => {
                                const next = new Set(current)
                                if (next.has(entity.id)) next.delete(entity.id)
                                else next.add(entity.id)
                                return next
                              })
                            }
                          />
                          <span className="dr-tag">{typeLabels[entity.type] ?? entity.type}</span>
                          <strong>{entity.name}</strong>
                          <span className="dr-world-mentions">×{entity.mentions ?? 0}</span>
                          {entity.aliases?.length ? <span className="dr-world-alias">{entity.aliases.join('/')}</span> : null}
                        </summary>
                        <div className="dr-world-entity-body">
                          {entity.description ? <p>{entity.description}</p> : null}
                          {rows.length ? (
                            <dl>
                              {rows.map(([key, value]) => (
                                <div className="dr-world-row" key={key}>
                                  <dt>{labels[key] ?? key}</dt>
                                  <dd>{formatValue(value, lang)}</dd>
                                </div>
                              ))}
                            </dl>
                          ) : (
                            <p className="dr-novel-note">{t('（无结构化属性）', '(no structured attributes)')}</p>
                          )}
                          {entity.relations?.length ? (
                            <p className="dr-world-entity-relations">
                              {t('关系：', 'Relations: ')}
                              {entity.relations
                                .map((relation) => `${relation.target}${relation.kind ? `（${relation.kind}）` : ''}`)
                                .join('、')}
                            </p>
                          ) : null}
                        </div>
                      </details>
                    )
                  })
                ) : (
                  <p className="dr-novel-note">{t('暂无', 'None')}</p>
                )}
                {filtered.length > PAGE_SIZE ? (
                  <div className="dr-list-pager">
                    <span>{t('第', 'Page')} {currentPage}/{totalPages} · {filtered.length} {t('个实体', 'entities')}</span>
                    <button className="dr-btn" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                      {t('上一页', 'Previous')}
                    </button>
                    <button className="dr-btn" type="button" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
                      {t('下一页', 'Next')}
                    </button>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="dr-card dr-world-relations">
              <h3>{t('关系', 'Relations')}</h3>
              <div className="dr-world-relation-list">
                {relations.length ? (
                  relations.map((relation, index) => (
                    <div key={`${relation.from}-${relation.toName}-${index}`} className="dr-world-relation">
                      <span>{relation.fromName}</span>
                      <span className="dr-world-relation-kind">-[{relation.kind || '—'}]→</span>
                      <span>{relation.toName}</span>
                    </div>
                  ))
                ) : (
                  <p className="dr-novel-note">{t('暂无', 'None')}</p>
                )}
              </div>
            </section>
          </div>
        </>
      )}
    </>
  )
}
