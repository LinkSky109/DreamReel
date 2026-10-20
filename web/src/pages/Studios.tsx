import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import './Studios.css'

function currentUser() {
  try {
    const raw = localStorage.getItem('dreamreel_user')
    const user = raw ? JSON.parse(raw) : null
    return { id: user?.id || 'usr_a', name: user?.username || user?.name || '创作者' }
  } catch {
    return { id: 'usr_a', name: '创作者' }
  }
}

function initials(name: string) {
  return name?.trim().slice(0, 2) || 'DR'
}

export function StudiosPage() {
  const { id } = useParams()
  return id ? <StudioDetail studioId={id} /> : <StudioList />
}

function StudioList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [style, setStyle] = useState('')
  const [curator, setCurator] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')

  const listQuery = useQuery({ queryKey: ['studios'], queryFn: () => api.listStudios() })
  const studios = listQuery.data?.items ?? []

  const create = useMutation({
    mutationFn: () => {
      const user = currentUser()
      return api.createStudio({
        name: name.trim(),
        stylePositioning: style.trim() || undefined,
        curatorName: curator.trim() || user.name,
        description: description.trim() || undefined,
        ownerId: user.id,
      })
    },
    onSuccess: (studio) => {
      showToast(t('厂牌已创建', 'Studio created'), 'success')
      setCreateOpen(false)
      setName('')
      setStyle('')
      setCurator('')
      setDescription('')
      setError('')
      queryClient.invalidateQueries({ queryKey: ['studios'] })
      navigate(`/studio/${studio.id}`)
    },
    onError: (mutationError: Error) => setError(mutationError.message),
  })

  return (
    <div className="dr-page studios-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Studios</p>
          <h1>{t('剧场计划', 'Studios')}</h1>
          <p className="projects-lead">
            {t('建立厂牌、签约创作者、策划剧集，把作品收进自己的片单。', 'Build a studio, sign creators, plan shows and collect your work.')}
          </p>
        </div>
        <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={15} />
          {t('创建厂牌', 'Create studio')}
        </button>
      </div>

      {listQuery.isLoading ? (
        <div className="studio-grid">{[0, 1].map((key) => <div className="dr-skeleton studio-skeleton" key={key} />)}</div>
      ) : listQuery.isError ? (
        <div className="dr-card dr-state">
          <p>{t('厂牌加载失败', 'Failed to load studios')}：{(listQuery.error as Error).message}</p>
          <button className="dr-btn" onClick={() => listQuery.refetch()}>{t('重试', 'Retry')}</button>
        </div>
      ) : studios.length === 0 ? (
        <div className="dr-card dr-state studio-empty">
          <Icon name="theater" size={26} />
          <p>{t('还没有厂牌，创建第一个。', 'No studios yet. Create the first one.')}</p>
          <button className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>{t('创建厂牌', 'Create studio')}</button>
        </div>
      ) : (
        <div className="studio-grid">
          {studios.map((studio) => (
            <button type="button" className="studio-card" key={studio.id} onClick={() => navigate(`/studio/${studio.id}`)}>
              <span className="studio-mark">{initials(studio.name)}</span>
              <span className="studio-card-body">
                <span className="studio-card-title">
                  <strong>{studio.name}</strong>
                  <span>{studio.stylePositioning || t('未设定风格', 'No style set')}</span>
                </span>
                <span className="studio-card-desc">{studio.description || t('这个厂牌还没有简介。', 'No synopsis yet.')}</span>
                <span className="studio-metrics">
                  <span><strong>{studio.memberCount ?? studio.members?.length ?? 0}</strong>{t(' 成员', ' members')}</span>
                  <span><strong>{studio.showCount ?? studio.shows?.length ?? 0}</strong>{t(' 剧集', ' shows')}</span>
                  <span><strong>{studio.projectCount ?? studio.projectIds?.length ?? 0}</strong>{t(' 作品', ' works')}</span>
                </span>
                <span className="studio-curator">{t('主理人', 'Curator')} · {studio.curatorName || '—'}</span>
              </span>
              <Icon name="arrow-right" size={15} />
            </button>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        title={t('创建厂牌', 'Create studio')}
        width={560}
        onClose={() => (!create.isPending ? setCreateOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setCreateOpen(false)}>{t('取消', 'Cancel')}</button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={create.isPending}
              onClick={() => {
                if (!name.trim()) {
                  setError(t('请填写厂牌名称', 'Studio name is required'))
                  return
                }
                setError('')
                create.mutate()
              }}
            >
              {create.isPending ? t('创建中…', 'Creating…') : t('创建厂牌', 'Create studio')}
            </button>
          </>
        }
      >
        <div className="studio-form">
          <label className="dr-field">
            <span>{t('厂牌名称', 'Name')} *</span>
            <input className="dr-input" value={name} onChange={(event) => setName(event.target.value)} placeholder={t('例如：雨夜影像厂', 'e.g. Rain Night Pictures')} />
          </label>
          <label className="dr-field">
            <span>{t('风格定位', 'Style')}</span>
            <input className="dr-input" value={style} onChange={(event) => setStyle(event.target.value)} placeholder={t('例如：黑色电影 / 都市悬疑', 'e.g. noir / urban mystery')} />
          </label>
          <label className="dr-field">
            <span>{t('主理人', 'Curator')}</span>
            <input className="dr-input" value={curator} onChange={(event) => setCurator(event.target.value)} placeholder={currentUser().name} />
          </label>
          <label className="dr-field">
            <span>{t('简介', 'Synopsis')}</span>
            <textarea className="dr-input" rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('这个厂牌想拍什么样的片子？', 'What does this studio want to make?')} />
          </label>
          {error ? <p className="dr-error" role="alert">{error}</p> : null}
        </div>
      </Modal>
    </div>
  )
}

function StudioDetail({ studioId }: { studioId: string }) {
  const queryClient = useQueryClient()
  const { t } = useLang()
  const me = currentUser()
  const [showTitle, setShowTitle] = useState('')
  const [showSynopsis, setShowSynopsis] = useState('')
  const [projectId, setProjectId] = useState('')

  const studioQuery = useQuery({ queryKey: ['studio', studioId], queryFn: () => api.getStudio(studioId) })
  const projectsQuery = useQuery({ queryKey: ['projects', 'studio-targets'], queryFn: () => api.listProjects({ limit: 200 }) })
  const studio = studioQuery.data
  const projects = (projectsQuery.data?.items ?? []).filter((project) => !project.isArchived)
  const isOwner = studio?.curatorId === me.id
  const isMember = studio?.members?.some((member) => member.userId === me.id)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['studio', studioId] })
    queryClient.invalidateQueries({ queryKey: ['studios'] })
    queryClient.invalidateQueries({ queryKey: ['projects'] })
  }

  const join = useMutation({
    mutationFn: () => api.signStudioMember(studioId, { userId: me.id, name: me.name, role: 'creator' }),
    onSuccess: () => {
      showToast(t('已加入厂牌', 'Joined studio'), 'success')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const createShow = useMutation({
    mutationFn: () => api.createStudioShow(studioId, { title: showTitle.trim(), synopsis: showSynopsis.trim() || undefined }),
    onSuccess: () => {
      showToast(t('剧集已创建', 'Show created'), 'success')
      setShowTitle('')
      setShowSynopsis('')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const addWork = useMutation({
    mutationFn: () => api.addProjectToStudio(studioId, projectId),
    onSuccess: () => {
      showToast(t('已归入厂牌', 'Added to studio'), 'success')
      setProjectId('')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const removeMember = useMutation({
    mutationFn: (userId: string) => api.removeStudioMember(studioId, userId),
    onSuccess: () => {
      showToast(t('已移除成员', 'Member removed'), 'success')
      refresh()
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  if (studioQuery.isLoading) {
    return <div className="dr-page"><div className="dr-skeleton" style={{ height: 420 }} /></div>
  }

  if (studioQuery.isError || !studio) {
    return (
      <div className="dr-page">
        <div className="dr-card dr-state">
          <p>{t('厂牌加载失败', 'Failed to load studio')}：{(studioQuery.error as Error)?.message}</p>
          <Link className="dr-btn" to="/studios">{t('返回厂牌广场', 'Back to studios')}</Link>
        </div>
      </div>
    )
  }

  const works = studio.works ?? []

  return (
    <div className="dr-page studio-detail-page">
      <Link className="studio-back" to="/studios">
        <Icon name="arrow-left" size={14} />
        {t('返回厂牌广场', 'Back to studios')}
      </Link>

      <header className="studio-hero">
        <span className="studio-mark is-large">{initials(studio.name)}</span>
        <div className="studio-hero-main">
          <p className="dash-eyebrow">{studio.stylePositioning || 'Studio'}</p>
          <h1>{studio.name}</h1>
          <p>{studio.description || t('这个厂牌还没有简介。', 'No synopsis yet.')}</p>
          <div className="studio-metrics">
            <span><strong>{studio.memberCount ?? studio.members.length}</strong>{t(' 成员', ' members')}</span>
            <span><strong>{studio.showCount ?? studio.shows.length}</strong>{t(' 剧集', ' shows')}</span>
            <span><strong>{studio.projectCount ?? works.length}</strong>{t(' 作品', ' works')}</span>
          </div>
        </div>
        <div className="studio-hero-side">
          <span className="studio-curator">{t('主理人', 'Curator')} · {studio.curatorName || '—'}</span>
          {!isMember ? (
            <button type="button" className="dr-btn dr-btn-primary" disabled={join.isPending} onClick={() => join.mutate()}>
              {join.isPending ? t('加入中…', 'Joining…') : t('加入厂牌', 'Join studio')}
            </button>
          ) : (
            <span className="studio-joined"><Icon name="check" size={13} />{t('已加入', 'Joined')}</span>
          )}
        </div>
      </header>

      <div className="studio-detail-grid">
        <section className="studio-panel">
          <div className="studio-panel-head">
            <h2>{t('成员', 'Members')}</h2>
            <span>{studio.members.length}</span>
          </div>
          {studio.members.length === 0 ? (
            <p className="studio-note">{t('还没有签约创作者。', 'No members yet.')}</p>
          ) : (
            <ul className="studio-members">
              {studio.members.map((member) => (
                <li key={member.userId}>
                  <span className="studio-avatar">{initials(member.name || member.userId)}</span>
                  <span className="studio-member-name">{member.name || member.userId}</span>
                  <span className="studio-member-role">{member.role}</span>
                  {isOwner && member.userId !== studio.curatorId ? (
                    <button type="button" className="studio-text-btn" disabled={removeMember.isPending} onClick={() => removeMember.mutate(member.userId)}>
                      {t('移除', 'Remove')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {!isOwner ? <p className="studio-note">{t('只有主理人可以移除成员。', 'Only the curator can remove members.')}</p> : null}
        </section>

        <section className="studio-panel">
          <div className="studio-panel-head">
            <h2>{t('剧集', 'Shows')}</h2>
            <span>{studio.shows.length}</span>
          </div>
          {studio.shows.length === 0 ? (
            <p className="studio-note">{t('还没有剧集。', 'No shows yet.')}</p>
          ) : (
            <div className="studio-shows">
              {studio.shows.map((show, index) => (
                <article className="studio-show" key={show.id}>
                  <span className="studio-show-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{show.title}</strong>
                    {show.synopsis ? <p>{show.synopsis}</p> : null}
                    <span>{show.projectIds?.length ?? 0} {t('部作品', 'works')}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
          {isOwner ? (
            <div className="studio-inline-form">
              <input className="dr-input" value={showTitle} onChange={(event) => setShowTitle(event.target.value)} placeholder={t('剧集标题', 'Show title')} />
              <input className="dr-input" value={showSynopsis} onChange={(event) => setShowSynopsis(event.target.value)} placeholder={t('一句话简介', 'One-line synopsis')} />
              <button type="button" className="dr-btn" disabled={!showTitle.trim() || createShow.isPending} onClick={() => createShow.mutate()}>
                {createShow.isPending ? t('创建中…', 'Creating…') : t('新建剧集', 'New show')}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      <section className="studio-panel studio-works-panel">
        <div className="studio-panel-head">
          <h2>{t('厂牌作品', 'Works')}</h2>
          <span>{works.length}</span>
        </div>
        {works.length === 0 ? (
          <p className="studio-note">{t('厂牌还没有归入的作品。', 'No works assigned yet.')}</p>
        ) : (
          <div className="studio-works">
            {works.map((work) => (
              <Link to={`/project/${work.id}`} className="studio-work" key={work.id}>
                <span>{initials(work.name)}</span>
                <strong>{work.name}</strong>
                <small>{work.status || '—'} · {work.shotCount ?? 0} {t('镜', 'shots')}</small>
              </Link>
            ))}
          </div>
        )}
        {isOwner ? (
          <div className="studio-inline-form">
            <select className="dr-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">{t('选择我的项目', 'Select one of my projects')}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button type="button" className="dr-btn" disabled={!projectId || addWork.isPending} onClick={() => addWork.mutate()}>
              {addWork.isPending ? t('归入中…', 'Adding…') : t('归入厂牌', 'Add work')}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
