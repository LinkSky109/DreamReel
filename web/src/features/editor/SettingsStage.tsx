import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'

type Props = {
  project: Project
  styles: { id: string; name: string }[]
  onUpdated: (project: Project) => void
}

export function SettingsStage({ project, styles, onUpdated }: Props) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [name, setName] = useState(project.name)
  const [platform, setPlatform] = useState(project.platform || 'landscape')
  const [targetDuration, setTargetDuration] = useState(project.targetDuration || 60)
  const [style, setStyle] = useState(project.style || 'none')
  const [tags, setTags] = useState((project.tags ?? []).join(', '))
  const [deleteOpen, setDeleteOpen] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () =>
      api.updateProject(project.id, {
        name: name.trim(),
        platform,
        targetDuration: Number(targetDuration) || 60,
        style,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      }),
    onSuccess: (updated) => {
      onUpdated(updated)
      showToast(t('项目设置已保存', 'Settings saved'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      showToast(t('项目已移入回收站', 'Moved to recycle bin'))
      navigate('/projects')
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <div className="ed-stage-body ed-settings">
      <section className="dr-card ed-settings-card">
        <div className="ed-section-title-row">
          <strong>{t('项目设置', 'Project settings')}</strong>
          <Link className="dr-btn" to="/settings">
            <Icon name="settings" size={15} />
            {t('全局设置与模型配置', 'Global settings & models')}
          </Link>
        </div>

        <div className="dr-field">
          <label className="dr-label" htmlFor="settings-name">
            {t('项目名称', 'Project name')}
          </label>
          <input
            id="settings-name"
            className="dr-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>

        <div className="ed-settings-grid">
          <div className="dr-field">
            <label className="dr-label" htmlFor="settings-platform">
              {t('画幅', 'Aspect')}
            </label>
            <select
              id="settings-platform"
              className="dr-select"
              value={platform}
              onChange={(event) => setPlatform(event.target.value)}
            >
              <option value="landscape">{t('横屏 16:9', 'Landscape 16:9')}</option>
              <option value="portrait">{t('竖屏 9:16', 'Portrait 9:16')}</option>
            </select>
          </div>
          <div className="dr-field">
            <label className="dr-label" htmlFor="settings-duration">
              {t('目标时长（秒）', 'Target duration (s)')}
            </label>
            <input
              id="settings-duration"
              type="number"
              min={5}
              max={300}
              className="dr-input"
              value={targetDuration}
              onChange={(event) => setTargetDuration(Number(event.target.value) || 0)}
            />
          </div>
          <div className="dr-field">
            <label className="dr-label" htmlFor="settings-style">
              {t('视觉风格', 'Visual style')}
            </label>
            <select
              id="settings-style"
              className="dr-select"
              value={style}
              onChange={(event) => setStyle(event.target.value)}
            >
              <option value="none">{t('无风格', 'No style')}</option>
              {styles.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="dr-field">
          <label className="dr-label" htmlFor="settings-tags">
            {t('标签（逗号分隔）', 'Tags (comma separated)')}
          </label>
          <input
            id="settings-tags"
            className="dr-input"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder={t('例如：科幻, 火星, 短片', 'e.g. sci-fi, mars, short')}
          />
        </div>

        <p className="dr-hint">
          {t(
            '公开分享、评论权限在「协作」页设置；角色一致性由角色锁定与参考图保证。',
            'Sharing lives in Collaboration; consistency is handled by character locks.'
          )}
        </p>

        <div className="ed-settings-actions">
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            disabled={saveMutation.isPending || !name.trim()}
            onClick={() => saveMutation.mutate()}
          >
            <Icon name="check" size={15} />
            {saveMutation.isPending ? t('保存中…', 'Saving…') : t('保存设置', 'Save')}
          </button>
        </div>
      </section>

      <section className="dr-card ed-settings-danger">
        <div>
          <strong>{t('删除项目', 'Delete project')}</strong>
          <div className="dr-hint">
            {t('移入回收站，30 天内可恢复。', 'Moves to the recycle bin for 30 days.')}
          </div>
        </div>
        <button type="button" className="dr-btn dr-btn-danger" onClick={() => setDeleteOpen(true)}>
          {t('删除项目', 'Delete project')}
        </button>
      </section>

      <Modal
        open={deleteOpen}
        title={t('删除项目', 'Delete project')}
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setDeleteOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-danger"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? t('删除中…', 'Deleting…') : t('移入回收站', 'Move to recycle bin')}
            </button>
          </>
        }
      >
        <p className="dr-hint">
          {t(
            `「${project.name}」将移入回收站，30 天内可恢复。`,
            `“${project.name}” will be moved to the recycle bin.`
          )}
        </p>
      </Modal>
    </div>
  )
}
