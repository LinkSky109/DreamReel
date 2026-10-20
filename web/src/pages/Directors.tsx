import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import type { ApplyDirectorResult, DirectorProfile } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Directors.css'
import { pluralize } from '../lib/format'

export function DirectorsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const [selected, setSelected] = useState<DirectorProfile | null>(null)
  const [projectId, setProjectId] = useState('')
  const [result, setResult] = useState<ApplyDirectorResult | null>(null)

  const directorsQuery = useQuery({ queryKey: ['directors'], queryFn: () => api.listDirectors() })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'director-targets'],
    queryFn: () => api.listProjects({ limit: 200, archived: 'active' }),
  })

  const directors = directorsQuery.data?.items ?? []
  const projects = useMemo(
    () => (projectsQuery.data?.items ?? []).filter((project) => !project.isArchived),
    [projectsQuery.data]
  )
  const project = projects.find((item) => item.id === projectId)
  const lockedCount = project?.shots?.filter((shot) => shot.locked).length ?? 0

  const apply = useMutation({
    mutationFn: () => api.applyDirector(selected!.id, projectId),
    onSuccess: (data) => {
      setResult(data)
      showToast(
        data.skippedCount
          ? t(`已编排 ${data.appliedCount} 镜，跳过 ${data.skippedCount} 个锁定镜头`, `Orchestrated ${data.appliedCount}, skipped ${data.skippedCount} locked`)
          : t(`已编排 ${data.appliedCount} 个镜头`, `Orchestrated ${data.appliedCount} shots`),
        'success'
      )
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const disable = useMutation({
    mutationFn: () => api.disableDirector(projectId),
    onSuccess: () => {
      showToast(t('已关闭导演模式，已生成的指导仍保留', 'Director mode disabled; guidance is kept'), 'success')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const open = (director: DirectorProfile) => {
    setSelected(director)
    setResult(null)
  }

  return (
    <div className="dr-page directors-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Directors</p>
          <h1>{t('导演模式', 'Director mode')}</h1>
          <p className="projects-lead">
            {t('选择一位导演作为创作顾问，把运镜、节奏、表演与光影一次编排进分镜。已锁定镜头不会被改写。', 'Apply a director’s camera, pacing, performance and lighting language to your storyboard. Locked shots stay untouched.')}
          </p>
        </div>
        {directorsQuery.data ? <span className="directors-count">{directors.length} {t('位导演', 'directors')}</span> : null}
      </div>

      {directorsQuery.isLoading ? (
        <div className="director-grid">{[0, 1, 2, 3].map((key) => <div className="dr-skeleton director-skeleton" key={key} />)}</div>
      ) : directorsQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('导演档案加载失败', 'Failed to load directors')}：{(directorsQuery.error as Error).message}</p>
          <button className="dr-btn" onClick={() => directorsQuery.refetch()}>{t('重试', 'Retry')}</button>
        </div>
      ) : (
        <div className="director-grid">
          {directors.map((director, index) => (
            <article className="director-card" key={director.id}>
              <div className="director-card-head">
                <span className="director-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="director-era">{director.era}</span>
              </div>
              <div className="director-name-row">
                <h2>{director.name}</h2>
                <span>{director.tagline}</span>
              </div>
              <p className="director-statement">{director.statement}</p>
              <dl className="director-specs">
                <div>
                  <dt>{t('运镜', 'Camera')}</dt>
                  <dd>{director.camera.style}</dd>
                </div>
                <div>
                  <dt>{t('节奏', 'Pacing')}</dt>
                  <dd>{director.pacing.description}</dd>
                </div>
                <div>
                  <dt>{t('表演', 'Performance')}</dt>
                  <dd>{director.performance.style}</dd>
                </div>
              </dl>
              <div className="director-moves">
                {director.camera.moves.slice(0, 3).map((move) => <span key={move}>{move}</span>)}
              </div>
              <button type="button" className="dr-btn director-open" onClick={() => open(director)}>
                {t('查看档案并应用', 'View profile and apply')}
                <Icon name="arrow-right" size={14} />
              </button>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        title={selected?.name ?? ''}
        width={760}
        onClose={() => {
          setSelected(null)
          setResult(null)
        }}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setSelected(null)}>{t('关闭', 'Close')}</button>
            {project?.directorMode?.enabled ? (
              <button className="dr-btn" type="button" disabled={disable.isPending} onClick={() => disable.mutate()}>
                {disable.isPending ? t('关闭中…', 'Disabling…') : t('关闭导演模式', 'Disable director mode')}
              </button>
            ) : null}
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={!projectId || apply.isPending}
              onClick={() => apply.mutate()}
            >
              {apply.isPending ? t('编排中…', 'Orchestrating…') : t('应用并编排分镜', 'Apply to shots')}
            </button>
          </>
        }
      >
        {selected ? (
          <div className="director-detail">
            <div className="director-detail-meta">
              <span>{selected.era}</span>
              <span>{selected.tagline}</span>
            </div>
            <blockquote>{selected.statement}</blockquote>

            <div className="director-detail-grid">
              <section>
                <h3>{t('运镜偏好', 'Camera')}</h3>
                <p>{selected.camera.style}</p>
                <div className="director-moves">{selected.camera.moves.map((move) => <span key={move}>{move}</span>)}</div>
              </section>
              <section>
                <h3>{t('节奏', 'Pacing')}</h3>
                <p>{selected.pacing.description}</p>
                <small>{selected.pacing.tempo} · {selected.pacing.shotDurationBias > 0 ? '+' : ''}{selected.pacing.shotDurationBias}s</small>
              </section>
              <section>
                <h3>{t('表演指导', 'Performance')}</h3>
                <p>{selected.performance.style}</p>
                <ul>{selected.performance.cues.map((cue) => <li key={cue}>{cue}</li>)}</ul>
              </section>
              <section>
                <h3>{t('色调光影', 'Lighting')}</h3>
                <p>{selected.colorLighting.lighting}</p>
                <small>{selected.colorLighting.palette} · {selected.colorLighting.description}</small>
              </section>
            </div>

            <div className="director-music">
              <Icon name="message" size={13} />
              {t('配乐情绪建议', 'Music mood')}：{selected.musicMood}
              <span>{t('仅建议，不自动生成配乐', 'Suggestion only')}</span>
            </div>

            <section className="director-apply">
              <h3>{t('应用到项目', 'Apply to project')}</h3>
              {projectsQuery.isLoading ? (
                <div className="dr-skeleton" style={{ height: 38 }} />
              ) : projects.length === 0 ? (
                <div className="director-empty">
                  <p>{t('还没有可编排的项目，先创建一个短片项目。', 'No projects yet. Create a short first.')}</p>
                  <button className="dr-btn" type="button" onClick={() => navigate('/projects?create=1')}>
                    {t('新建项目', 'New project')}
                  </button>
                </div>
              ) : (
                <>
                  <label className="dr-field">
                    <span>{t('选择项目', 'Project')}</span>
                    <select
                      className="dr-input"
                      value={projectId}
                      onChange={(event) => {
                        setProjectId(event.target.value)
                        setResult(null)
                      }}
                    >
                      <option value="">{t('请选择项目', 'Select a project')}</option>
                      {projects.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {item.shots?.length ?? 0} {t('镜', pluralize(item.shots?.length ?? 0, 'shot'))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="director-hint">
                    <Icon name="shield" size={13} />
                    {t('仅编排未锁定镜头', 'Only unlocked shots are orchestrated')}
                    {lockedCount > 0 ? ` · ${lockedCount} ${t('个锁定镜头将跳过', 'locked shots will be skipped')}` : ''}
                  </p>
                </>
              )}

              {result ? (
                <div className="director-result">
                  <div className="director-result-stats">
                    <span><strong>{result.appliedCount}</strong>{t(' 镜已编排', ' orchestrated')}</span>
                    <span><strong>{result.skippedCount}</strong>{t(' 镜已跳过', ' skipped')}</span>
                  </div>
                  {result.skippedCount > 0 ? (
                    <p className="director-hint">
                      <Icon name="shield" size={13} />
                      {t('锁定镜头保留原运镜、时长与指导。', 'Locked shots kept their camera, duration and guidance.')}
                    </p>
                  ) : null}
                  <div className="director-guidance">
                    <div className="director-guidance-head">
                      <span>#</span><span>{t('运镜', 'Camera')}</span><span>{t('时长', 'Duration')}</span><span>{t('表演指导', 'Guidance')}</span>
                    </div>
                    {result.guidance.map((item) => (
                      <div className="director-guidance-row" key={item.index}>
                        <span>{item.index + 1}</span>
                        <span>{item.cameraMovement}</span>
                        <span>{item.duration}s</span>
                        <span>{item.directorGuidance}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
