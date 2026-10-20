import { useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { NovelAsset, NovelAssetCategory, NovelDetail } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { AuthImage } from '../../components/AuthImage'
import './ArtTab.css'
import './ArtTab.css'

const CATEGORIES: { key: NovelAssetCategory; zh: string; en: string }[] = [
  { key: 'character', zh: '角色', en: 'Character' },
  { key: 'clothing', zh: '衣物', en: 'Clothing' },
  { key: 'equipment', zh: '装备', en: 'Equipment' },
  { key: 'architecture', zh: '建筑', en: 'Architecture' },
  { key: 'scene', zh: '场景', en: 'Scene' },
  { key: 'prop', zh: '道具', en: 'Prop' },
  { key: 'other', zh: '其他', en: 'Other' },
]

function categoryLabel(category: string, lang: 'zh' | 'en') {
  return CATEGORIES.find((item) => item.key === category)?.[lang] ?? category
}

export function ArtTab({ novel, onChanged }: { novel: NovelDetail; onChanged: () => void }) {
  const { t, lang } = useLang()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('all')
  const [form, setForm] = useState<{ category: NovelAssetCategory; name: string; prompt: string }>({
    category: 'character',
    name: '',
    prompt: '',
  })
  const [editing, setEditing] = useState<NovelAsset | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrompt, setEditPrompt] = useState('')
  const [pendingDelete, setPendingDelete] = useState<NovelAsset | null>(null)
  const [generating, setGenerating] = useState<string | null>(null)
  const [bulkText, setBulkText] = useState<string | null>(null)
  const bulkStop = useRef(false)

  const dataQuery = useQuery({
    queryKey: ['novel-assets', novel.id],
    queryFn: () => api.listNovelAssets(novel.id),
  })

  const assets = dataQuery.data?.assets ?? []
  const stats = dataQuery.data?.stats
  const stageAssets = assets.filter((asset) => asset.episodeNo)
  const filtered = useMemo(() => {
    if (filter === 'all') return assets
    if (filter === '__stage') return stageAssets
    return assets.filter((asset) => asset.category === filter)
  }, [assets, filter, stageAssets])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['novel-assets', novel.id] })
    onChanged()
  }

  const addAsset = async () => {
    if (!form.name.trim()) {
      showToast(t('请填名称', 'Enter a name'), 'error')
      return
    }
    try {
      await api.createNovelAsset(novel.id, {
        category: form.category,
        name: form.name.trim(),
        prompt: form.prompt.trim() || undefined,
      })
      showToast(t('已新增', 'Added'), 'success')
      setForm({ ...form, name: '', prompt: '' })
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const generateOne = async (asset: NovelAsset) => {
    setGenerating(asset.id)
    try {
      await api.generateNovelAsset(novel.id, asset.id)
      showToast(t('已出图', 'Image generated'), 'success')
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    } finally {
      setGenerating(null)
    }
  }

  const bulkGenerate = async () => {
    const categories = filter !== 'all' && filter !== '__stage' ? [filter] : undefined
    bulkStop.current = false
    setBulkText(t('出图中…', 'Rendering…'))
    try {
      let guard = 0
      for (;;) {
        const result = await api.bulkGenerateNovelAssets(novel.id, {
          categories,
          onlyMissing: true,
          limit: 3,
          concurrency: 2,
          reset: guard === 0,
        })
        setBulkText(
          t(
            `已出图 ${result.withImages}/${result.total}（本轮 ${result.ok} 成功 / ${result.failed} 失败）`,
            `${result.withImages}/${result.total} (batch ${result.ok} ok / ${result.failed} failed)`
          )
        )
        if (bulkStop.current || result.cancelled || result.stopped) {
          showToast(t('已停止出图', 'Stopped'), 'success')
          break
        }
        if (result.remaining <= 0 || result.processed === 0 || ++guard > 400) break
      }
      if (!bulkStop.current) showToast(t('批量出图完成', 'Bulk rendering complete'), 'success')
      refresh()
    } catch (error) {
      const message = (error as Error).message
      if (/已停止/.test(message)) showToast(t('已停止出图', 'Stopped'), 'success')
      else showToast(message, 'error')
    } finally {
      setBulkText(null)
      bulkStop.current = false
    }
  }

  const stopBulk = async () => {
    bulkStop.current = true
    try {
      await api.cancelNovelAssetBulk(novel.id)
    } catch {
      /* 已经停止 */
    }
  }

  const suggest = async () => {
    try {
      const result = await api.suggestNovelAssets(novel.id)
      showToast(t(`已导入候选 ${result.created} 个`, `Imported ${result.created} candidates`), 'success')
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const saveEdit = async () => {
    if (!editing) return
    try {
      await api.updateNovelAsset(novel.id, editing.id, { name: editName, prompt: editPrompt })
      showToast(t('已保存', 'Saved'), 'success')
      setEditing(null)
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const remove = async () => {
    if (!pendingDelete) return
    try {
      await api.deleteNovelAsset(novel.id, pendingDelete.id)
      showToast(t('已删除', 'Deleted'), 'success')
      setPendingDelete(null)
      refresh()
    } catch (error) {
      showToast((error as Error).message, 'error')
    }
  }

  const busy = Boolean(bulkText) || Boolean(generating)

  if (dataQuery.isLoading) {
    return <div className="dr-skeleton" style={{ height: 280 }} />
  }

  if (dataQuery.isError) {
    return (
      <div className="dr-card dr-state">
        <p>{t('设定图加载失败', 'Failed to load assets')}：{(dataQuery.error as Error).message}</p>
        <button className="dr-btn" type="button" onClick={() => dataQuery.refetch()}>
          {t('重试', 'Retry')}
        </button>
      </div>
    )
  }

  return (
    <>
      <section className="dr-card dr-art-head">
        <div className="dr-art-title">
          <h2>
            {t('设定图集', 'Asset gallery')}
            <span>{t('为图生视频准备成套设定图', 'Reference art for image-to-video')}</span>
          </h2>
          <div className="dr-art-actions">
            {bulkText ? <span className="dr-art-bulk-info">{bulkText}</span> : null}
            <button className="dr-btn" type="button" disabled={busy} onClick={bulkGenerate}>
              {t('本类批量出图', 'Bulk render')}
            </button>
            {bulkText ? (
              <button className="dr-btn dr-btn-danger" type="button" onClick={stopBulk}>
                {t('停止出图', 'Stop')}
              </button>
            ) : null}
            <button className="dr-btn" type="button" disabled={busy} onClick={suggest}>
              {t('从角色/世界观导入候选（含各阶段）', 'Import candidates')}
            </button>
          </div>
        </div>

        <div className="dr-art-stats">
          <span>{t('共', 'Total')} {stats?.total ?? assets.length}</span>
          <span>{t('已出图', 'Rendered')} {stats?.generated ?? 0}</span>
          <span>{t('失败', 'Failed')} {stats?.failed ?? 0}</span>
          {CATEGORIES.map((category) => (
            <span key={category.key}>
              {lang === 'en' ? category.en : category.zh} {stats?.byCategory?.[category.key] ?? 0}
            </span>
          ))}
        </div>
        <p className="dr-novel-note">
          {t(
            '批量出图按当前类别逐张生成（单张约 1 分钟、走付费 provider）；分批续跑，可随时停。角色会按形象时间线拆成多个阶段。',
            'Bulk render generates current category one by one (about 1 minute each, paid provider). Batches are resumable and stoppable; characters are split by timeline stages.'
          )}
        </p>

        <div className="dr-art-filters" role="group" aria-label={t('设定图类别', 'Asset categories')}>
          <button type="button" className={`dr-chip ${filter === 'all' ? 'is-active' : ''}`} aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>
            {t('全部', 'All')} {assets.length}
          </button>
          <button type="button" className={`dr-chip ${filter === '__stage' ? 'is-active' : ''}`} aria-pressed={filter === '__stage'} onClick={() => setFilter('__stage')}>
            {t('角色阶段', 'Stages')} {stageAssets.length}
          </button>
          {CATEGORIES.map((category) => (
            <button
              key={category.key}
              type="button"
              className={`dr-chip ${filter === category.key ? 'is-active' : ''}`}
              aria-pressed={filter === category.key}
              onClick={() => setFilter(category.key)}
            >
              {lang === 'en' ? category.en : category.zh} {stats?.byCategory?.[category.key] ?? 0}
            </button>
          ))}
        </div>

        <div className="dr-art-add">
          <select
            className="dr-input"
            value={form.category}
            disabled={busy}
            onChange={(event) => setForm({ ...form, category: event.target.value as NovelAssetCategory })}
          >
            {CATEGORIES.map((category) => (
              <option key={category.key} value={category.key}>
                {lang === 'en' ? category.en : category.zh}
              </option>
            ))}
          </select>
          <input
            className="dr-input"
            placeholder={t('名称（如：主角 / 星舰 / 王城）', 'Name (e.g. hero / ship / city)')}
            value={form.name}
            disabled={busy}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          <input
            className="dr-input"
            placeholder={t('描述（可选）', 'Description (optional)')}
            value={form.prompt}
            disabled={busy}
            onChange={(event) => setForm({ ...form, prompt: event.target.value })}
          />
          <button className="dr-btn dr-btn-primary" type="button" disabled={busy} onClick={addAsset}>
            <Icon name="plus" size={14} />
            {t('新增', 'Add')}
          </button>
        </div>
      </section>

      {filtered.length === 0 ? (
        <div className="dr-card dr-state dr-art-empty">
          <Icon name="sparkles" size={24} />
          <h3>{t('暂无设定图', 'No assets yet')}</h3>
          <p>{t('点「从角色/世界观导入候选」，或手动新增。', 'Import candidates or add one manually.')}</p>
        </div>
      ) : (
        <div className="dr-art-grid">
          {filtered.map((asset) => (
            <article className="dr-card dr-art-card" key={asset.id}>
              <div className="dr-art-thumb">
                {asset.imageUrl ? (
                  <AuthImage src={asset.imageUrl} alt={asset.name} />
                ) : (
                  <span>{t('未出图', 'No image')}</span>
                )}
              </div>
              <div className="dr-art-name">
                <strong>{asset.name}</strong>
                <span>{categoryLabel(asset.category, lang)}</span>
                {asset.episodeNo ? <span className="dr-art-stage">{t(`第${asset.episodeNo}集阶段`, `Episode ${asset.episodeNo}`)}</span> : null}
                {asset.stageLabel ? <span className="dr-art-stage">{asset.stageLabel}</span> : null}
              </div>
              {asset.prompt ? <p className="dr-art-prompt">{asset.prompt}</p> : null}
              {asset.error ? <p className="dr-art-error">{asset.error}</p> : null}
              <div className="dr-art-card-actions">
                <button
                  className="dr-btn"
                  type="button"
                  disabled={busy}
                  onClick={() => generateOne(asset)}
                >
                  {generating === asset.id ? t('生成中…', 'Generating…') : asset.imageUrl ? t('重出图', 'Regenerate') : t('生成图', 'Generate')}
                </button>
                <button
                  className="dr-btn"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setEditing(asset)
                    setEditName(asset.name)
                    setEditPrompt(asset.prompt ?? '')
                  }}
                >
                  {t('编辑', 'Edit')}
                </button>
                <button className="dr-btn dr-btn-danger" type="button" disabled={busy} onClick={() => setPendingDelete(asset)}>
                  {t('删除', 'Delete')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        title={t('编辑设定图', 'Edit asset')}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setEditing(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button className="dr-btn dr-btn-primary" type="button" onClick={saveEdit}>
              {t('保存', 'Save')}
            </button>
          </>
        }
      >
        <div className="dr-art-edit">
          <label className="dr-field">
            <span>{t('名称', 'Name')}</span>
            <input className="dr-input" value={editName} onChange={(event) => setEditName(event.target.value)} />
          </label>
          <label className="dr-field">
            <span>{t('描述', 'Description')}</span>
            <textarea
              className="dr-input dr-novel-textarea"
              rows={4}
              value={editPrompt}
              onChange={(event) => setEditPrompt(event.target.value)}
            />
          </label>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        title={t('删除设定图', 'Delete asset')}
        onClose={() => setPendingDelete(null)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setPendingDelete(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button className="dr-btn dr-btn-danger" type="button" onClick={remove}>
              {t('确认删除', 'Delete')}
            </button>
          </>
        }
      >
        <p className="dr-modal-text">
          {t('确定删除「', 'Delete "')}
          <strong>{pendingDelete?.name}</strong>
          {t('」？图片文件也会一并清理。', '"? The image file will be removed too.')}
        </p>
      </Modal>
    </>
  )
}
