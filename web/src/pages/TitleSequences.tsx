import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import type { Shot, TitleSequenceResult, TitleSequenceTemplate } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './TitleSequences.css'
import { pluralize } from '../lib/format'

function colorOf(value?: string) {
  return value?.replace(/^0x/, '#') ?? '#111111'
}

export function TitleSequencesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const [selected, setSelected] = useState<TitleSequenceTemplate | null>(null)
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [projectId, setProjectId] = useState('')
  const [result, setResult] = useState<TitleSequenceResult | null>(null)
  const [inserted, setInserted] = useState(false)

  const templatesQuery = useQuery({ queryKey: ['title-sequences'], queryFn: () => api.listTitleSequences() })
  const projectsQuery = useQuery({
    queryKey: ['projects', 'title-sequence-targets'],
    queryFn: () => api.listProjects({ limit: 200, archived: 'active' }),
  })

  const templates = templatesQuery.data?.items ?? []
  const projects = (projectsQuery.data?.items ?? []).filter((project) => !project.isArchived)

  const generate = useMutation({
    mutationFn: () => api.generateTitleSequence(selected!.id, { projectId, title: title.trim(), subtitle: subtitle.trim() }),
    onSuccess: (data) => {
      setResult(data)
      setInserted(false)
      if (!data.titleRendered) {
        showToast(t('视频已生成，但标题卡渲染失败，当前为纯色背景', 'Video generated, but title rendering failed'), 'error')
      } else {
        showToast(t('片头生成成功', 'Title sequence generated'), 'success')
      }
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const insert = useMutation({
    mutationFn: async () => {
      const project = await api.getProject(projectId)
      const shots = [...(project.shots ?? [])]
      const titleShot: Shot = {
        id: `title-${Date.now()}`,
        index: 0,
        description: `${t('片头', 'Title')}：${title.trim()}`,
        duration: result?.duration ?? 4,
        videoUrl: result?.videoUrl,
        status: 'completed',
        characterIds: [],
      }
      shots.unshift(titleShot)
      shots.forEach((shot, index) => { shot.index = index })
      return api.updateProject(projectId, { shots })
    },
    onSuccess: () => {
      setInserted(true)
      showToast(t('已插入项目片头', 'Title inserted into project'), 'success')
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const open = (template: TitleSequenceTemplate) => {
    setSelected(template)
    setTitle('')
    setSubtitle('')
    setProjectId('')
    setResult(null)
    setInserted(false)
  }

  const close = () => {
    setSelected(null)
    setResult(null)
  }

  return (
    <div className="dr-page title-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Title sequences</p>
          <h1>{t('创意片头', 'Title sequences')}</h1>
          <p className="projects-lead">
            {t('选择模板，填写片名与副标题，生成 3–5 秒电影感开场，并可插入项目最前面。', 'Pick a template, set the title and subtitle, then render a 3–5s opening and insert it into a project.')}
          </p>
        </div>
        {templatesQuery.data ? <span className="title-count">{templates.length} {t('套模板', 'templates')}</span> : null}
      </div>

      {templatesQuery.isLoading ? (
        <div className="title-grid">{[0, 1, 2].map((key) => <div className="dr-skeleton title-skeleton" key={key} />)}</div>
      ) : templatesQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('片头模板加载失败', 'Failed to load templates')}：{(templatesQuery.error as Error).message}</p>
          <button className="dr-btn" onClick={() => templatesQuery.refetch()}>{t('重试', 'Retry')}</button>
        </div>
      ) : (
        <div className="title-grid">
          {templates.map((template) => {
            const bg = colorOf(template.ffmpeg.bgColors[0])
            const ink = template.ffmpeg.titleColor
            return (
              <article className={`title-card title-${template.id}`} key={template.id}>
                <div className="title-preview" style={{ background: bg, color: ink }}>
                  <span className="title-preview-name">片名 / TITLE</span>
                  <span className="title-preview-sub">A DREAM REEL STORY</span>
                  <span className="title-preview-rule" />
                </div>
                <div className="title-body">
                  <div className="title-name-row">
                    <h2>{template.name}</h2>
                    <span>{template.ffmpeg.duration}s · {template.ffmpeg.resolution}</span>
                  </div>
                  <p>{template.visualDescription}</p>
                  <div className="title-music">
                    <Icon name="message" size={12} />
                    {template.musicMood}
                  </div>
                  <button type="button" className="dr-btn title-use" onClick={() => open(template)}>
                    {t('使用此模板', 'Use template')}
                    <Icon name="arrow-right" size={14} />
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <Modal
        open={Boolean(selected)}
        title={selected ? `${selected.name} · ${t('生成片头', 'Generate')}` : ''}
        width={780}
        onClose={close}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={close}>{t('关闭', 'Close')}</button>
            {result && !inserted ? (
              <button className="dr-btn" type="button" disabled={insert.isPending} onClick={() => insert.mutate()}>
                {insert.isPending ? t('插入中…', 'Inserting…') : t('插入项目片头', 'Insert into project')}
              </button>
            ) : null}
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={!projectId || !title.trim() || generate.isPending}
              onClick={() => generate.mutate()}
            >
              {generate.isPending ? t('生成中…', 'Rendering…') : result ? t('重新生成', 'Regenerate') : t('生成片头', 'Generate')}
            </button>
          </>
        }
      >
        {selected ? (
          <div className="title-detail">
            <div className="title-detail-preview" style={{ background: colorOf(selected.ffmpeg.bgColors[0]), color: selected.ffmpeg.titleColor }}>
              <span className="title-detail-name">{title.trim() || t('片名预览', 'TITLE PREVIEW')}</span>
              <span className="title-detail-sub">{subtitle.trim() || 'A DREAM REEL STORY'}</span>
              <span className="title-detail-rule" />
            </div>

            {result ? (
              <div className="title-result">
                <video controls muted playsInline preload="metadata" src={result.videoUrl} />
                <div className="title-result-meta">
                  <span>{result.templateName}</span>
                  <span>{result.duration}s</span>
                  <span>{result.titleRendered ? t('标题已上屏', 'Title rendered') : t('纯色背景回退', 'Fallback backdrop')}</span>
                  <span>{t('静音音轨', 'Silent audio')}</span>
                </div>
                {inserted ? (
                  <p className="title-inserted"><Icon name="check" size={13} />{t('已插入项目最前面', 'Inserted at the start of the project')}</p>
                ) : null}
              </div>
            ) : generate.isPending ? (
              <div className="title-rendering" role="status">
                <span>{t('正在用 ffmpeg 渲染，通常需要几秒…', 'Rendering with ffmpeg. This usually takes a few seconds…')}</span>
                <div className="title-render-bar"><i /></div>
              </div>
            ) : null}

            <div className="title-form">
              <label className="dr-field">
                <span>{t('片名', 'Title')} *</span>
                <input
                  className="dr-input"
                  value={title}
                  maxLength={40}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder={t('例如：梦境重启', 'e.g. Dream Restart')}
                />
              </label>
              <label className="dr-field">
                <span>{t('英文副标题', 'Subtitle')}</span>
                <input
                  className="dr-input"
                  value={subtitle}
                  maxLength={80}
                  onChange={(event) => setSubtitle(event.target.value)}
                  placeholder="A Dream Reel Story"
                />
              </label>
              {projectsQuery.isLoading ? (
                <div className="dr-skeleton" style={{ height: 56 }} />
              ) : projects.length === 0 ? (
                <div className="title-empty">
                  <p>{t('还没有项目可插入片头。', 'No projects available.')}</p>
                  <button className="dr-btn" type="button" onClick={() => navigate('/projects?create=1')}>
                    {t('新建项目', 'New project')}
                  </button>
                </div>
              ) : (
                <label className="dr-field">
                  <span>{t('目标项目', 'Target project')} *</span>
                  <select
                    className="dr-input"
                    value={projectId}
                    onChange={(event) => {
                      setProjectId(event.target.value)
                      setResult(null)
                      setInserted(false)
                    }}
                  >
                    <option value="">{t('请选择项目', 'Select a project')}</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name} · {project.shots?.length ?? 0} {t('镜', pluralize(project.shots?.length ?? 0, 'shot'))}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p className="title-note">
                <Icon name="shield" size={12} />
                {t('插入只新增一个已完成片头镜头，不改动现有镜头内容；片头为静音，可在配音轨添加 BGM。', 'Insertion adds one completed title shot and does not alter existing shots. The clip is silent.')}
              </p>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
