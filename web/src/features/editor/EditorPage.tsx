import { useCallback, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { api } from '../../lib/api'
import { useLang } from '../../lib/i18n'
import { showToast } from '../../lib/toast'
import type { Project } from '../../domain/types'
import { Icon } from '../../components/Icon'
import { Modal } from '../../components/Modal'
import { statusLabel, statusTone } from '../../lib/format'
import { EXTENDED_STAGES, PRIMARY_STAGES, normalizeStage, stageLabel } from './stages'
import { aspectRatioOf, totalDuration } from './utils'
import { ScriptStage } from './ScriptStage'
import { StoryboardStage } from './StoryboardStage'
import { GenerateStage } from './GenerateStage'
import { DubbingStage } from './DubbingStage'
import { EditStage } from './EditStage'
import { ImagesStage } from './ImagesStage'
import { CharactersStage } from './CharactersStage'
import { ScenesStage } from './ScenesStage'
import { AnalysisStage } from './AnalysisStage'
import { CollaborationStage } from './CollaborationStage'
import { VersionsStage } from './VersionsStage'
import { SettingsStage } from './SettingsStage'
import { AiAssistantPanel } from './AiAssistantPanel'
import './editor.css'

export type SaveState = 'saved' | 'saving' | 'error'

export function EditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const { t, lang } = useLang()

  const stage = normalizeStage(searchParams.get('tab'))
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  const projectQuery = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.getProject(id),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data as Project | undefined
      return data?.shots?.some((shot) => shot.status === 'generating') ? 2000 : false
    },
  })

  const quotaQuery = useQuery({
    queryKey: ['quota'],
    queryFn: () => api.getQuota(),
    staleTime: 60_000,
    retry: false,
  })

  const stylesQuery = useQuery({
    queryKey: ['styles'],
    queryFn: () => api.listStyles(),
    staleTime: 300_000,
    retry: false,
  })

  const project = projectQuery.data

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['project', id] })
  }, [queryClient, id])

  const onUpdated = useCallback(
    (updated: Project) => {
      queryClient.setQueryData(['project', id], updated)
    },
    [queryClient, id]
  )

  const renameMutation = useMutation({
    mutationFn: (name: string) => api.updateProject(id, { name }),
    onSuccess: (updated) => {
      onUpdated(updated)
      setRenameOpen(false)
      showToast(t('项目已重命名', 'Project renamed'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const exportMutation = useMutation({
    mutationFn: () => api.exportProjectVideo(id),
    onSuccess: (result) => showToast(result.message || t('导出任务已提交', 'Export started')),
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const setStage = (next: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    setSearchParams(params, { replace: true })
  }

  const selectedShot = useMemo(() => {
    if (!project) return undefined
    return project.shots?.find((shot) => shot.id === selectedShotId) ?? project.shots?.[0]
  }, [project, selectedShotId])

  if (projectQuery.isLoading) {
    return (
      <div className="ed-loading">
        <div className="dr-skeleton" style={{ height: 44, width: '60%' }} />
        <div className="dr-skeleton" style={{ height: 40, width: '100%' }} />
        <div className="dr-skeleton" style={{ height: 320, width: '100%' }} />
      </div>
    )
  }

  if (projectQuery.isError || !project) {
    return (
      <div className="dr-card dr-state" style={{ marginTop: 24 }}>
        <div className="dr-state-icon">
          <Icon name="alert" size={22} />
        </div>
        <div className="dr-state-title">{t('项目未加载', 'Project failed to load')}</div>
        <div style={{ maxWidth: 520, fontSize: 12 }}>
          {(projectQuery.error as Error | null)?.message ?? t('项目不存在或已被删除。', 'Project not found.')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => projectQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
          <button type="button" className="dr-btn" onClick={() => navigate('/projects')}>
            {t('返回项目库', 'Back to projects')}
          </button>
        </div>
      </div>
    )
  }

  const shots = project.shots ?? []
  const completed = shots.filter((shot) => shot.status === 'completed').length

  return (
    <div className="ed-page" style={{ ['--shot-aspect' as string]: aspectRatioOf(project).replace(':', ' / ') }}>
      <header className="ed-topbar">
        <button
          type="button"
          className="dr-icon-btn"
          aria-label={t('返回项目库', 'Back to projects')}
          onClick={() => navigate('/projects')}
        >
          <Icon name="arrow-left" size={18} />
        </button>

        <div className="ed-title">
          <h1 title={project.name}>{project.name}</h1>
          <span className="ed-title-meta">
            {aspectRatioOf(project)} · {shots.length} {t('镜', 'shots')} · {totalDuration(shots)}s
          </span>
        </div>

        <span className={`ed-save state-${saveState}`} role="status">
          <span className="dr-dot" />
          {saveState === 'saving'
            ? t('保存中…', 'Saving…')
            : saveState === 'error'
              ? t('保存失败', 'Save failed')
              : t('已保存', 'Saved')}
        </span>

        <div className="ed-topbar-actions">
          <button
            type="button"
            className="dr-btn"
            onClick={() => {
              setPreviewOpen(true)
            }}
            disabled={!selectedShot?.videoUrl}
          >
            <Icon name="play" size={15} />
            {t('预览', 'Preview')}
          </button>
          <button
            type="button"
            className="dr-btn"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href)
                showToast(t('只读链接已复制', 'Share link copied'))
              } catch {
                showToast(t('复制失败，请手动复制地址栏', 'Copy failed; copy the URL manually'), 'error')
              }
            }}
          >
            {t('分享', 'Share')}
          </button>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || completed === 0}
            title={completed === 0 ? t('请先生成至少一个镜头', 'Generate at least one shot first') : undefined}
          >
            <Icon name="download" size={15} />
            {exportMutation.isPending ? t('提交中…', 'Submitting…') : t('导出成片', 'Export')}
          </button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="dr-icon-btn" aria-label={t('更多操作', 'More actions')}>
                <Icon name="more" size={18} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dr-menu" align="end" sideOffset={6}>
                <DropdownMenu.Item
                  className="dr-menu-item"
                  onSelect={() => {
                    setRenameValue(project.name)
                    setRenameOpen(true)
                  }}
                >
                  {t('重命名项目', 'Rename project')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dr-menu-item" onSelect={() => setStage('settings')}>
                  {t('项目设置', 'Project settings')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dr-menu-item" onSelect={() => api.exportProject(project.id)}>
                  {t('导出项目 JSON', 'Export project JSON')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      <nav className="ed-stage-rail" aria-label={t('编辑器阶段', 'Editor stages')}>
        {PRIMARY_STAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="ed-stage"
            aria-current={stage === item.id ? 'step' : undefined}
            onClick={() => setStage(item.id)}
          >
            <Icon name={item.icon} size={16} />
            <span>{stageLabel(item.id, lang)}</span>
          </button>
        ))}
        <span className="ed-stage-divider" aria-hidden="true" />
        {EXTENDED_STAGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className="ed-stage ed-stage-secondary"
            aria-current={stage === item.id ? 'step' : undefined}
            onClick={() => setStage(item.id)}
          >
            <Icon name={item.icon} size={15} />
            <span>{stageLabel(item.id, lang)}</span>
          </button>
        ))}
      </nav>

      <div className="ed-body">
        {stage === 'script' ? (
          <ScriptStage
            key={project.id}
            project={project}
            onUpdated={onUpdated}
            onSaveState={setSaveState}
          />
        ) : null}

        {stage === 'shots' ? (
          <StoryboardStage
            project={project}
            selectedShotId={selectedShot?.id ?? null}
            onSelect={setSelectedShotId}
            onRefresh={refresh}
            onSaveState={setSaveState}
            styles={stylesQuery.data?.items ?? []}
          />
        ) : null}

        {stage === 'generate' ? <GenerateStage project={project} onRefresh={refresh} /> : null}

        {stage === 'dubbing' ? (
          <DubbingStage project={project} onUpdated={onUpdated} onSaveState={setSaveState} />
        ) : null}

        {stage === 'edit' ? <EditStage project={project} onSaveState={setSaveState} /> : null}

        {stage === 'images' ? (
          <ImagesStage project={project} onRefresh={refresh} onNavigateStage={setStage} />
        ) : null}

        {stage === 'characters' ? (
          <CharactersStage project={project} onRefresh={refresh} onNavigateStage={setStage} />
        ) : null}

        {stage === 'scenes' ? (
          <ScenesStage project={project} onUpdated={onUpdated} onNavigateStage={setStage} />
        ) : null}

        {stage === 'analysis' ? <AnalysisStage project={project} /> : null}

        {stage === 'collab' ? <CollaborationStage project={project} /> : null}

        {stage === 'versions' ? <VersionsStage project={project} /> : null}

        {stage === 'settings' ? (
          <SettingsStage
            project={project}
            styles={stylesQuery.data?.items ?? []}
            onUpdated={onUpdated}
          />
        ) : null}

      </div>

      <AiAssistantPanel projectId={project.id} />

      <footer className="ed-statusbar">
        <span>{t('连接正常', 'Connected')}</span>
        <span>
          {shots.length} {t('镜', 'shots')} · {totalDuration(shots)}s
        </span>
        <span>
          {t('画幅', 'Aspect')} {aspectRatioOf(project)}
        </span>
        <span>
          {completed}/{shots.length} {t('已完成', 'completed')}
        </span>
        <span className="ed-statusbar-right">
          {t('今日额度', 'Quota')} {quotaQuery.data?.video.daily.remaining ?? '—'}
        </span>
      </footer>

      <Modal
        open={renameOpen}
        title={t('重命名项目', 'Rename project')}
        onClose={() => setRenameOpen(false)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setRenameOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-primary"
              disabled={renameMutation.isPending || !renameValue.trim()}
              onClick={() => renameMutation.mutate(renameValue.trim())}
            >
              {t('保存', 'Save')}
            </button>
          </>
        }
      >
        <div className="dr-field">
          <label className="dr-label" htmlFor="rename-project">
            {t('项目名称', 'Project name')}
          </label>
          <input
            id="rename-project"
            className="dr-input"
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
        </div>
      </Modal>

      <Modal
        open={previewOpen}
        title={selectedShot ? `S${String((selectedShot.index ?? 0) + 1).padStart(2, '0')}` : t('预览', 'Preview')}
        onClose={() => setPreviewOpen(false)}
        width={720}
      >
        {selectedShot?.videoUrl ? (
          <video
            controls
            playsInline
            preload="metadata"
            src={selectedShot.videoUrl}
            style={{ width: '100%', borderRadius: 'var(--radius-md)', background: 'var(--bg-sunken)' }}
          />
        ) : (
          <div className="dr-state">{t('该镜头还没有成片', 'This shot has no video yet')}</div>
        )}
      </Modal>
    </div>
  )
}

export function ShotStatus({ status }: { status: string }) {
  return (
    <span className={`dr-status ${statusTone(status)}`}>
      <span className="dr-dot" />
      {statusLabel(status)}
    </span>
  )
}
