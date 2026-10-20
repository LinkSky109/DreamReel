import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TeamsPage } from './Teams'
import { LangProvider } from '../lib/i18n'

const listTeams = vi.fn()
const getTeam = vi.fn()
const listTeamProjects = vi.fn()
const listProjects = vi.fn()
const createTeam = vi.fn()
const addTeamMember = vi.fn()
const updateTeamMemberRole = vi.fn()
const removeTeamMember = vi.fn()
const addTeamProject = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listTeams: (userId?: string) => listTeams(userId),
    getTeam: (id: string) => getTeam(id),
    listTeamProjects: (id: string) => listTeamProjects(id),
    listProjects: (params: unknown) => listProjects(params),
    createTeam: (body: unknown) => createTeam(body),
    addTeamMember: (id: string, body: unknown) => addTeamMember(id, body),
    updateTeamMemberRole: (id: string, userId: string, role: string) =>
      updateTeamMemberRole(id, userId, role),
    removeTeamMember: (id: string, userId: string) => removeTeamMember(id, userId),
    addTeamProject: (id: string, projectId: string) => addTeamProject(id, projectId),
  },
}))

const team = {
  id: 'team_1',
  name: '夜航工作室',
  description: '科幻短片团队',
  ownerId: 'usr_owner',
  members: [
    { userId: 'usr_owner', name: '林一', role: 'owner' },
    { userId: 'usr_editor', name: '周野', role: 'editor' },
  ],
  projectIds: ['p1'],
  memberCount: 2,
  projectCount: 1,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
}

function renderPage(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LangProvider>
          <Routes>
            <Route path="/teams" element={<TeamsPage />} />
            <Route path="/team/:id" element={<TeamsPage />} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('TeamsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('dreamreel_user', JSON.stringify({ id: 'usr_owner', username: '林一' }))
    listTeams.mockResolvedValue({ total: 1, items: [team] })
    getTeam.mockResolvedValue(team)
    listTeamProjects.mockResolvedValue({
      total: 1,
      items: [{ id: 'p1', name: '星海回声', status: 'in-progress', shots: [{ id: 's1' }, { id: 's2' }] }],
    })
    listProjects.mockResolvedValue({ total: 1, items: [{ id: 'p2', name: '另一项目' }] })
    createTeam.mockResolvedValue({ ...team, id: 'team_2', name: '新团队' })
    updateTeamMemberRole.mockResolvedValue(team)
    removeTeamMember.mockResolvedValue(team)
    addTeamMember.mockResolvedValue(team)
    addTeamProject.mockResolvedValue(team)
  })

  it('渲染团队列表与创建入口', async () => {
    renderPage('/teams')
    expect(await screen.findByText('夜航工作室')).toBeInTheDocument()
    expect(screen.getByText('科幻短片团队')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /创建团队/ })).toBeInTheDocument()
  })

  it('团队详情展示成员与项目，所有者可修改角色', async () => {
    const user = userEvent.setup()
    renderPage('/team/team_1')
    expect(await screen.findByRole('heading', { name: '夜航工作室' })).toBeInTheDocument()
    expect(screen.getByText('周野')).toBeInTheDocument()
    expect(await screen.findByText('星海回声')).toBeInTheDocument()

    const roleSelect = screen.getByRole('combobox', { name: /周野/ })
    await user.selectOptions(roleSelect, 'viewer')
    await waitFor(() => expect(updateTeamMemberRole).toHaveBeenCalledWith('team_1', 'usr_editor', 'viewer'))
  })

  it('创建团队后跳转详情', async () => {
    const user = userEvent.setup()
    renderPage('/teams')
    await user.click(screen.getByRole('button', { name: /创建团队/ }))
    await user.type(screen.getByLabelText('团队名称'), '新团队')
    await user.click(screen.getAllByRole('button', { name: '创建' })[0])
    await waitFor(() =>
      expect(createTeam).toHaveBeenCalledWith({ name: '新团队', description: '' })
    )
  })
})
