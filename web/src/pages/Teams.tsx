import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useLang } from '../lib/i18n'
import { showToast } from '../lib/toast'
import { currentUserId } from '../lib/user'
import { Icon } from '../components/Icon'
import { Modal } from '../components/Modal'
import type { TeamMember, TeamRole } from '../domain/types'
import './Teams.css'
import { pluralize } from '../lib/format'

const ROLE_LABEL: Record<string, { zh: string; en: string }> = {
  owner: { zh: '所有者', en: 'Owner' },
  editor: { zh: '编辑者', en: 'Editor' },
  viewer: { zh: '查看者', en: 'Viewer' },
}

function roleLabel(role: string, t: (zh: string, en: string) => string) {
  const item = ROLE_LABEL[role]
  return item ? t(item.zh, item.en) : role
}

function formatDate(value?: string) {
  if (!value) return '—'
  return value.slice(0, 10)
}

export function TeamsPage() {
  const { id } = useParams<{ id?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useLang()
  const userId = useMemo(currentUserId, [])

  const [createOpen, setCreateOpen] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [teamDesc, setTeamDesc] = useState('')

  const [memberOpen, setMemberOpen] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [memberName, setMemberName] = useState('')
  const [memberRole, setMemberRole] = useState<TeamRole>('editor')

  const [projectOpen, setProjectOpen] = useState(false)
  const [projectId, setProjectId] = useState('')

  const [removing, setRemoving] = useState<TeamMember | null>(null)

  const listQuery = useQuery({
    queryKey: ['teams', userId],
    queryFn: () => api.listTeams(userId),
    enabled: !id,
  })

  const teamQuery = useQuery({
    queryKey: ['team', id],
    queryFn: () => api.getTeam(id!),
    enabled: Boolean(id),
  })

  const projectsQuery = useQuery({
    queryKey: ['team', id, 'projects'],
    queryFn: () => api.listTeamProjects(id!),
    enabled: Boolean(id),
  })

  const myProjectsQuery = useQuery({
    queryKey: ['projects', 'team-picker'],
    queryFn: () => api.listProjects({ limit: 100, archived: 'all' }),
    enabled: Boolean(id) && projectOpen,
  })

  const createTeam = useMutation({
    mutationFn: () => api.createTeam({ name: teamName.trim(), description: teamDesc.trim() }),
    onSuccess: (team) => {
      showToast(t('团队已创建', 'Team created'))
      setCreateOpen(false)
      setTeamName('')
      setTeamDesc('')
      queryClient.invalidateQueries({ queryKey: ['teams'] })
      navigate(`/team/${team.id}`)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const addMember = useMutation({
    mutationFn: () =>
      api.addTeamMember(id!, {
        userId: memberId.trim(),
        name: memberName.trim() || memberId.trim(),
        role: memberRole,
      }),
    onSuccess: (team) => {
      showToast(t('成员已添加', 'Member added'))
      setMemberOpen(false)
      setMemberId('')
      setMemberName('')
      setMemberRole('editor')
      queryClient.setQueryData(['team', id], team)
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const changeRole = useMutation({
    mutationFn: ({ memberUserId, role }: { memberUserId: string; role: TeamRole }) =>
      api.updateTeamMemberRole(id!, memberUserId, role),
    onSuccess: (team) => {
      showToast(t('角色已更新', 'Role updated'))
      queryClient.setQueryData(['team', id], team)
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const removeMember = useMutation({
    mutationFn: (memberUserId: string) => api.removeTeamMember(id!, memberUserId),
    onSuccess: (team) => {
      showToast(t('成员已移除', 'Member removed'))
      setRemoving(null)
      queryClient.setQueryData(['team', id], team)
      queryClient.invalidateQueries({ queryKey: ['teams'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const addProject = useMutation({
    mutationFn: () => api.addTeamProject(id!, projectId),
    onSuccess: (team) => {
      showToast(t('项目已加入团队', 'Project added to team'))
      setProjectOpen(false)
      setProjectId('')
      queryClient.setQueryData(['team', id], team)
      queryClient.invalidateQueries({ queryKey: ['team', id, 'projects'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const team = teamQuery.data
  const myRole = team?.members.find((member) => member.userId === userId)?.role
  const isOwner = myRole === 'owner' || (team ? team.ownerId === userId : false)
  const canEditProjects = isOwner || myRole === 'editor'

  const availableProjects = (myProjectsQuery.data?.items ?? []).filter(
    (project) => !team?.projectIds.includes(project.id)
  )

  if (id) {
    if (teamQuery.isLoading) {
      return (
        <div className="dr-page team-page">
          <div className="dr-skeleton" style={{ height: 120 }} />
          <div className="dr-skeleton" style={{ height: 260, marginTop: 16 }} />
        </div>
      )
    }

    if (teamQuery.isError || !team) {
      return (
        <div className="dr-page team-page">
          <div className="dr-card dr-state">
            <div className="dr-state-icon">
              <Icon name="alert" size={22} />
            </div>
            <div className="dr-state-title">{t('团队未加载', 'Team failed to load')}</div>
            <div style={{ fontSize: 12 }}>{(teamQuery.error as Error | null)?.message ?? t('团队不存在。', 'Team not found.')}</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="dr-btn dr-btn-primary" onClick={() => teamQuery.refetch()}>
                {t('重试', 'Retry')}
              </button>
              <Link className="dr-btn" to="/teams">
                {t('返回团队列表', 'Back to teams')}
              </Link>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="dr-page team-page">
        <Link className="team-back" to="/teams">
          <Icon name="arrow-left" size={15} />
          {t('全部团队', 'All teams')}
        </Link>

        <div className="projects-head">
          <div>
            <p className="dash-eyebrow">Team Space</p>
            <h1>{team.name}</h1>
            <p className="projects-lead">{team.description || t('这个团队还没有简介。', 'This team has no description yet.')}</p>
          </div>
          <div className="team-head-actions">
            <span className={`team-role-badge team-role-${myRole ?? 'none'}`}>
              {myRole ? roleLabel(myRole, t) : t('访客', 'Guest')}
            </span>
            {isOwner ? (
              <button type="button" className="dr-btn dr-btn-primary" onClick={() => setMemberOpen(true)}>
                <Icon name="plus" size={14} />
                {t('添加成员', 'Add member')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="team-metrics">
          <div className="dr-card team-metric">
            <span>{t('成员', 'Members')}</span>
            <strong>{team.memberCount}</strong>
          </div>
          <div className="dr-card team-metric">
            <span>{t('项目', 'Projects')}</span>
            <strong>{team.projectCount}</strong>
          </div>
          <div className="dr-card team-metric">
            <span>{t('创建时间', 'Created')}</span>
            <strong>{formatDate(team.createdAt)}</strong>
          </div>
          <div className="dr-card team-metric">
            <span>{t('所有权', 'Ownership')}</span>
            <strong>{team.ownerId === userId ? t('我', 'Mine') : team.ownerId}</strong>
          </div>
        </div>

        <section className="dr-card team-panel" aria-labelledby="team-members-title">
          <div className="team-panel-head">
            <h2 id="team-members-title">{t('成员与角色', 'Members & roles')}</h2>
            <span>{t('所有者可修改角色与移除成员', 'Only owners can change roles or remove members')}</span>
          </div>
          {team.members.length === 0 ? (
            <p className="team-empty">{t('还没有成员。', 'No members yet.')}</p>
          ) : (
            <ul className="team-member-list">
              {team.members.map((member) => {
                const isTeamOwner = member.role === 'owner'
                return (
                  <li key={member.userId} className="team-member">
                    <span className="team-avatar" aria-hidden="true">
                      {(member.name || member.userId).slice(0, 1).toUpperCase()}
                    </span>
                    <div className="team-member-id">
                      <strong>{member.name || member.userId}</strong>
                      <span>{member.userId}</span>
                    </div>
                    <div className="team-member-role">
                      {isOwner && !isTeamOwner ? (
                        <select
                          className="dr-select"
                          aria-label={t(`修改 ${member.name || member.userId} 的角色`, `Change role for ${member.name || member.userId}`)}
                          value={member.role}
                          disabled={changeRole.isPending}
                          onChange={(event) =>
                            changeRole.mutate({ memberUserId: member.userId, role: event.target.value as TeamRole })
                          }
                        >
                          <option value="editor">{roleLabel('editor', t)}</option>
                          <option value="viewer">{roleLabel('viewer', t)}</option>
                        </select>
                      ) : (
                        <span className={`team-role-badge team-role-${member.role}`}>{roleLabel(member.role, t)}</span>
                      )}
                    </div>
                    <div className="team-member-actions">
                      {isOwner && !isTeamOwner ? (
                        <button
                          type="button"
                          className="dr-btn dr-btn-danger"
                          onClick={() => setRemoving(member)}
                        >
                          {t('移除', 'Remove')}
                        </button>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="dr-card team-panel" aria-labelledby="team-projects-title">
          <div className="team-panel-head">
            <h2 id="team-projects-title">{t('团队项目', 'Team projects')}</h2>
            {canEditProjects ? (
              <button type="button" className="dr-btn" onClick={() => setProjectOpen(true)}>
                <Icon name="plus" size={14} />
                {t('加入项目', 'Add project')}
              </button>
            ) : null}
          </div>
          {projectsQuery.isLoading ? (
            <div className="dr-skeleton" style={{ height: 96 }} />
          ) : projectsQuery.isError ? (
            <div className="team-empty">
              {t('项目加载失败', 'Failed to load projects')}：{(projectsQuery.error as Error).message}
            </div>
          ) : (projectsQuery.data?.items.length ?? 0) === 0 ? (
            <p className="team-empty">{t('团队还没有项目。', 'No team projects yet.')}</p>
          ) : (
            <ul className="team-project-list">
              {projectsQuery.data!.items.map((project) => (
                <li key={project.id}>
                  <Link className="team-project" to={`/project/${project.id}`}>
                    <span className="team-project-cover" aria-hidden="true">
                      {project.coverUrl ? <img src={project.coverUrl} alt="" loading="lazy" /> : <Icon name="film" size={18} />}
                    </span>
                    <span className="team-project-main">
                      <strong>{project.name}</strong>
                      <span>
                        {project.shots?.length ?? 0} {t('镜头', pluralize(project.shots?.length ?? 0, 'shot'))} · {project.status}
                      </span>
                    </span>
                    <Icon name="arrow-right" size={16} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Modal
          open={memberOpen}
          title={t('添加成员', 'Add member')}
          width={460}
          onClose={() => (!addMember.isPending ? setMemberOpen(false) : undefined)}
          footer={
            <>
              <button className="dr-btn" type="button" onClick={() => setMemberOpen(false)}>
                {t('取消', 'Cancel')}
              </button>
              <button
                className="dr-btn dr-btn-primary"
                type="button"
                disabled={!memberId.trim() || addMember.isPending}
                onClick={() => addMember.mutate()}
              >
                {addMember.isPending ? t('添加中…', 'Adding…') : t('添加', 'Add')}
              </button>
            </>
          }
        >
          <div className="team-form">
            <label className="dr-field">
              <span className="dr-label">{t('成员 ID', 'Member ID')}</span>
              <input
                className="dr-input"
                value={memberId}
                onChange={(event) => setMemberId(event.target.value)}
                placeholder={t('邮箱、用户名或用户 ID', 'Email, username or user ID')}
              />
            </label>
            <label className="dr-field">
              <span className="dr-label">{t('昵称', 'Display name')}</span>
              <input
                className="dr-input"
                value={memberName}
                onChange={(event) => setMemberName(event.target.value)}
                placeholder={t('可留空，默认使用 ID', 'Optional, defaults to ID')}
              />
            </label>
            <label className="dr-field">
              <span className="dr-label">{t('角色', 'Role')}</span>
              <select
                className="dr-select"
                value={memberRole}
                onChange={(event) => setMemberRole(event.target.value as TeamRole)}
              >
                <option value="editor">{roleLabel('editor', t)}</option>
                <option value="viewer">{roleLabel('viewer', t)}</option>
              </select>
            </label>
          </div>
        </Modal>

        <Modal
          open={projectOpen}
          title={t('加入团队项目', 'Add team project')}
          width={520}
          onClose={() => (!addProject.isPending ? setProjectOpen(false) : undefined)}
          footer={
            <>
              <button className="dr-btn" type="button" onClick={() => setProjectOpen(false)}>
                {t('取消', 'Cancel')}
              </button>
              <button
                className="dr-btn dr-btn-primary"
                type="button"
                disabled={!projectId || addProject.isPending}
                onClick={() => addProject.mutate()}
              >
                {addProject.isPending ? t('加入中…', 'Adding…') : t('加入团队', 'Add to team')}
              </button>
            </>
          }
        >
          {myProjectsQuery.isLoading ? (
            <div className="dr-skeleton" style={{ height: 80 }} />
          ) : availableProjects.length === 0 ? (
            <p className="team-empty">{t('没有可加入的项目。请先创建项目。', 'No projects available. Create one first.')}</p>
          ) : (
            <label className="dr-field">
              <span className="dr-label">{t('选择项目', 'Select project')}</span>
              <select className="dr-select" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">{t('请选择…', 'Choose…')}</option>
                {availableProjects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Modal>

        <Modal
          open={Boolean(removing)}
          title={t('移除成员', 'Remove member')}
          width={420}
          onClose={() => (!removeMember.isPending ? setRemoving(null) : undefined)}
          footer={
            <>
              <button className="dr-btn" type="button" onClick={() => setRemoving(null)}>
                {t('取消', 'Cancel')}
              </button>
              <button
                className="dr-btn dr-btn-danger"
                type="button"
                disabled={removeMember.isPending}
                onClick={() => removing && removeMember.mutate(removing.userId)}
              >
                {removeMember.isPending ? t('移除中…', 'Removing…') : t('确认移除', 'Remove')}
              </button>
            </>
          }
        >
          <p className="team-confirm-text">
            {t(
              `确认将「${removing?.name || (removing?.userId ?? '')}」移出团队？该成员将失去团队项目访问权限。`,
              `Remove “${removing?.name || (removing?.userId ?? '')}” from the team? They will lose access to team projects.`
            )}
          </p>
        </Modal>
      </div>
    )
  }

  return (
    <div className="dr-page team-page">
      <div className="projects-head">
        <div>
          <p className="dash-eyebrow">Collaboration</p>
          <h1>{t('团队协作', 'Teams')}</h1>
          <p className="projects-lead">
            {t('把项目、成员与角色放在同一个空间里协作交付。', 'Bring projects, members and roles into one delivery space.')}
          </p>
        </div>
        <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={15} />
          {t('创建团队', 'Create team')}
        </button>
      </div>

      {listQuery.isLoading ? (
        <div className="team-grid">
          {[0, 1, 2].map((key) => (
            <div className="dr-skeleton team-skeleton" key={key} />
          ))}
        </div>
      ) : listQuery.isError ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="alert" size={22} />
          </div>
          <div className="dr-state-title">{t('团队加载失败', 'Failed to load teams')}</div>
          <div style={{ fontSize: 12 }}>{(listQuery.error as Error).message}</div>
          <button type="button" className="dr-btn" onClick={() => listQuery.refetch()}>
            {t('重试', 'Retry')}
          </button>
        </div>
      ) : (listQuery.data?.items.length ?? 0) === 0 ? (
        <div className="dr-card dr-state">
          <div className="dr-state-icon">
            <Icon name="users" size={24} />
          </div>
          <div className="dr-state-title">{t('还没有团队', 'No teams yet')}</div>
          <p>{t('创建第一个团队，邀请成员一起完成项目。', 'Create your first team and invite collaborators.')}</p>
          <button type="button" className="dr-btn dr-btn-primary" onClick={() => setCreateOpen(true)}>
            {t('创建团队', 'Create team')}
          </button>
        </div>
      ) : (
        <div className="team-grid">
          {listQuery.data!.items.map((team) => {
            const role = team.members.find((member) => member.userId === userId)?.role
            return (
              <Link className="dr-card dr-card-hover team-card" to={`/team/${team.id}`} key={team.id}>
                <div className="team-card-head">
                  <h2>{team.name}</h2>
                  <span className={`team-role-badge team-role-${role ?? 'none'}`}>
                    {role ? roleLabel(role, t) : t('访客', 'Guest')}
                  </span>
                </div>
                <p>{team.description || t('暂无简介', 'No description')}</p>
                <div className="team-card-meta">
                  <span>
                    <Icon name="users" size={14} />
                    {team.memberCount} {t('成员', pluralize(team.memberCount, 'member'))}
                  </span>
                  <span>
                    <Icon name="film" size={14} />
                    {team.projectCount} {t('项目', pluralize(team.projectCount, 'project'))}
                  </span>
                </div>
                <div className="team-card-foot">
                  <span>{formatDate(team.updatedAt)}</span>
                  <span>
                    {t('进入团队', 'Open team')} <Icon name="arrow-right" size={14} />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <Modal
        open={createOpen}
        title={t('创建团队', 'Create team')}
        width={460}
        onClose={() => (!createTeam.isPending ? setCreateOpen(false) : undefined)}
        footer={
          <>
            <button className="dr-btn" type="button" onClick={() => setCreateOpen(false)}>
              {t('取消', 'Cancel')}
            </button>
            <button
              className="dr-btn dr-btn-primary"
              type="button"
              disabled={!teamName.trim() || createTeam.isPending}
              onClick={() => createTeam.mutate()}
            >
              {createTeam.isPending ? t('创建中…', 'Creating…') : t('创建', 'Create')}
            </button>
          </>
        }
      >
        <div className="team-form">
          <label className="dr-field">
            <span className="dr-label">{t('团队名称', 'Team name')}</span>
            <input
              className="dr-input"
              value={teamName}
              maxLength={40}
              onChange={(event) => setTeamName(event.target.value)}
              placeholder={t('例如：夜航短片工作室', 'e.g. Night Flight Studio')}
            />
          </label>
          <label className="dr-field">
            <span className="dr-label">{t('团队简介', 'Description')}</span>
            <textarea
              className="dr-textarea"
              rows={3}
              value={teamDesc}
              maxLength={200}
              onChange={(event) => setTeamDesc(event.target.value)}
              placeholder={t('这个团队负责什么？', 'What does this team work on?')}
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}
