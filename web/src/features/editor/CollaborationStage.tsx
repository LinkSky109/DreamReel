import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { relativeTime } from '../../lib/format'
import { buildShareUrl } from './utils'

type Props = {
  project: Project
}

export function CollaborationStage({ project }: Props) {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [userName, setUserName] = useState('匿名用户')
  const [content, setContent] = useState('')
  const [shotId, setShotId] = useState('')
  const [sharePublic, setSharePublic] = useState(false)
  const [allowComments, setAllowComments] = useState(true)

  const commentsQuery = useQuery({
    queryKey: ['collab', 'comments', project.id],
    queryFn: () => api.getComments(project.id),
    staleTime: 5_000,
  })
  const statsQuery = useQuery({
    queryKey: ['collab', 'stats', project.id],
    queryFn: () => api.getCommentStats(project.id),
    staleTime: 5_000,
  })
  const shareQuery = useQuery({
    queryKey: ['collab', 'share', project.id],
    queryFn: () => api.getShareSettings(project.id),
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!shareQuery.data) return
    setSharePublic(shareQuery.data.isPublic)
    setAllowComments(shareQuery.data.allowComments)
  }, [shareQuery.data])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['collab', 'comments', project.id] })
    void queryClient.invalidateQueries({ queryKey: ['collab', 'stats', project.id] })
  }

  const addMutation = useMutation({
    mutationFn: () =>
      api.addComment(project.id, {
        content: content.trim(),
        userName: userName.trim() || '匿名用户',
        shotId: shotId || null,
      }),
    onSuccess: () => {
      setContent('')
      refresh()
      showToast(t('评论已发送', 'Comment posted'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const resolveMutation = useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) =>
      api.resolveComment(project.id, id, resolved),
    onSuccess: refresh,
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteComment(project.id, id),
    onSuccess: () => {
      refresh()
      showToast(t('评论已删除', 'Comment deleted'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const shareMutation = useMutation({
    mutationFn: () =>
      api.updateShareSettings(project.id, {
        isPublic: sharePublic,
        allowComments,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['collab', 'share', project.id] })
      showToast(t('分享设置已保存', 'Share settings saved'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const comments = commentsQuery.data?.items ?? []
  const stats = statsQuery.data
  const share = shareQuery.data
  const shareToken = share?.shareToken
  const shareUrl = shareToken
    ? buildShareUrl(window.location.origin, window.location.pathname, shareToken)
    : ''

  return (
    <div className="ed-stage-body">
      <div className="ed-collab-stats">
        {[
          { label: t('评论总数', 'Total'), value: stats?.total ?? comments.length },
          { label: t('已解决', 'Resolved'), value: stats?.resolved ?? comments.filter((c) => c.resolved).length },
          { label: t('待处理', 'Open'), value: stats?.open ?? stats?.unresolved ?? comments.filter((c) => !c.resolved).length },
        ].map((item) => (
          <div className="dr-card dr-stat" key={item.label}>
            <span className="dr-stat-value">{item.value}</span>
            <span className="dr-stat-label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="ed-collab-layout">
        <section className="dr-card ed-collab-comments">
          <div className="ed-section-title-row">
            <strong>{t('评论', 'Comments')}</strong>
            <span className="dr-hint">
              {t('点击镜头可关联评论', 'Link comments to shots')}
            </span>
          </div>

          {commentsQuery.isLoading ? (
            <div className="dr-state" style={{ padding: 24 }}>{t('加载中…', 'Loading…')}</div>
          ) : commentsQuery.isError ? (
            <div className="dr-state" style={{ padding: 24 }}>
              {(commentsQuery.error as Error).message}
            </div>
          ) : comments.length === 0 ? (
            <div className="dr-state" style={{ padding: 32 }}>
              <div className="dr-state-title">{t('还没有评论', 'No comments yet')}</div>
              <div>{t('在右侧写第一条评论。', 'Write the first comment.')}</div>
            </div>
          ) : (
            <div className="ed-comment-list">
              {comments.map((comment) => {
                const shot = project.shots?.find((item) => item.id === comment.shotId)
                return (
                  <article
                    className={`ed-comment${comment.resolved ? ' is-resolved' : ''}`}
                    key={comment.id}
                  >
                    <div className="ed-comment-head">
                      <strong>{comment.userName || t('匿名用户', 'Anonymous')}</strong>
                      {shot ? (
                        <span className="dr-tag">
                          S{String(shot.index + 1).padStart(2, '0')}
                        </span>
                      ) : null}
                      <span className="dr-hint">{relativeTime(comment.createdAt)}</span>
                      {comment.resolved ? (
                        <span className="dr-status is-completed">
                          <span className="dr-dot" />
                          {t('已解决', 'Resolved')}
                        </span>
                      ) : null}
                    </div>
                    <p className="ed-comment-content">{comment.content}</p>
                    <div className="ed-comment-actions">
                      <button
                        type="button"
                        className="dr-btn"
                        onClick={() => resolveMutation.mutate({ id: comment.id, resolved: !comment.resolved })}
                      >
                        {comment.resolved ? t('重新打开', 'Reopen') : t('标记解决', 'Resolve')}
                      </button>
                      <button
                        type="button"
                        className="dr-btn dr-btn-danger"
                        onClick={() => {
                          if (window.confirm(t('删除这条评论？', 'Delete this comment?'))) {
                            deleteMutation.mutate(comment.id)
                          }
                        }}
                      >
                        {t('删除', 'Delete')}
                      </button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <aside className="ed-collab-side">
          <section className="dr-card ed-collab-new">
            <strong>{t('写评论', 'New comment')}</strong>
            <div className="dr-field">
              <label className="dr-label" htmlFor="comment-name">
                {t('昵称', 'Name')}
              </label>
              <input
                id="comment-name"
                className="dr-input"
                value={userName}
                onChange={(event) => setUserName(event.target.value)}
              />
            </div>
            <div className="dr-field">
              <label className="dr-label" htmlFor="comment-shot">
                {t('关联镜头（可选）', 'Link shot (optional)')}
              </label>
              <select
                id="comment-shot"
                className="dr-select"
                value={shotId}
                onChange={(event) => setShotId(event.target.value)}
              >
                <option value="">{t('不关联', 'None')}</option>
                {(project.shots ?? []).map((shot) => (
                  <option key={shot.id} value={shot.id}>
                    S{String(shot.index + 1).padStart(2, '0')} · {(shot.description || '').slice(0, 20)}
                  </option>
                ))}
              </select>
            </div>
            <div className="dr-field">
              <label className="dr-label" htmlFor="comment-content">
                {t('内容', 'Comment')}
              </label>
              <textarea
                id="comment-content"
                className="dr-input"
                style={{ minHeight: 88, padding: '8px 10px', resize: 'vertical' }}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={t('写下具体、可执行的反馈…', 'Specific, actionable feedback…')}
              />
            </div>
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              disabled={addMutation.isPending || !content.trim()}
              onClick={() => addMutation.mutate()}
            >
              <Icon name="message" size={15} />
              {addMutation.isPending ? t('发送中…', 'Posting…') : t('发送评论', 'Post')}
            </button>
          </section>

          <section className="dr-card ed-share-card">
            <strong>{t('分享设置', 'Sharing')}</strong>
            <label className="ed-check">
              <input
                type="checkbox"
                checked={sharePublic}
                onChange={(event) => setSharePublic(event.target.checked)}
              />
              {t('公开访问', 'Public access')}
            </label>
            <label className="ed-check">
              <input
                type="checkbox"
                checked={allowComments}
                onChange={(event) => setAllowComments(event.target.checked)}
              />
              {t('允许评论', 'Allow comments')}
            </label>
            <button
              type="button"
              className="dr-btn"
              disabled={shareMutation.isPending}
              onClick={() => shareMutation.mutate()}
            >
              {t('保存分享设置', 'Save sharing')}
            </button>
            {sharePublic && shareUrl ? (
              <div className="ed-share-link">
                <code>{shareUrl}</code>
                <button
                  type="button"
                  className="dr-btn"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(shareUrl)
                      showToast(t('分享链接已复制', 'Share link copied'))
                    } catch {
                      showToast(t('复制失败', 'Copy failed'), 'error')
                    }
                  }}
                >
                  {t('复制链接', 'Copy link')}
                </button>
              </div>
            ) : (
              <span className="dr-hint">
                {t('开启公开访问后可生成分享链接。', 'Enable public access to create a link.')}
              </span>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
