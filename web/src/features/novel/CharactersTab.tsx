import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import { novelStageIndex } from '../../lib/novel'
import type { NovelCardField, NovelCharacter, NovelDetail, NovelExtractJobs } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import './CharactersTab.css'

type CharacterData = {
  characters: NovelCharacter[]
  sets: Awaited<ReturnType<typeof api.listNovelCharacterSets>>
  stats: Awaited<ReturnType<typeof api.getNovelReviewStats>>
  schema: Awaited<ReturnType<typeof api.getNovelSchema>> | null
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join('、')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, val]) => `${key} ${formatValue(val)}`)
      .filter(Boolean)
      .join('；')
  }
  return String(value)
}

function hasActiveJobs(jobs?: NovelExtractJobs) {
  if (!jobs) return false
  return (['characters', 'world', 'both'] as const).some((key) => {
    const job = jobs[key]
    return job && !job.finishedAt
  })
}

function ExtractStatus({ jobs }: { jobs?: NovelExtractJobs }) {
  const { t } = useLang()
  const entries = (['both', 'characters', 'world'] as const).flatMap((key) => {
    const job = jobs?.[key]
    return job ? ([[key, job]] as const) : []
  })

  if (!entries.length) return null

  return (
    <div className="dr-extract-status">
      {entries.map(([key, job]) => {
        const settled = (job.done ?? 0) + (job.failed ?? 0)
        const pct = job.total ? Math.round((settled / job.total) * 100) : 0
        return (
          <div key={key} className="dr-extract-job">
            <span className="dr-extract-job-label">
              {key === 'both' ? t('合并（角色+世界观）', 'Combined (characters + world)') : key === 'characters' ? t('角色', 'Characters') : t('世界观', 'World')}
            </span>
            <span>
              {t('完成', 'Done')} {job.done}/{job.total} · {t('失败', 'Failed')} {job.failed} ·{' '}
              {job.finishedAt ? t('已结束', 'Finished') : t(`进行中 ${pct}%`, `Running ${pct}%`)}
            </span>
            <div className="dr-extract-chips">
              {(job.tasks ?? []).map((task, index) => (
                <span
                  key={`${task.label}-${index}`}
                  className={`dr-extract-chip is-${task.status}`}
                  title={task.error || ''}
                >
                  {task.status === 'done' ? '✓' : task.status === 'failed' ? '✗' : task.status === 'running' ? '…' : '·'}{' '}
                  {task.label}
                  {task.ms ? ` ${(task.ms / 1000).toFixed(1)}s` : ''}
                </span>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function CharactersTab({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void }) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [provider, setProvider] = useState<'llm' | 'heuristic'>('llm')
  const [editing, setEditing] = useState<{ character: NovelCharacter; field: string; value: string } | null>(null)

  const locked = novelStageIndex(novel.stage) > novelStageIndex('characters')

  const dataQuery = useQuery({
    queryKey: ['novel-characters', novel.id],
    queryFn: async (): Promise<CharacterData> => {
      const [characters, sets, stats, schema] = await Promise.all([
        api.listNovelCharacters(novel.id),
        api.listNovelCharacterSets(novel.id).catch(() => []),
        api.getNovelReviewStats(novel.id).catch(() => ({})),
        api.getNovelSchema(novel.id).catch(() => null),
      ])
      return { characters, sets, stats, schema }
    },
  })

  const statusQuery = useQuery({
    queryKey: ['novel-extract-status', novel.id],
    queryFn: () => api.getNovelExtractStatus(novel.id).catch(() => ({})),
    refetchInterval: (query) => (hasActiveJobs(query.state.data) ? 2000 : false),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['novel-characters', novel.id] })
    queryClient.invalidateQueries({ queryKey: ['novel-extract-status', novel.id] })
    onChanged()
  }

  const extract = useMutation({
    mutationFn: () => api.extractNovelCharacters(novel.id, { provider, minFreq: 1 }),
    onSuccess: (result) => {
      if (result.degraded) {
        showToast(
          t('LLM 调用失败，已回退启发式：结果可能为空/粗糙，请检查「模型」是否可用', 'LLM failed; heuristic fallback may be rough.'),
          'error'
        )
      } else {
        showToast(t('已生成角色备选', 'Character candidates generated'), 'success')
      }
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const extractAll = useMutation({
    mutationFn: () => api.extractNovelAll(novel.id, { provider: 'llm' }),
    onSuccess: (result) => {
      if (result.degraded) {
        showToast(t('LLM 调用失败，已回退启发式：结果可能为空/粗糙', 'LLM failed; heuristic fallback may be rough.'), 'error')
      } else {
        showToast(t(`已生成角色 ${result.characters.length} 个（含世界观）`, `Generated ${result.characters.length} characters (with world)`), 'success')
      }
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const approve = useMutation({
    mutationFn: (cid: string) => api.approveNovelCharacter(novel.id, cid),
    onSuccess: () => {
      showToast(t('已通过', 'Approved'), 'success')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const selectSet = useMutation({
    mutationFn: (setId: string) => api.selectNovelCharacterSet(novel.id, setId),
    onSuccess: () => {
      showToast(t('已切换备选', 'Candidate set selected'), 'success')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const saveEdit = useMutation({
    mutationFn: (payload: { id: string; field: string; value: string }) =>
      api.patchNovelCharacter(
        novel.id,
        payload.id,
        payload.field === 'name' ? { name: payload.value } : { card: { [payload.field]: payload.value } }
      ),
    onSuccess: () => {
      showToast(t('已保存', 'Saved'), 'success')
      setEditing(null)
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const data = dataQuery.data
  const fields: NovelCardField[] = data?.schema?.character.fields ?? []
  const groups = data?.schema?.character.groups ?? {}
  const stats = data?.stats ?? {}
  const characters = data?.characters ?? []
  const sets = data?.sets ?? []
  const busy = extract.isPending || extractAll.isPending

  const fieldOptions = useMemo(
    () => [{ key: 'name', label: t('姓名', 'Name'), group: '' }, ...fields],
    [fields, t]
  )

  const openEdit = (character: NovelCharacter, field = 'personality') => {
    const value = field === 'name' ? character.name : character.card?.[field] ?? ''
    setEditing({ character, field, value })
  }

  const changeEditField = (field: string) => {
    if (!editing) return
    const value =
      field === 'name' ? editing.character.name : formatValue(editing.character.card?.[field] ?? '')
    setEditing({ ...editing, field, value })
  }

  return (
    <>
      <section className="dr-card dr-characters-head">
        <div className="dr-characters-title">
          <h2>
            {t('角色', 'Characters')}
            {locked ? <span className="dr-novel-locked">{t('已锁定', 'Locked')}</span> : null}
          </h2>
          <div className="dr-characters-controls">
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
              {extract.isPending ? t('生成中…', 'Generating…') : t('生成角色（新备选）', 'Generate characters')}
            </button>
            <button
              className="dr-btn"
              type="button"
              disabled={locked || busy}
              onClick={() => extractAll.mutate()}
            >
              {extractAll.isPending ? t('生成中…', 'Generating…') : t('角色+世界观（一次·一致）', 'Characters + world')}
            </button>
          </div>
        </div>

        <ExtractStatus jobs={statusQuery.data} />

        <p className="dr-novel-note">
          {t('字段', 'Fields')} {fields.length || 33} · {t('修订率', 'Revision rate')}{' '}
          {(((stats.revisionRate ?? 0) * 100) || 0).toFixed(1)}% · {t('已通过', 'Approved')}{' '}
          {stats.approved ?? 0} / {characters.length}
        </p>

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
                {set.count} {t('个', 'items')} · {set.provider}
                {set.selected ? t('（当前）', ' (current)') : ''}
                {set.live === 0 ? t('（已失效）', ' (stale)') : ''}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {dataQuery.isLoading ? (
        <div className="dr-characters-list">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 120 }} />
          ))}
        </div>
      ) : dataQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('角色加载失败', 'Failed to load characters')}：{(dataQuery.error as Error).message}</p>
          <button className="dr-btn" type="button" onClick={() => dataQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : characters.length === 0 ? (
        <div className="dr-card dr-state dr-characters-empty">
          <Icon name="users" size={24} />
          <h3>{t('暂无角色', 'No characters yet')}</h3>
          <p>{t('先在「来源」摄取章节，再点「生成角色」。', 'Ingest chapters first, then generate characters.')}</p>
        </div>
      ) : (
        <div className="dr-characters-list">
          {characters.map((character) => (
            <article className="dr-card dr-character-card" key={character.id}>
              <div className="dr-character-head">
                <div className="dr-character-name">
                  <strong>{character.name}</strong>
                  {character.aliases?.length ? <span>{t('别名', 'Aliases')} {character.aliases.join('/')}</span> : null}
                  {character.kind === 'group' ? <span className="dr-tag">{t('群体', 'Group')}</span> : null}
                  <span className={`dr-tag ${character.status === 'approved' ? 'is-active' : ''}`}>
                    {character.status === 'approved' ? t('已通过', 'Approved') : t('待审核', 'Pending')}
                  </span>
                  <span className="dr-character-provider">{character.provider}</span>
                </div>
                <div className="dr-character-actions">
                  <button className="dr-btn dr-btn-sm" type="button" disabled={locked} onClick={() => openEdit(character)}>
                    {t('修订', 'Edit')}
                  </button>
                  <button
                    className="dr-btn dr-btn-sm"
                    type="button"
                    disabled={locked || character.status === 'approved' || approve.isPending}
                    onClick={() => approve.mutate(character.id)}
                  >
                    {t('通过', 'Approve')}
                  </button>
                </div>
              </div>
              {character.description ? <p className="dr-character-desc">{character.description}</p> : null}
              <div className="dr-character-card-body">
                {Object.entries(groups).map(([groupKey, groupLabel]) => {
                  const rows = fields.filter(
                    (field) => field.group === groupKey && formatValue(character.card?.[field.key])
                  )
                  if (!rows.length) return null
                  return (
                    <div className="dr-character-group" key={groupKey}>
                      <h4>{groupLabel}</h4>
                      <dl>
                        {rows.map((field) => (
                          <div className="dr-character-row" key={field.key}>
                            <dt>{field.label}</dt>
                            <dd>{formatValue(character.card[field.key])}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )
                })}
                {!Object.keys(groups).length ? (
                  <p className="dr-novel-note">
                    {t('（未抽取到字段，可用启发式引擎先跑通或换 LLM）', 'No card fields extracted. Try heuristic or another LLM.')}
                  </p>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        title={t('修订角色', 'Edit character')}
        onClose={() => (!saveEdit.isPending ? setEditing(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setEditing(null)} disabled={saveEdit.isPending}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={saveEdit.isPending}
              onClick={() =>
                editing &&
                saveEdit.mutate({ id: editing.character.id, field: editing.field, value: editing.value })
              }
            >
              {saveEdit.isPending ? t('保存中…', 'Saving…') : t('保存', 'Save')}
            </button>
          </>
        }
      >
        {editing ? (
          <div className="dr-character-edit">
            <label className="dr-field">
              <span>{t('字段', 'Field')}</span>
              <select
                className="dr-input"
                value={editing.field}
                onChange={(event) => changeEditField(event.target.value)}
              >
                {fieldOptions.map((field) => (
                  <option value={field.key} key={field.key}>
                    {field.label}（{field.key}）
                  </option>
                ))}
              </select>
            </label>
            <label className="dr-field">
              <span>{t('内容', 'Value')}</span>
              <textarea
                className="dr-input dr-novel-textarea"
                rows={5}
                value={editing.value}
                onChange={(event) => setEditing({ ...editing, value: event.target.value })}
              />
            </label>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
