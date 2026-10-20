import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { projectCover } from '../lib/media'
import { relativeTime, totalDuration } from '../lib/format'
import type { RecycleBinItem } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './RecycleBin.css'

export function RecycleBinPage() {
  const { t } = useLang()
  const queryClient = useQueryClient()
  const [pendingDelete, setPendingDelete] = useState<RecycleBinItem | null>(null)
  const [confirmEmpty, setConfirmEmpty] = useState(false)

  const dataQuery = useQuery({
    queryKey: ['recycle-bin'],
    queryFn: async () => {
      const [list, stats] = await Promise.all([api.getRecycleBin(50), api.getRecycleBinStats()])
      return { ...list, stats }
    },
  })

  const items = dataQuery.data?.items ?? []
  const total = dataQuery.data?.total ?? 0
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['recycle-bin'] })

  const restore = useMutation({
    mutationFn: (id: string) => api.restoreProject(id),
    onSuccess: () => {
      showToast(t('项目已恢复', 'Project restored'), 'success')
      refresh()
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.permanentlyDeleteProject(id),
    onSuccess: () => {
      showToast(t('项目已永久删除', 'Project permanently deleted'), 'success')
      setPendingDelete(null)
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const empty = useMutation({
    mutationFn: () => api.emptyRecycleBin(),
    onSuccess: (result) => {
      showToast(t(`已清空 ${result.deletedCount} 个项目`, `Deleted ${result.deletedCount} projects`), 'success')
      setConfirmEmpty(false)
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <div className="dr-page recycle-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Recycle bin</p>
          <h1>{t('回收站', 'Recycle bin')}</h1>
          <p className="projects-lead">
            {t(
              '已删除的项目会保留在这里，可恢复或永久删除。',
              'Deleted projects stay here until restored or permanently removed.'
            )}
          </p>
        </div>
        <div className="recycle-actions">
          <Link className="dr-btn" to="/projects">
            <Icon name="arrow-left" size={14} />
            {t('返回项目', 'Back to projects')}
          </Link>
          {total > 0 ? (
            <button className="dr-btn dr-btn-danger" type="button" onClick={() => setConfirmEmpty(true)}>
              {t('清空回收站', 'Empty bin')}
            </button>
          ) : null}
        </div>
      </div>

      {dataQuery.isLoading ? (
        <div className="recycle-list">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton" key={key} style={{ height: 88 }} />
          ))}
        </div>
      ) : dataQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('加载失败', 'Failed to load')}：{(dataQuery.error as Error).message}</p>
          <button className="dr-btn" type="button" onClick={() => dataQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : total === 0 ? (
        <div className="dr-card dr-state recycle-empty">
          <Icon name="trash" size={26} />
          <h3>{t('回收站是空的', 'Recycle bin is empty')}</h3>
          <p>{t('删除的项目会出现在这里，可随时恢复。', 'Deleted projects appear here and can be restored.')}</p>
          <Link className="dr-btn dr-btn-primary" to="/projects">
            {t('去项目库', 'Go to projects')}
          </Link>
        </div>
      ) : (
        <>
          <div className="recycle-stats">
            {t('共', 'Total')} <strong>{total}</strong> {t('个项目', 'projects')}
            {dataQuery.data?.stats?.newestDeletedAt ? (
              <span>· {t('最近删除', 'Newest')} {relativeTime(dataQuery.data.stats.newestDeletedAt)}</span>
            ) : null}
          </div>
          <div className="recycle-list">
            {items.map((item) => (
              <article className="dr-card recycle-item" key={item.id}>
                <div className="recycle-cover">
                  <img src={projectCover(item)} alt="" loading="lazy" />
                </div>
                <div className="recycle-info">
                  <h2>{item.name}</h2>
                  <p>{item.description || t('暂无描述', 'No description')}</p>
                  <div className="recycle-meta">
                    <span>{t('删除于', 'Deleted')} {item.deletedAt ? relativeTime(item.deletedAt) : '—'}</span>
                    <span>{item.shots?.length ?? 0} {t('镜', 'shots')}</span>
                    <span>{totalDuration(item)}s</span>
                    {item.style ? <span>{item.style}</span> : null}
                  </div>
                </div>
                <div className="recycle-item-actions">
                  <button className="dr-btn" type="button" disabled={restore.isPending} onClick={() => restore.mutate(item.id)}>
                    <Icon name="refresh" size={14} />
                    {t('恢复', 'Restore')}
                  </button>
                  <button className="dr-btn dr-btn-danger" type="button" onClick={() => setPendingDelete(item)}>
                    {t('永久删除', 'Delete forever')}
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      <Modal
        open={Boolean(pendingDelete)}
        title={t('永久删除项目', 'Delete project permanently')}
        onClose={() => (!remove.isPending ? setPendingDelete(null) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" disabled={remove.isPending} onClick={() => setPendingDelete(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-danger"
              type="button"
              disabled={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}
            >
              {remove.isPending ? t('删除中…', 'Deleting…') : t('确认永久删除', 'Delete forever')}
            </button>
          </>
        }
      >
        <p className="dr-modal-text">
          {t('「', '"')}
          <strong>{pendingDelete?.name}</strong>
          {t('」将被永久删除，无法恢复。', '" will be permanently deleted.')}
        </p>
      </Modal>

      <Modal
        open={confirmEmpty}
        title={t('清空回收站', 'Empty recycle bin')}
        onClose={() => (!empty.isPending ? setConfirmEmpty(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" disabled={empty.isPending} onClick={() => setConfirmEmpty(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button className="dr-btn dr-btn-danger" type="button" disabled={empty.isPending} onClick={() => empty.mutate()}>
              {empty.isPending ? t('清空中…', 'Emptying…') : t('确认清空', 'Empty bin')}
            </button>
          </>
        }
      >
        <p className="dr-modal-text">
          {t(`回收站内 ${total} 个项目将被永久删除，无法恢复。`, `${total} projects will be permanently deleted.`)}
        </p>
      </Modal>
    </div>
  )
}
