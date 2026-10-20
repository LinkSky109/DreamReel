import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import type { NovelProject } from '../domain/types'
import { novelStageLabel } from '../lib/novel'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Novels.css'

export function NovelsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t, lang } = useLang()
  const titleRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [url, setUrl] = useState('')
  const [pendingDelete, setPendingDelete] = useState<NovelProject | null>(null)

  const novelsQuery = useQuery({
    queryKey: ['novels'],
    queryFn: () => api.listNovels(),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['novels'] })

  const createMutation = useMutation({
    mutationFn: () =>
      api.createNovel({
        title: title.trim(),
        author: author.trim() || undefined,
        sourceType: url.trim() ? 'qishuxia-txt' : 'text',
        sourceRef: url.trim() || undefined,
      }),
    onSuccess: (novel) => {
      showToast(t('已创建', 'Created'), 'success')
      navigate(`/novel/${novel.id}`)
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

  const novels = novelsQuery.data ?? []

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!title.trim()) {
      titleRef.current?.focus()
      return
    }
    createMutation.mutate()
  }

  return (
    <div className="dr-page">
      <div className="dr-page-head">
        <div>
          <h1 className="dr-page-title">{t('小说剧场 · 制作台', 'Novel Theater')}</h1>
          <p className="dr-page-sub">
            {t(
              '书名/链接 → 清洗分章 → 角色 → 世界观 → 分季分集 → 剧本 → 资产 → 成片 → 同步',
              'Book or link → chapters → characters → world → seasons → script → assets → compose → sync'
            )}
          </p>
        </div>
      </div>

      <form className="dr-card dr-novel-create" onSubmit={submit}>
        <div className="dr-novel-create-fields">
          <label className="dr-field">
            <span>{t('书名', 'Title')} *</span>
            <input
              ref={titleRef}
              className="dr-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('例：长夜将明', 'e.g. The Long Night')}
              required
            />
          </label>
          <label className="dr-field dr-novel-author">
            <span>{t('作者', 'Author')}</span>
            <input
              className="dr-input"
              value={author}
              onChange={(event) => setAuthor(event.target.value)}
              placeholder={t('可选', 'Optional')}
            />
          </label>
          <label className="dr-field dr-novel-url">
            <span>{t('书籍链接', 'Book URL')}</span>
            <input
              className="dr-input"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://www.qishuxia.com/book/..."
              inputMode="url"
            />
          </label>
          <button className="dr-btn dr-btn-primary" type="submit" disabled={createMutation.isPending}>
            <Icon name="plus" size={15} />
            {createMutation.isPending ? t('创建中…', 'Creating…') : t('创建', 'Create')}
          </button>
        </div>
        <p className="dr-novel-hint">
          {t(
            '不填链接时按纯文本项目创建，可稍后在「来源」里粘贴正文。',
            'Without a URL the project starts as plain text; paste content later under Source.'
          )}
        </p>
      </form>

      {novelsQuery.isLoading ? (
        <div className="dr-novel-list">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 76 }} />
          ))}
        </div>
      ) : novelsQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('加载失败', 'Failed to load')}：{(novelsQuery.error as Error).message}</p>
          <button className="dr-btn" type="button" onClick={() => novelsQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : novels.length === 0 ? (
        <div className="dr-card dr-state dr-novel-empty">
          <Icon name="book" size={26} />
          <h2>{t('还没有小说项目', 'No novel projects yet')}</h2>
          <p>{t('从一本小说开始，逐阶段推进到成片。', 'Start from a book and move stage by stage to the final cut.')}</p>
          <button className="dr-btn dr-btn-primary" type="button" onClick={() => titleRef.current?.focus()}>
            {t('新建第一部小说', 'Create your first novel')}
          </button>
        </div>
      ) : (
        <div className="dr-novel-list">
          {novels.map((novel) => (
            <article className="dr-card dr-novel-item" key={novel.id}>
              <Link className="dr-novel-link" to={`/novel/${novel.id}`}>
                <div className="dr-novel-title">
                  <strong>{novel.title}</strong>
                  {novel.author ? <span>{novel.author}</span> : null}
                </div>
                <div className="dr-novel-meta">
                  <span className="dr-tag">{novelStageLabel(novel.stage, lang)}</span>
                  <span>
                    {t('章', 'Ch')} {novel.counts?.chapters ?? 0}
                  </span>
                  <span>
                    {t('角色', 'Char')} {novel.counts?.characters ?? 0}
                  </span>
                  <span>
                    {t('集', 'Ep')} {novel.counts?.episodes ?? 0}
                  </span>
                  {novel.updatedAt ? (
                    <span className="dr-novel-time">{new Date(novel.updatedAt).toLocaleDateString()}</span>
                  ) : null}
                </div>
              </Link>
              <button
                className="dr-icon-btn dr-novel-delete"
                type="button"
                aria-label={t('删除', 'Delete') + ' ' + novel.title}
                onClick={() => setPendingDelete(novel)}
              >
                <Icon name="trash" size={15} />
              </button>
            </article>
          ))}
        </div>
      )}

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
          {t('」？', '"?')}
        </p>
        <p className="dr-modal-text dr-muted">
          {t(
            '会同时删除该项目的角色、剧本、资产、成片与同步记录，不可恢复。',
            'Characters, scripts, assets, renders and sync records for this project are removed permanently.'
          )}
        </p>
      </Modal>
    </div>
  )
}
