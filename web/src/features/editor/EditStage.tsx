import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { EditPlan, EditRenderResult, Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { planShotBlocks, planVoiceBlocks } from './audio'

type Props = {
  project: Project
  onSaveState: (state: 'saved' | 'saving' | 'error') => void
}

export function EditStage({ project, onSaveState }: Props) {
  const { t } = useLang()
  const queryClient = useQueryClient()

  const profilesQuery = useQuery({
    queryKey: ['edit', 'profiles'],
    queryFn: () => api.getEditProfiles(),
    staleTime: 300_000,
  })
  const bgmQuery = useQuery({
    queryKey: ['audio', 'bgm'],
    queryFn: () => api.listBgm(),
    staleTime: 300_000,
  })
  const supportQuery = useQuery({
    queryKey: ['edit', 'support', project.id],
    queryFn: () => api.getTransitionSupport(project.id),
    retry: false,
  })

  const [plan, setPlan] = useState<EditPlan | null>(project.editPlan ?? null)
  const [renderResult, setRenderResult] = useState<EditRenderResult | null>(null)
  const [profile, setProfile] = useState(project.editPlan?.profile ?? 'narrative')
  const [targetDuration, setTargetDuration] = useState(
    project.editPlan?.targetDuration ?? project.targetDuration ?? 30
  )
  const [bgmId, setBgmId] = useState(project.editPlan?.bgmId ?? project.audioConfig?.bgmId ?? '')

  const profiles = profilesQuery.data?.items ?? []
  const bgms = bgmQuery.data?.items ?? []
  const completedShots = (project.shots ?? []).filter(
    (shot) => shot.status === 'completed' && shot.videoUrl
  )

  const generateMutation = useMutation({
    mutationFn: () =>
      api.generateEditPlan({
        projectId: project.id,
        profile,
        targetDuration: Number(targetDuration) || project.targetDuration,
        bgmId: bgmId || null,
      }),
    onSuccess: async (nextPlan) => {
      setPlan(nextPlan)
      setRenderResult(null)
      onSaveState('saved')
      showToast(t('剪辑方案已生成', 'Edit plan generated'))
      try {
        const updated = await api.getProject(project.id)
        queryClient.setQueryData(['project', project.id], updated)
      } catch {
        // 项目刷新失败不影响方案展示
      }
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const clearMutation = useMutation({
    mutationFn: () => api.clearEditPlan(project.id),
    onSuccess: () => {
      setPlan(null)
      setRenderResult(null)
      queryClient.setQueryData<Project>(['project', project.id], (current) =>
        current ? { ...current, editPlan: null } : current
      )
      showToast(t('剪辑方案已清除', 'Edit plan cleared'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const renderMutation = useMutation({
    mutationFn: () => api.renderEditPlan(project.id),
    onSuccess: (result) => {
      setRenderResult(result)
      showToast(t('剪辑成片渲染完成', 'Rendered'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const videoBlocks = useMemo(() => (plan ? planShotBlocks(plan) : []), [plan])
  const voiceBlocks = useMemo(
    () => (plan ? planVoiceBlocks(plan, project.shots ?? []) : []),
    [plan, project.shots]
  )

  const effectiveBgm = plan?.bgmId ?? (bgmId || project.audioConfig?.bgmId || '')

  return (
    <div className="ed-stage-body">
      <section className="dr-card ed-edit-head">
        <div>
          <strong>{t('智能剪辑', 'Smart edit')}</strong>
          <div className="dr-hint">
            {t(
              `已就绪 ${completedShots.length} 个镜头；方案按节奏与目标时长分配镜头时长。`,
              `${completedShots.length} ready shots.`
            )}
          </div>
        </div>
        <span className={`dr-status ${supportQuery.data?.xfade ? 'is-completed' : ''}`}>
          <span className="dr-dot" />
          {supportQuery.data?.xfade
            ? t('xfade 交叉溶解可用', 'xfade available')
            : t('将降级为硬切', 'Falls back to cuts')}
        </span>
      </section>

      <section className="dr-card ed-edit-controls">
        <div className="ed-profile-chips" role="group" aria-label={t('剪辑风格', 'Edit profile')}>
          {profiles.map((item) => (
            <button
              key={item.id}
              type="button"
              className="dr-chip"
              aria-pressed={profile === item.id}
              onClick={() => setProfile(item.id)}
              title={item.description}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="ed-edit-fields">
          <div className="dr-field">
            <label className="dr-label" htmlFor="edit-target">
              {t('目标时长（秒）', 'Target duration (s)')}
            </label>
            <input
              id="edit-target"
              type="number"
              min={3}
              max={180}
              className="dr-input"
              value={targetDuration}
              onChange={(event) => setTargetDuration(Number(event.target.value) || 0)}
            />
          </div>
          <div className="dr-field">
            <label className="dr-label" htmlFor="edit-bgm">
              {t('BGM（用于 BPM 切点）', 'BGM (for beat grid)')}
            </label>
            <select
              id="edit-bgm"
              className="dr-select"
              value={bgmId}
              onChange={(event) => setBgmId(event.target.value)}
            >
              <option value="">{t('不指定 BGM', 'No BGM')}</option>
              {bgms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {item.available === false ? t('（文件缺失）', ' (missing)') : ''}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            disabled={generateMutation.isPending || completedShots.length === 0}
            onClick={() => generateMutation.mutate()}
          >
            <Icon name="sparkles" size={15} />
            {generateMutation.isPending ? t('生成中…', 'Generating…') : t('生成剪辑方案', 'Generate plan')}
          </button>
          <button
            type="button"
            className="dr-btn"
            disabled={!plan || clearMutation.isPending}
            onClick={() => clearMutation.mutate()}
          >
            {t('清除方案', 'Clear plan')}
          </button>
        </div>
      </section>

      {!plan ? (
        <div className="dr-card dr-state" style={{ padding: 52 }}>
          <div className="dr-state-icon">
            <Icon name="clapper" size={22} />
          </div>
          <div className="dr-state-title">{t('还没有剪辑方案', 'No edit plan yet')}</div>
          <div>
            {completedShots.length === 0
              ? t('请先在「分镜」生成至少一个镜头。', 'Generate at least one shot first.')
              : t('选择节奏与目标时长，生成方案后即可渲染成片。', 'Pick a profile and generate a plan.')}
          </div>
        </div>
      ) : (
        <>
          <section className="dr-card ed-edit-plan">
            <div className="ed-section-title-row">
              <div>
                <strong>{plan.summary}</strong>
                <div className="dr-hint">
                  {plan.bpm ? `${plan.bpm} BPM · beat ${plan.beatGrid?.toFixed(2)}s · ` : ''}
                  {plan.transition === 'fade' ? t('淡入淡出', 'Fade') : t('硬切', 'Cut')} ·{' '}
                  {t('总时长', 'Total')} {plan.totalDuration}s
                </div>
              </div>
              <button
                type="button"
                className="dr-btn dr-btn-primary"
                disabled={renderMutation.isPending}
                onClick={() => renderMutation.mutate()}
              >
                <Icon name="play" size={15} />
                {renderMutation.isPending ? t('渲染中…', 'Rendering…') : t('渲染剪辑成片', 'Render')}
              </button>
            </div>

            <div className="ed-audio-lanes" aria-label={t('剪辑时间轴', 'Edit timeline')}>
              <div className="ed-lane">
                <span className="ed-lane-label">{t('视频', 'Video')}</span>
                <div className="ed-lane-track">
                  {videoBlocks.map(({ shot, left, width }) => (
                    <span
                      className="ed-lane-block is-video"
                      key={shot.shotId}
                      style={{ left, width }}
                      title={`S${shot.index + 1} · ${shot.duration}s · ${shot.reason}`}
                    >
                      S{String(shot.index + 1).padStart(2, '0')}
                    </span>
                  ))}
                </div>
              </div>
              <div className="ed-lane">
                <span className="ed-lane-label">{t('配音', 'Voice')}</span>
                <div className="ed-lane-track">
                  {voiceBlocks.length === 0 ? (
                    <span className="ed-lane-empty">{t('该方案镜头暂无台词/旁白', 'No dialogue in this plan')}</span>
                  ) : (
                    voiceBlocks.map((block) => (
                      <span
                        className="ed-lane-block is-voice"
                        key={block.shotId}
                        style={{ left: block.left, width: block.width }}
                        title={block.text}
                      />
                    ))
                  )}
                </div>
              </div>
              <div className="ed-lane">
                <span className="ed-lane-label">BGM</span>
                <div className="ed-lane-track">
                  {effectiveBgm ? (
                    <span className="ed-lane-block is-bgm" style={{ left: 0, width: '100%' }}>
                      {effectiveBgm}
                    </span>
                  ) : (
                    <span className="ed-lane-empty">{t('未指定 BGM', 'No BGM')}</span>
                  )}
                </div>
              </div>
            </div>
            <p className="dr-hint">
              {t(
                '时间轴按方案时长比例展示轨道块；音频波形需服务端分析，当前不渲染伪造波形。',
                'Track blocks are proportional; waveforms are not fabricated.'
              )}
            </p>
          </section>

          <section className="dr-card" style={{ overflow: 'auto' }}>
            <table className="dr-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('镜头', 'Shot')}</th>
                  <th>{t('入/出', 'In/Out')}</th>
                  <th>{t('时长', 'Duration')}</th>
                  <th>{t('转场', 'Transition')}</th>
                  <th>{t('说明', 'Reason')}</th>
                </tr>
              </thead>
              <tbody>
                {plan.shots.map((shot) => (
                  <tr key={shot.shotId}>
                    <td>S{String(shot.index + 1).padStart(2, '0')}</td>
                    <td>
                      <code>{shot.shotId.slice(0, 10)}</code>
                    </td>
                    <td>{shot.in}s → {shot.out}s</td>
                    <td>{shot.duration}s</td>
                    <td>{shot.transition === 'fade' ? t('淡入淡出', 'Fade') : t('硬切', 'Cut')}</td>
                    <td>{shot.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {renderResult ? (
            <section className="dr-card ed-edit-render">
              <video
                controls
                src={renderResult.outputUrl}
                style={{ width: '100%', maxHeight: 420, borderRadius: 'var(--radius-md)', background: '#000' }}
              />
              <div className="dr-hint">
                {renderResult.shotCount ?? plan.shots.length} {t('个镜头', 'shots')} ·{' '}
                {Number(renderResult.duration ?? plan.totalDuration).toFixed(1)}s ·{' '}
                {renderResult.transitionApplied === 'xfade' ? 'xfade' : t('硬切', 'cuts')}
                {renderResult.transitionFallback ? t('（已降级）', ' (fallback)') : ''} ·{' '}
                {renderResult.hasAudio ? t('含音轨', 'with audio') : t('无音轨', 'no audio')}
                {' · '}
                <a href={renderResult.outputUrl} target="_blank" rel="noreferrer">
                  {t('下载', 'Download')}
                </a>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}
