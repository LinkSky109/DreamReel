import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { StudiosPage } from './Studios'
import { LangProvider } from '../lib/i18n'

const listStudios = vi.fn()
const getStudio = vi.fn()
const createStudio = vi.fn()
const signStudioMember = vi.fn()
const removeStudioMember = vi.fn()
const createStudioShow = vi.fn()
const addProjectToStudio = vi.fn()
const addProjectToStudioShow = vi.fn()
const listProjects = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listStudios: () => listStudios(),
    getStudio: (id: string) => getStudio(id),
    createStudio: (body: unknown) => createStudio(body),
    signStudioMember: (id: string, body: unknown) => signStudioMember(id, body),
    removeStudioMember: (id: string, userId: string) => removeStudioMember(id, userId),
    createStudioShow: (id: string, body: unknown) => createStudioShow(id, body),
    addProjectToStudio: (id: string, projectId: string) => addProjectToStudio(id, projectId),
    addProjectToStudioShow: (id: string, showId: string, projectId: string) => addProjectToStudioShow(id, showId, projectId),
    listProjects: (params: unknown) => listProjects(params),
  },
  hasToken: () => false,
}))

const studio = {
  id: 'studio-1',
  name: '雨夜影像厂',
  description: '拍城市里被忽略的瞬间。',
  stylePositioning: '黑色电影 / 都市悬疑',
  curatorId: 'usr_owner',
  curatorName: '林默',
  members: [{ userId: 'usr_owner', name: '林默', role: 'director', joinedAt: '2026-10-01' }],
  shows: [{ id: 'show-1', title: '夜班', synopsis: '凌晨三点的便利店。', projectIds: ['project-1'] }],
  projectIds: ['project-1'],
  memberCount: 1,
  showCount: 1,
  projectCount: 1,
  works: [{ id: 'project-1', name: '夜班便利店', status: 'completed', shotCount: 8 }],
}

function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LangProvider>
          <Routes>
            <Route path="/studios" element={<StudiosPage />} />
            <Route path="/studio/:id" element={<StudiosPage />} />
            <Route path="/project/:id" element={<div>editor</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('StudiosPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    listStudios.mockResolvedValue({ total: 1, items: [studio] })
    getStudio.mockResolvedValue(studio)
    createStudio.mockResolvedValue({ ...studio, id: 'studio-new', name: '新城影像' })
    signStudioMember.mockResolvedValue(studio)
    listProjects.mockResolvedValue({ items: [] })
  })

  it('渲染厂牌广场', async () => {
    renderAt('/studios')
    expect(await screen.findByText('雨夜影像厂')).toBeInTheDocument()
    expect(screen.getByText('黑色电影 / 都市悬疑')).toBeInTheDocument()
  })

  it('创建厂牌并带上当前用户为主理人', async () => {
    const user = userEvent.setup()
    renderAt('/studios')
    await user.click(await screen.findByRole('button', { name: '创建厂牌' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/厂牌名称/), '新城影像')
    await user.click(within(dialog).getByRole('button', { name: '创建厂牌' }))
    await waitFor(() =>
      expect(createStudio).toHaveBeenCalledWith(expect.objectContaining({ name: '新城影像', ownerId: 'usr_a' }))
    )
  })

  it('厂牌详情展示剧集与作品，并可加入', async () => {
    const user = userEvent.setup()
    renderAt('/studio/studio-1')
    expect(await screen.findByText('夜班便利店')).toBeInTheDocument()
    expect(screen.getAllByText('夜班').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: '加入厂牌' }))
    await waitFor(() => expect(signStudioMember).toHaveBeenCalledWith('studio-1', expect.objectContaining({ userId: 'usr_a', role: 'creator' })))
  })
})
