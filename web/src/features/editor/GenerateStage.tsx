import { useMutation } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project, Shot } from '../../domain/types'
import { Icon } from '../../components/Icon'
import {statusLabel, statusTone, pluralize } from '../../lib/format'
import { aspectRatioOf, totalDuration } from './utils'

type Props = {
  project: Project
  onRefresh: () => void
}

export function GenerateStage({ project, onRefresh }: Props) {
  const { t, lang } = useLang()
  const shots = project.shots ?? []
  const pending = shots.filter((shot) => shot.status === 'pending').length
  const generating = shots.filter((shot) => shot.status === 'generating').length
  const completed = shots.filter((shot) => shot.status === 'completed').length
  const failed = shots.filter((shot) => shot.status === 'failed').length
  const generatable = shots.filter(
    (shot) => !shot.locked && shot.status !== 'completed' && shot.status !== 'generating'
  )

  const singleMutation = useMutation({
    mutationFn: async (shot: Shot) => {
      if (shot.status === 'completed') {
        return api.regenerateVideo({ projectId: project.id, shotId: shot.id, styleId: project.style || 'none' })
      }
      return api.generateVideo({
        projectId: project.id,
        shotId: shot.id,
        prompt: shot.description,
        duration: shot.duration,
        aspectRatio: aspectRatioOf(project),
        styleId: project.style || 'none',
      })
    },
    onSuccess: (_result, shot) => {
      showToast(t(`S${String(shot.index + 1).padStart(2, '0')} 生成已启动`, 'Generation started'))
      onRefresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const batchMutation = useMutation({
    mutationFn: () => api.generateAllVideos(project.id, { styleId: project.style || 'none' }),
    onSuccess: () => {
      showToast(t(`已启动 ${generatable.length} 个未锁定镜头`, `${generatable.length} shots started`))
      onRefresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  return (
    <div className="ed-stage-body">
      <div className="ed-generate-summary">
        {[
          { label: t('待生成', 'Pending'), value: pending },
          { label: t('生成中', 'Generating'), value: generating },
          { label: t('已完成', 'Completed'), value: completed },
          { label: t('需重试', 'Failed'), value: failed },
        ].map((item) => (
          <div className="dr-card dr-stat" key={item.label}>
            <span className="dr-stat-value">{item.value}</span>
            <span className="dr-stat-label">{item.label}</span>
          </div>
        ))}
      </div>

      <div className="ed-generate-toolbar dr-card">
        <div>
          <strong>{t('生成队列', 'Generation queue')}</strong>
          <div className="dr-hint">
            {shots.length} {t('镜', pluralize(shots.length, 'shot'))} · {totalDuration(shots)}s ·{' '}
            {t('锁定镜头会被跳过', 'Locked shots are skipped')}
          </div>
        </div>
        <button
          type="button"
          className="dr-btn dr-btn-primary"
          disabled={generatable.length === 0 || batchMutation.isPending}
          onClick={() => batchMutation.mutate()}
        >
          <Icon name="sparkles" size={15} />
          {batchMutation.isPending
            ? t('提交中…', 'Starting…')
            : t(`批量生成（${generatable.length}）`, `Generate ${generatable.length}`)}
        </button>
      </div>

      {shots.length === 0 ? (
        <div className="dr-card dr-state" style={{ padding: 56 }}>
          <div className="dr-state-icon">
            <Icon name="sparkles" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有可生成的镜头', 'No shots to generate')}</div>
          <div>{t('先在「剧本」生成分镜，再回到这里批量生成。', 'Create a storyboard first.')}</div>
        </div>
      ) : (
        <div className="dr-card" style={{ overflow: 'auto' }}>
          <table className="dr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>{t('镜头', 'Shot')}</th>
                <th>{t('状态', 'Status')}</th>
                <th>{t('时长', 'Duration')}</th>
                <th>{t('角色', 'Characters')}</th>
                <th>{t('操作', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {shots.map((shot) => (
                <tr key={shot.id}>
                  <td>S{String(shot.index + 1).padStart(2, '0')}</td>
                  <td style={{ maxWidth: 360 }}>
                    <div className="ed-generate-desc">{shot.description || t('未填写描述', 'No description')}</div>
                  </td>
                  <td>
                    <span className={`dr-status ${statusTone(shot.status)}`}>
                      <span className="dr-dot" />
                      {statusLabel(shot.status, lang)}
                    </span>
                  </td>
                  <td>{shot.duration}s</td>
                  <td>
                    {shot.characterIds?.length
                      ? shot.characterIds
                          .map((characterId) => project.characters?.find((item) => item.id === characterId)?.name ?? characterId)
                          .join('、')
                      : '—'}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="dr-btn"
                        disabled={shot.locked || shot.status === 'generating' || singleMutation.isPending}
                        onClick={() => singleMutation.mutate(shot)}
                      >
                        {shot.status === 'completed' ? t('重新生成', 'Regenerate') : t('生成', 'Generate')}
                      </button>
                      {shot.videoUrl ? (
                        <a className="dr-btn" href={shot.videoUrl} target="_blank" rel="noreferrer">
                          {t('查看', 'View')}
                        </a>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
