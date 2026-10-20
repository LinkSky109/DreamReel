import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { novelStageIndex } from '../lib/novel'
import type { NovelProject } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Novels.css'

const STAGES = ['source', 'characters', 'world', 'series', 'episodes', 'assets', 'compose'] as const

const COVERS: { match: RegExp; src: string }[] = [
  { match: /聊斋/, src: '/media/covers/liaozhai.svg' },
  { match: /西游/, src: '/media/covers/xiyouji.svg' },
  { match: /镜花缘/, src: '/media/covers/jinghuayuan.svg' },
  { match: /儒林/, src: '/media/covers/rulinshi.svg' },
  { match: /呐喊/, src: '/media/covers/nahan.svg' },
]

function coverFor(title: string) {
  return COVERS.find((item) => item.match.test(title))?.src ?? null
}

function progressOf(novel: NovelProject) {
  if (novel.stats?.progress) return novel.stats.progress
  return Math.round(((novelStageIndex(novel.stage) + 1) / STAGES.length) * 100)
}

function statusOf(novel: NovelProject) {
  return novel.stats?.status ?? (novel.stage === 'compose' ? 'completed' : novel.stage === 'source' ? 'draft' : 'in-progress')
}

function statusLabel(status: string, lang: 'zh' | 'en') {
  if (status === 'completed') return lang === 'en' ? 'Completed' : '已完成'
  if (status === 'draft') return lang === 'en' ? 'Draft' : '草稿'
  return lang === 'en' ? 'In progress' : '进行中'
}

