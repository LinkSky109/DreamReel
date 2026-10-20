import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as Checkbox from '@radix-ui/react-checkbox'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import {
  progressOf,
  projectStatus,
  relativeTime,
  statusLabel,
  statusTone,
  totalDuration,
} from '../lib/format'
import type { Project } from '../domain/types'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import { readWorkspacePreferences } from '../lib/preferences'
import { projectCover } from '../lib/media'

export function ProjectsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const [params, setParams] = useSearchParams()

  const search = params.get('q') ?? ''
  const status = params.get('status') ?? 'all'
  const sort = params.get('sort') ?? 'updatedAt'
  const favorite = params.get('favorite') ?? 'all'
  const archived = params.get('archived') ?? 'active'

  const [selected, setSelected] = useState<string[]>([])
  const [batchMode, setBatchMode] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<Project | null>(null)
  const [batchConfirm, setBatchConfirm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const projectsQuery = useQuery({
    queryKey: ['projects', { search, status, sort, favorite, archived }],
    queryFn: () =>
      api.listProjects({
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        sort,
        favorite: favorite === 'all' ? undefined : favorite,
        archived,
        limit: 200,
      }),
  })

  const workspacePrefs = readWorkspacePreferences()

  const templatesQuery = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.listTemplates(),
    staleTime: 120_000,
  })

  const projects = projectsQuery.data?.items ?? []

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (!value || value === 'all' || (key === 'sort' && value === 'updatedAt') || (key === 'archived' && value === 'active')) {
      next.delete(key)
    } else {
      next.set(key, value)
    }
    setParams(next, { replace: true })
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['projects'] })

  const favoriteMutation = useMutation({
    mutationFn: (id: string) => api.toggleFavorite(id),
    onSuccess: refresh,
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const archiveMutation = useMutation({
    mutationFn: (id: string) => api.toggleArchive(id),
    onSuccess: () => {
      refresh()
      showToast(t('已更新归档状态', 'Archive status updated'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => api.duplicateProject(id),
    onSuccess: () => {
      refresh()
      showToast(t('项目已复制', 'Project duplicated'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteProject(id),
    onSuccess: () => {
      setConfirmDelete(null)
      refresh()
      showToast(t('项目已移入回收站', 'Project moved to recycle bin'))
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const batchMutation = useMutation({
    mutationFn: async (action: 'favorite' | 'archive' | 'delete') => {
      if (selected.length === 0) return
      if (action === 'favorite') return api.batchFavorite(selected, true)
      if (action === 'archive') return api.batchArchive(selected, true)
      return api.batchDelete(selected)
    },
    onSuccess: () => {
      showToast(t(`已处理 ${selected.length} 个项目`, `Updated ${selected.length} projects`))
      setSelected([])
      setBatchConfirm(false)
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text()
      const data = JSON.parse(text) as unknown
      return api.importProject(data)
    },
    onSuccess: () => {
      refresh()
      showToast(t('项目导入成功', 'Project imported'))
    },
    onError: (error: Error) => showToast(`${t('导入失败', 'Import failed')}：${error.message}`, 'error'),
  })

  const createOpen = params.get('create') === '1'
  const templateId = params.get('template')
  const template = useMemo(
    () => templatesQuery.data?.items.find((item) => item.id === templateId),
    [templatesQuery.data, templateId]
  )

  const closeCreate = () => {
    const next = new URLSearchParams(params)
    next.delete('create')
    next.delete('template')
    setParams(next, { replace: true })
  }

  const hasFilters = Boolean(search) || status !== 'all' || favorite !== 'all' || archived !== 'active'

  return (
    <div className="dr-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Library</p>
          <h1>{t('项目库', 'Projects')}</h1>
          <p className="projects-lead">
            {t(
              '所有项目、镜头与版本都在这里。按状态筛选，或直接搜索片名、风格和标签。',
              'All projects, shots and versions. Filter by status or search by title, style and tag.'
            )}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) importMutation.mutate(file)
              event.target.value = ''
            }}
          />
          <button type="button" className="dr-btn" onClick={() => fileInputRef.current?.click()}>
            <Icon name="download" size={15} />
            {t('导入项目', 'Import')}
          </button>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            onClick={() => {
              const next = new URLSearchParams(params)
              next.set('create', '1')
              setParams(next)
            }}
          >
            <Icon name="plus" size={15} />
            {t('新建项目', 'New project')}
          </button>
        </div>
      </div>

      <div className="project-filter-bar">
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 9, top: 9, color: 'var(--meta)' }}>
            <Icon name="search" size={15} />
          </span>
          <input
            className="dr-input"
            style={{ width: '100%', paddingLeft: 30 }}
            placeholder={t('搜索项目名称…', 'Search projects…')}
            value={search}
            onChange={(event) => updateParam('q', event.target.value)}
            aria-label={t('搜索项目', 'Search projects')}
          />
        </div>
        <div className="project-status-chips" role="group" aria-label={t('按状态筛选', 'Filter by status')}>
          {[
            ['all', t('全部', 'All')],
            ['in-progress', t('制作中', 'In progress')],
            ['completed', t('已完成', 'Completed')],
            ['empty', t('未开始', 'Not started')],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={`project-status-chip ${status === value ? 'is-active' : ''}`}
              aria-pressed={status === value}
              onClick={() => updateParam('status', value)}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="project-filter-count">
          {t('共', 'Total')} <strong>{projects.length}</strong> {t('个项目', 'projects')}
        </span>
        <button
          type="button"
          className={`dr-btn ${batchMode ? 'dr-btn-primary' : ''}`}
          aria-pressed={batchMode}
          onClick={() => {
            setBatchMode((current) => {
              if (current) setSelected([])
              return !current
            })
          }}
        >
          <Icon name="check" size={15} />
          {batchMode ? t('退出多选', 'Exit selection') : t('多选', 'Select')}
        </button>
      </div>

      <div className="project-filter-secondary">
        <select
          className="dr-select"
          value={favorite}
          onChange={(event) => updateParam('favorite', event.target.value)}
          aria-label={t('按收藏筛选', 'Filter by favorite')}
        >
          <option value="all">{t('全部项目', 'All projects')}</option>
          <option value="true">{t('仅收藏', 'Favorites only')}</option>
        </select>
        <select
          className="dr-select"
          value={archived}
          onChange={(event) => updateParam('archived', event.target.value)}
          aria-label={t('按归档筛选', 'Filter by archive')}
        >
          <option value="active">{t('未归档', 'Active')}</option>
          <option value="true">{t('仅归档', 'Archived only')}</option>
          <option value="all">{t('含归档', 'Include archived')}</option>
        </select>
        <select
          className="dr-select"
          value={sort}
          onChange={(event) => updateParam('sort', event.target.value)}
          aria-label={t('排序', 'Sort')}
        >
          <option value="updatedAt">{t('最近更新', 'Recently updated')}</option>
          <option value="createdAt">{t('最近创建', 'Recently created')}</option>
          <option value="name">{t('名称排序', 'Name')}</option>
        </select>
        {hasFilters ? (
          <button type="button" className="project-clear-filters" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {t('清除筛选', 'Clear filters')}
          </button>
        ) : null}
      </div>

      {selected.length > 0 ? (
        <div
          className="dr-card"
          style={{
            marginTop: 12,
            padding: '10px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <strong style={{ fontSize: 13 }}>
            {t(`已选 ${selected.length} 个项目`, `${selected.length} selected`)}
          </strong>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="dr-btn"
              onClick={() => batchMutation.mutate('favorite')}
              disabled={batchMutation.isPending}
            >
              {t('收藏', 'Favorite')}
            </button>
            <button
              type="button"
              className="dr-btn"
              onClick={() => batchMutation.mutate('archive')}
              disabled={batchMutation.isPending}
            >
              {t('归档', 'Archive')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-danger"
              onClick={() => setBatchConfirm(true)}
              disabled={batchMutation.isPending}
            >
              {t('删除', 'Delete')}
            </button>
          </div>
        </div>
      ) : null}

      <div style={{ marginTop: 18 }}>
        {projectsQuery.isLoading ? (
          <div className="dr-project-grid">
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div className="dr-skeleton" key={key} style={{ height: 220 }} />
            ))}
          </div>
        ) : projectsQuery.isError ? (
          <div className="dr-card dr-state">
            <div className="dr-state-icon">
              <Icon name="alert" size={20} />
            </div>
            <div className="dr-state-title">{t('项目加载失败', 'Failed to load projects')}</div>
            <div>{(projectsQuery.error as Error).message}</div>
            <button type="button" className="dr-btn" onClick={() => projectsQuery.refetch()}>
              {t('重试', 'Retry')}
            </button>
          </div>
        ) : projects.length === 0 ? (
          <div className="dr-card dr-state">
            <div className="dr-state-icon">
              <Icon name="folder" size={20} />
            </div>
            <div className="dr-state-title">
              {hasFilters ? t('没有匹配的项目', 'No matching projects') : t('还没有项目', 'No projects yet')}
            </div>
            <div>
              {hasFilters
                ? t('尝试清除筛选，或换一个关键词。', 'Clear filters or try another keyword.')
                : t('创建一个项目，开始剧本与分镜创作。', 'Create a project to start writing and storyboarding.')}
            </div>
            {hasFilters ? (
              <button type="button" className="dr-btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
                {t('清除筛选', 'Clear filters')}
              </button>
            ) : (
              <button
                type="button"
                className="dr-btn dr-btn-primary"
                onClick={() => {
                  const next = new URLSearchParams(params)
                  next.set('create', '1')
                  setParams(next)
                }}
              >
                <Icon name="plus" size={15} />
                {t('新建项目', 'New project')}
              </button>
            )}
          </div>
        ) : (
          <div className="dr-project-grid">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                batchMode={batchMode}
                selected={selected.includes(project.id)}
                onSelect={(checked) =>
                  setSelected((current) =>
                    checked ? [...current, project.id] : current.filter((id) => id !== project.id)
                  )
                }
                onOpen={() => navigate(`/project/${project.id}`)}
                onFavorite={() => favoriteMutation.mutate(project.id)}
                onArchive={() => archiveMutation.mutate(project.id)}
                onDuplicate={() => duplicateMutation.mutate(project.id)}
                onExport={() => api.exportProject(project.id)}
                onDelete={() => setConfirmDelete(project)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectModal
        open={createOpen}
        onClose={closeCreate}
        defaultName={template ? `${template.name} 项目` : ''}
        defaultDuration={template?.config?.targetDuration ?? 60}
        defaultPlatform={
          template?.config?.platform ??
          (workspacePrefs.defaultAspect === '9:16' ? 'portrait' : 'landscape')
        }
        defaultStyle={
          template?.config?.style ??
          (workspacePrefs.defaultStyle !== 'none' ? workspacePrefs.defaultStyle : undefined)
        }
        templateId={template?.id}
        onCreated={(project) => {
          closeCreate()
          refresh()
          navigate(`/project/${project.id}`)
        }}
      />

      <Modal
        open={Boolean(confirmDelete)}
        title={t('移入回收站', 'Move to recycle bin')}
        onClose={() => setConfirmDelete(null)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setConfirmDelete(null)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-danger"
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {t('移入回收站', 'Move to recycle bin')}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {t(
            `「${confirmDelete?.name ?? ''}」将移入回收站，30 天内可恢复。`,
            `“${confirmDelete?.name ?? ''}” will be moved to the recycle bin and can be restored within 30 days.`
          )}
        </p>
      </Modal>

      <Modal
        open={batchConfirm}
        title={t('批量删除', 'Batch delete')}
        onClose={() => setBatchConfirm(false)}
        footer={
          <>
            <button type="button" className="dr-btn" onClick={() => setBatchConfirm(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              type="button"
              className="dr-btn dr-btn-danger"
              onClick={() => batchMutation.mutate('delete')}
              disabled={batchMutation.isPending}
            >
              {t(`删除 ${selected.length} 个项目`, `Delete ${selected.length} projects`)}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {t('所选项目将移入回收站，30 天内可恢复。', 'Selected projects will be moved to the recycle bin.')}
        </p>
      </Modal>
    </div>
  )
}

type ProjectCardProps = {
  project: Project
  batchMode: boolean
  selected: boolean
  onSelect: (checked: boolean) => void
  onOpen: () => void
  onFavorite: () => void
  onArchive: () => void
  onDuplicate: () => void
  onExport: () => void
  onDelete: () => void
}

function ProjectCard({
  project,
  batchMode,
  selected,
  onSelect,
  onOpen,
  onFavorite,
  onArchive,
  onDuplicate,
  onExport,
  onDelete,
}: ProjectCardProps) {
  const { t } = useLang()
  const status = projectStatus(project)

  return (
    <article className={`dr-card dr-card-hover dr-project-card ${batchMode ? 'is-batch' : ''}`}>
      <div
        className="dr-project-cover"
        onClick={() => (batchMode ? onSelect(!selected) : onOpen())}
        role="presentation"
      >
        <img src={projectCover(project)} alt="" loading="lazy" />
        <span className={`dr-project-status ${statusTone(status)}`}>{statusLabel(status)}</span>
        <span className="dr-project-duration">{totalDuration(project)}s</span>
        <button
          type="button"
          className={`dr-project-fav ${project.isFavorite ? 'is-on' : ''}`}
          aria-label={project.isFavorite ? t('取消收藏', 'Unfavorite') : t('收藏', 'Favorite')}
          aria-pressed={project.isFavorite}
          onClick={(event) => {
            event.stopPropagation()
            onFavorite()
          }}
        >
          <Icon name="star" size={14} />
        </button>
        {batchMode ? (
          <div className="dr-project-select">
            <Checkbox.Root
              className="dr-checkbox"
              checked={selected}
              onCheckedChange={(checked) => onSelect(checked === true)}
              aria-label={t(`选择 ${project.name}`, `Select ${project.name}`)}
              onClick={(event) => event.stopPropagation()}
            >
              <Checkbox.Indicator>
                <Icon name="check" size={12} />
              </Checkbox.Indicator>
            </Checkbox.Root>
          </div>
        ) : null}
      </div>
      <div className="dr-project-body">
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <button
            type="button"
            onClick={onOpen}
            style={{
              border: 0,
              background: 'transparent',
              padding: 0,
              textAlign: 'left',
              cursor: 'pointer',
              flex: 1,
            }}
          >
            <div className="dr-project-title">{project.name}</div>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button type="button" className="dr-icon-btn" aria-label={t('项目菜单', 'Project menu')}>
                <Icon name="more" size={16} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content className="dr-menu" align="end" sideOffset={4}>
                <DropdownMenu.Item className="dr-menu-item" onSelect={onOpen}>
                  {t('打开', 'Open')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dr-menu-item" onSelect={onDuplicate}>
                  {t('复制项目', 'Duplicate')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dr-menu-item" onSelect={onFavorite}>
                  {project.isFavorite ? t('取消收藏', 'Unfavorite') : t('收藏', 'Favorite')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dr-menu-item" onSelect={onArchive}>
                  {project.isArchived ? t('取消归档', 'Unarchive') : t('归档', 'Archive')}
                </DropdownMenu.Item>
                <DropdownMenu.Item className="dr-menu-item" onSelect={onExport}>
                  {t('导出 JSON', 'Export JSON')}
                </DropdownMenu.Item>
                <DropdownMenu.Separator className="dr-menu-sep" />
                <DropdownMenu.Item className="dr-menu-item is-danger" onSelect={onDelete}>
                  {t('删除', 'Delete')}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        <div className="dr-project-meta">
          <span className={`dr-status ${statusTone(status)}`}>
            <span className="dr-dot" />
            {statusLabel(status)}
          </span>
          <span>{project.shots?.length ?? 0} {t('镜', 'shots')}</span>
          <span>{totalDuration(project)}s</span>
        </div>

        {project.tags.length > 0 ? (
          <div className="dr-tag-row">
            {project.tags.slice(0, 3).map((tag) => (
              <span className="dr-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        <div className="dr-project-foot">
          <span className="dr-hint">{relativeTime(project.updatedAt)}</span>
          <span className="dr-hint">{progressOf(project)}%</span>
        </div>
      </div>
    </article>
  )
}

type CreateProjectModalProps = {
  open: boolean
  onClose: () => void
  defaultName: string
  defaultDuration: number
  defaultPlatform: string
  defaultStyle?: string
  templateId?: string
  onCreated: (project: Project) => void
}

function CreateProjectModal({
  open,
  onClose,
  defaultName,
  defaultDuration,
  defaultPlatform,
  defaultStyle,
  templateId,
  onCreated,
}: CreateProjectModalProps) {
  const { t } = useLang()
  const [name, setName] = useState(defaultName)
  const [description, setDescription] = useState('')
  const [duration, setDuration] = useState(String(defaultDuration))
  const [platform, setPlatform] = useState(defaultPlatform)
  const [error, setError] = useState('')

  const createMutation = useMutation({
    mutationFn: () =>
      api.createProject({
        name: name.trim(),
        description: description.trim() || undefined,
        targetDuration: Number(duration),
        platform,
        style: defaultStyle,
        templateId,
      }),
    onSuccess: (project) => {
      setName('')
      setDescription('')
      setError('')
      onCreated(project)
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  // 模板/入口变化时同步默认值
  useEffect(() => {
    if (!open) return
    setName(defaultName)
    setDuration(String(defaultDuration))
    setPlatform(defaultPlatform)
    setError('')
  }, [open, defaultName, defaultDuration, defaultPlatform])

  return (
    <Modal
      open={open}
      title={t('新建项目', 'New project')}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="dr-btn" onClick={onClose}>
            {t('取消', 'Cancel')}
          </button>
          <button
            type="button"
            className="dr-btn dr-btn-primary"
            disabled={createMutation.isPending}
            onClick={() => {
              if (!name.trim()) {
                setError(t('请输入项目名称', 'Project name is required'))
                return
              }
              setError('')
              createMutation.mutate()
            }}
          >
            {createMutation.isPending ? t('创建中…', 'Creating…') : t('创建项目', 'Create project')}
          </button>
        </>
      }
    >
      <div className="dr-field">
        <label className="dr-label" htmlFor="create-name">
          {t('项目名称', 'Project name')} <span aria-hidden="true">*</span>
        </label>
        <input
          id="create-name"
          className="dr-input"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder={t('例如：火星上的种花人', 'e.g. The Gardener on Mars')}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'create-name-error' : undefined}
        />
        {error ? (
          <span className="dr-error" id="create-name-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>

      <div className="dr-field">
        <label className="dr-label" htmlFor="create-description">
          {t('一句话创意（可选）', 'One-line idea (optional)')}
        </label>
        <textarea
          id="create-description"
          className="dr-input"
          style={{ height: 72, padding: '8px 10px', resize: 'vertical' }}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t('一句话描述你想拍的故事', 'Describe the story in one line')}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div className="dr-field">
          <label className="dr-label" htmlFor="create-duration">
            {t('目标时长', 'Target duration')}
          </label>
          <select
            id="create-duration"
            className="dr-select"
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
          >
            <option value="30">30s</option>
            <option value="60">60s</option>
            <option value="90">90s</option>
            <option value="180">180s</option>
          </select>
        </div>
        <div className="dr-field">
          <label className="dr-label" htmlFor="create-platform">
            {t('画面比例', 'Aspect ratio')}
          </label>
          <select
            id="create-platform"
            className="dr-select"
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
          >
            <option value="landscape">{t('横屏 16:9', 'Landscape 16:9')}</option>
            <option value="portrait">{t('竖屏 9:16', 'Portrait 9:16')}</option>
          </select>
        </div>
      </div>

      {templateId ? (
        <p className="dr-hint">{t('已套用模板结构，创建后可继续调整。', 'Template structure applied; you can adjust after creation.')}</p>
      ) : null}
    </Modal>
  )
}
