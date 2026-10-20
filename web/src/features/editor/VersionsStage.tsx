import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project, ProjectVersion, VersionCompare } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import {relativeTime, pluralize } from '../../lib/format'

type Props = {
  project: Project
}

export function VersionsStage({ project }: Props) {
  const { t, lang } = useLang()
  const queryClient = useQueryClient()
  const [saveOpen, setSaveOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [rollbackTarget, setRollbackTarget] = useState<ProjectVersion | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProjectVersion | null>(null)
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [compare, setCompare] = useState<VersionCompare | null>(null)

  const versionsQuery = useQuery({
    queryKey: ['versions', project.id],
    queryFn: () => api.getVersions(project.id),
    staleTime: 5_000,
  })

  const versions = useMemo(() => versionsQuery.data?.items ?? [], [versionsQuery.data])

  useEffect(() => {
    if (versions.length >= 2 && !fromId && !toId) {
      setToId(versions[0].id)
      setFromId(versions[1].id)
    }
  }, [versions, fromId, toId])

  const saveMutation = useMutation({
    mutationFn: () =>
      api.saveVersion(project.id, {
        label: label.trim() || undefined,
        description: description.trim() || undefined,
      }),
    onSuccess: () => {
      setSaveOpen(false)
      setLabel('')
      setDescription('')
      void queryClient.invalidateQueries({ queryKey: ['versions', project.id] })
      showToast(t('版本已保存', 'Version saved'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => api.rollbackVersion(project.id, versionId),
    onSuccess: () => {
      showToast(t('已回滚，正在重新加载项目', 'Rolled back; reloading'))
      window.setTimeout(() => window.location.reload(), 500)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (versionId: string) => api.deleteVersion(project.id, versionId),
    onSuccess: () => {
      setDeleteTarget(null)
      void queryClient.invalidateQueries({ queryKey: ['versions', project.id] })
      showToast(t('版本已删除', 'Version deleted'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const compareMutation = useMutation({
    mutationFn: () => api.compareVersions(project.id, fromId, toId),
    onSuccess: (result) => setCompare(result),
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <div className="ed-stage-body">
      <section className="dr-card ed-versions-head">
        <div>
          <strong>{t('版本历史', 'Versions')}</strong>
          <div className="dr-hint">
            {t(
              '保存当前项目快照；回滚会先自动保存当前状态，再恢复目标版本。',
              'Snapshots are saved; rollback backs up the current state first.'
            )}
          </div>
        </div>
        <button type="button" className="dr-btn dr-btn-primary" onClick={() => setSaveOpen(true)}>
          <Icon name="plus" size={15} />
          {t('保存当前版本', 'Save version')}
        </button>
      </section>

      {versions.length >= 2 ? (
        <section className="dr-card ed-compare-bar">
          <strong>{t('版本对比', 'Compare')}</strong>
          <select className="dr-select" value={fromId} onChange={(event) => setFromId(event.target.value)}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                v{version.versionNumber} · {version.label}
              </option>
            ))}
          </select>
          <span className="dr-hint">→</span>
          <select className="dr-select" value={toId} onChange={(event) => setToId(event.target.value)}>
            {versions.map((version) => (
              <option key={version.id} value={version.id}>
                v{version.versionNumber} · {version.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dr-btn"
            disabled={!fromId || !toId || fromId === toId || compareMutation.isPending}
            onClick={() => compareMutation.mutate()}
          >
            {t('对比', 'Compare')}
          </button>
        </section>
      ) : null}

      {versionsQuery.isLoading ? (
        <div className="dr-card dr-state" style={{ padding: 40 }}>{t('加载中…', 'Loading…')}</div>
      ) : versionsQuery.isError ? (
        <div className="dr-card dr-state">
          <div className="dr-state-title">{t('版本加载失败', 'Failed to load versions')}</div>
          <div>{(versionsQuery.error as Error).message}</div>
          <button type="button" className="dr-btn" onClick={() => versionsQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : versions.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 52 }}>
          <div className="dr-state-icon">
            <Icon name="file-text" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有版本', 'No versions yet')}</div>
          <div>{t('保存一个版本，之后可回滚或对比。', 'Save a version to roll back or compare later.')}</div>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => setSaveOpen(true)}>
            {t('保存当前版本', 'Save version')}
          </button>
        </div>
      ) : (
        <div className="ed-version-list">
          {versions.map((version, index) => (
            <article className="dr-card ed-version-card" key={version.id}>
              <div className="ed-version-no">v{version.versionNumber}</div>
              <div className="ed-version-body">
                <div className="ed-version-title">
                  {version.label}
                  {index === 0 ? (
                    <span className="dr-status is-generating">
                      <span className="dr-dot" />
                      {t('最新', 'Latest')}
                    </span>
                  ) : null}
                  {version.auto ? <span className="dr-tag">{t('自动', 'Auto')}</span> : null}
                </div>
                {version.description ? <p className="ed-version-desc">{version.description}</p> : null}
                <div className="ed-version-meta">
                  {relativeTime(version.createdAt, lang)} · {version.shotCount ?? 0} {t('镜', pluralize(version.shotCount ?? 0, 'shot'))} ·{' '}
                  {version.completedShots ?? 0} {t('已完成', 'done')} · {version.characterCount ?? 0}{' '}
                  {t('角色', 'characters')}
                </div>
              </div>
              <div className="ed-version-actions">
                <button
                  type="button"
                  className="dr-btn"
                  onClick={() => setRollbackTarget(version)}
                  disabled={index === 0}
                  title={index === 0 ? t('当前版本无需回滚', 'Already latest') : undefined}
                >
                  {t('回滚', 'Rollback')}
                </button>
                <button
                  type="button"
                  className="dr-btn dr-btn-danger"
                  onClick={() => setDeleteTarget(version)}
                >
                  {t('删除', 'Delete')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={saveOpen}
        title={t('保存当前版本', 'Save version')}
        onClose={() => setSaveOpen(false)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setSaveOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? t('保存中…', 'Saving…') : t('保存', 'Save')}
            </button>
          </>
        }
      >
        <div className="dr-field">
          <label className="dr-label" htmlFor="version-label">
            {t('版本名称（可选）', 'Label (optional)')}
          </label>
          <input
            id="version-label"
            className="dr-input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t('例如：第二幕定稿', 'e.g. Act 2 final')}
          />
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="version-description">
            {t('说明（可选）', 'Description (optional)')}
          </label>
          <textarea
            id="version-description"
            className="dr-input"
            style={{ minHeight: 72, padding: '8px 10px', resize: 'vertical' }}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(rollbackTarget)}
        title={t('回滚版本', 'Roll back')}
        onClose={() => setRollbackTarget(null)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setRollbackTarget(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-danger"
              disabled={rollbackMutation.isPending}
              onClick={() => rollbackTarget && rollbackMutation.mutate(rollbackTarget.id)}
            >
              {t(
                `回滚到 v${rollbackTarget?.versionNumber ?? ''}`,
                `Roll back to v${rollbackTarget?.versionNumber ?? ''}`
              )}
            </button>
          </>
        }
      >
        <p className="dr-hint">
          {t(
            '当前状态会先自动保存为新版本，再恢复目标版本；页面会重新加载。',
            'The current state is backed up first, then the target version is restored.'
          )}
        </p>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title={t('删除版本', 'Delete version')}
        onClose={() => setDeleteTarget(null)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setDeleteTarget(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {t('删除', 'Delete')}
            </button>
          </>
        }
      >
        <p className="dr-hint">
          {t(`删除 v${deleteTarget?.versionNumber ?? ''}？此操作不可恢复。`, 'This cannot be undone.')}
        </p>
      </Modal>

      <Modal
        open={Boolean(compare)}
        title={t('版本对比', 'Version comparison')}
        onClose={() => setCompare(null)}
        width={640}
      >
        {compare ? (
          <div className="ed-compare">
            <div className="dr-hint">
              v{compare.version1.versionNumber} → v{compare.version2.versionNumber}
            </div>
            <ul className="ed-list">
              <li>{t('名称', 'Name')}: {compare.differences.name ? t('已变化', 'changed') : t('未变化', 'same')}</li>
              <li>{t('剧本', 'Script')}: {compare.differences.script ? t('已变化', 'changed') : t('未变化', 'same')}</li>
              <li>{t('风格', 'Style')}: {compare.differences.style ? t('已变化', 'changed') : t('未变化', 'same')}</li>
              <li>
                {t('镜头', 'Shots')}: {compare.differences.shots.from} → {compare.differences.shots.to}
                {compare.differences.shots.completedChanged
                  ? `（${compare.differences.shots.completedFrom} → ${compare.differences.shots.completedTo} ${t('已完成', 'done')}）`
                  : ''}
              </li>
              <li>
                {t('角色', 'Characters')}: {compare.differences.characters.from} →{' '}
                {compare.differences.characters.to}
              </li>
            </ul>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