export function NovelsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t, lang } = useLang()
  const searchRef = useRef<HTMLInputElement>(null)

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [importOpen, setImportOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<NovelProject | null>(null)
  const [form, setForm] = useState({ title: '', author: '', url: '', text: '' })

  const novelsQuery = useQuery({ queryKey: ['novels'], queryFn: () => api.listNovels() })
  const novels = novelsQuery.data ?? []

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return novels.filter((novel) => {
      const matchesStatus = status === 'all' || statusOf(novel) === status
      const matchesSearch =
        !term ||
        novel.title.toLowerCase().includes(term) ||
        (novel.author ?? '').toLowerCase().includes(term) ||
        (novel.category ?? '').toLowerCase().includes(term)
      return matchesStatus && matchesSearch
    })
  }, [novels, query, status])

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['novels'] })

  const importMutation = useMutation({
    mutationFn: async () => {
      const title = form.title.trim()
      const url = form.url.trim()
      const text = form.text.trim()
      const created = await api.createNovel({
        title,
        author: form.author.trim() || undefined,
        sourceType: url ? 'qishuxia-txt' : 'text',
        sourceRef: url || undefined,
      })
      if (url || text) {
        await api.ingestNovel(created.id, url ? { sourceType: 'qishuxia-txt', url } : { sourceType: 'text', text })
      }
      return created
    },
    onSuccess: (novel) => {
      showToast(t('已导入', 'Imported'), 'success')
      setImportOpen(false)
      setForm({ title: '', author: '', url: '', text: '' })
      refresh()
      navigate(`/novel/${novel.id}?tab=source`)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteNovel(id),
    onSuccess: () => {
      showToast(t('已删除', 'Deleted'), 'success')
      setPendingDelete(null)
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const submitImport = () => {
    if (!form.title.trim()) {
      showToast(t('请填写书名', 'Enter a title'), 'error')
      return
    }
    importMutation.mutate()
  }

  const counts = {
    all: novels.length,
    'in-progress': novels.filter((novel) => statusOf(novel) === 'in-progress').length,
    completed: novels.filter((novel) => statusOf(novel) === 'completed').length,
    draft: novels.filter((novel) => statusOf(novel) === 'draft').length,
  }

  return (
    <div className="dr-page novel-theater">
      <div className="nv-page-head">
        <div>
          <p className="nv-eyebrow">Adaptation</p>
          <h1>{t('小说剧场', 'Novel Theater')}</h1>
          <p className="nv-lead">
            {t(
              '把一部小说拆成可拍的角色、设定与分镜。全书切章、角色抽卡、世界观整理，到改编分镜，都在同一条链路上完成。',
              'Turn a novel into shootable characters, worldbuilding and storyboards — from chapter splitting to adaptation in one pipeline.'
            )}
          </p>
        </div>
        <button className="dr-btn dr-btn-primary nv-import-btn" type="button" onClick={() => setImportOpen(true)}>
          <Icon name="upload" size={15} />
          {t('导入小说', 'Import novel')}
        </button>
      </div>

      <div className="nv-filter-bar">
        <div className="nv-filter-search">
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            className="dr-input"
            type="search"
            placeholder={t('搜索书名、作者或类型', 'Search title, author or genre')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={t('搜索小说', 'Search novels')}
          />
        </div>
        <div className="nv-filter-chips" role="group" aria-label={t('小说状态', 'Novel status')}>
          {[
            ['all', t('全部', 'All')],
            ['in-progress', t('进行中', 'In progress')],
            ['completed', t('已完成', 'Completed')],
            ['draft', t('草稿', 'Draft')],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`nv-chip ${status === value ? 'is-active' : ''}`}
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
              <span>{counts[value as keyof typeof counts]}</span>
            </button>
          ))}
        </div>
        <span className="nv-filter-count">
          {t('共', 'Total')} <strong>{filtered.length}</strong> {t('部', 'novels')}
        </span>
      </div>

      {novelsQuery.isLoading ? (
        <div className="novel-grid">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 188 }} />
          ))}
        </div>
      ) : novelsQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('加载失败', 'Failed to load')}：{(novelsQuery.error as Error).message}</p>
          <button className="dr-btn" type="button" onClick={() => novelsQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="nv-empty">
          <div className="nv-empty-icon">
            <Icon name="book" size={26} />
          </div>
          <h2>{novels.length ? t('没有符合条件的小说', 'No novels match') : t('还没有小说项目', 'No novel projects yet')}</h2>
          <p>
            {novels.length
              ? t('换一个关键词，或清除筛选条件。', 'Try another keyword or clear filters.')
              : t('导入一部小说的正文，DreamReel 会先切章，再抽取角色与世界观设定。', 'Import a novel to split chapters, then extract characters and worldbuilding.')}
          </p>
          <button className="dr-btn dr-btn-primary" type="button" onClick={() => (novels.length ? setQuery('') : setImportOpen(true))}>
            {novels.length ? t('清除筛选', 'Clear filters') : t('导入第一部小说', 'Import your first novel')}
          </button>
        </div>
      ) : (
        <div className="novel-grid">
          {filtered.map((novel) => {
            const stats = novel.stats
            const progress = progressOf(novel)
            const statusValue = statusOf(novel)
            const cover = coverFor(novel.title)
            return (
              <article className="novel-card" key={novel.id}>
                <Link
                  className={`novel-cover ${cover ? 'has-image' : ''}`}
                  to={`/novel/${novel.id}`}
                  aria-label={t(`打开小说：${novel.title}`, `Open ${novel.title}`)}
                >
                  {cover ? (
                    <img src={cover} alt="" />
                  ) : (
                    <>
                      <span className="novel-cover-mark">梦</span>
                      <span className="novel-cover-name">{novel.title}</span>
                      <span className="novel-cover-author">{novel.author || t('佚名', 'Unknown')}</span>
                    </>
                  )}
                </Link>
                <div className="novel-body">
                  <div className="novel-title-row">
                    <Link className="novel-title" to={`/novel/${novel.id}`}>
                      {novel.title}
                    </Link>
                    <button
                      className="dr-icon-btn novel-delete"
                      type="button"
                      aria-label={t(`删除 ${novel.title}`, `Delete ${novel.title}`)}
                      onClick={() => setPendingDelete(novel)}
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                  <div className="novel-author">
                    {novel.author || t('佚名', 'Unknown')} · {novel.category || t('小说改编', 'Novel adaptation')}
                  </div>
                  <p className="novel-tagline">
                    {novel.style?.name
                      ? `${novel.style.name} · ${novel.style.visual ?? ''}`
                      : t('已完成切章，等待抽取角色与世界观。', 'Chapters ready; extract characters and world next.')}
                  </p>
                  <div className="novel-stats">
                    <span>{stats?.chapters ?? novel.counts?.chapters ?? 0} {t('章', 'ch')}</span>
                    <span>{stats?.characters ?? novel.counts?.characters ?? 0} {t('角色', 'chars')}</span>
                    <span>
                      {stats?.words
                        ? stats.words >= 10000
                          ? `${(stats.words / 10000).toFixed(1)}${t('万字', 'w chars')}`
                          : `${stats.words} ${t('字', 'chars')}`
                        : '—'}
                    </span>
                  </div>
                  <div className="novel-progress">
                    <span className="novel-track"><span style={{ width: `${progress}%` }} /></span>
                    <span className="novel-pct">{progress}%</span>
                  </div>
                  <div className="novel-foot">
                    <span className={`novel-status is-${statusValue}`}>{statusLabel(statusValue, lang)}</span>
                    <span>
                      {t('已确认', 'Approved')} {stats?.approved ?? 0}/{stats?.characters ?? novel.counts?.characters ?? 0} ·{' '}
                      {novel.updatedAt ? new Date(novel.updatedAt).toLocaleDateString() : ''}
                    </span>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={importOpen}
        title={t('导入小说', 'Import novel')}
        onClose={() => (!importMutation.isPending ? setImportOpen(false) : undefined)}
        width={640}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setImportOpen(false)} disabled={importMutation.isPending}>
              {t('取消', 'Cancel')}
            </button>
            <button className="dr-btn dr-btn-primary" type="button" onClick={submitImport} disabled={importMutation.isPending}>
              {importMutation.isPending ? t('导入中…', 'Importing…') : t('导入并切章', 'Import & split')}
            </button>
          </>
        }
      >
        <div className="nv-import">
          <div className="nv-import-row">
            <label className="dr-field">
              <span>{t('书名', 'Title')} *</span>
              <input
                className="dr-input"
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder={t('例：长夜将明', 'e.g. The Long Night')}
                autoFocus
              />
            </label>
            <label className="dr-field">
              <span>{t('作者', 'Author')}</span>
              <input
                className="dr-input"
                value={form.author}
                onChange={(event) => setForm({ ...form, author: event.target.value })}
                placeholder={t('可选', 'Optional')}
              />
            </label>
          </div>
          <label className="dr-field">
            <span>{t('书籍链接（TXT 下载，只下载一次）', 'Book URL (downloaded once)')}</span>
            <input
              className="dr-input"
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
              placeholder="https://www.qishuxia.com/book/..."
              inputMode="url"
            />
          </label>
          <div className="nv-import-or">
            <span>{t('或', 'or')}</span>
          </div>
          <label className="dr-field">
            <span>{t('粘贴正文', 'Paste text')}</span>
            <textarea
              className="dr-input nv-import-text"
              rows={7}
              value={form.text}
              onChange={(event) => setForm({ ...form, text: event.target.value })}
              placeholder={t('粘贴小说正文，系统会按章节标题切章。', 'Paste novel text; chapters are split by headings.')}
            />
          </label>
          <p className="nv-import-note">
            {t(
              '链接和正文至少填一项；都不填则先创建空项目，稍后在「来源」里导入。',
              'Provide a URL or text; otherwise an empty project is created and can be ingested later.'
            )}
          </p>
        </div>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        title={t('删除小说项目', 'Delete novel project')}
        onClose={() => (!deleteMutation.isPending ? setPendingDelete(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setPendingDelete(null)} disabled={deleteMutation.isPending}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-danger"
              type="button"
              disabled={deleteMutation.isPending}
              onClick={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
            >
              {deleteMutation.isPending ? t('删除中…', 'Deleting…') : t('确认删除', 'Delete')}
            </button>
          </>
        }
      >
        <p className="dr-modal-text">
          {t('确定删除「', 'Delete "')}
          <strong>{pendingDelete?.title}</strong>
          {t('」？会同时删除角色、剧本、资产与同步记录，不可恢复。', '"? Characters, scripts, assets and sync records are removed permanently.')}
        </p>
      </Modal>
    </div>
  )
}
