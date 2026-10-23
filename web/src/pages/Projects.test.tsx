import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../lib/i18n'
import { ProjectsPage } from './Projects'
import type { Project } from '../domain/types'

const listProjects = vi.fn()
const listTemplates = vi.fn()
const createProject = vi.fn()
const toggleFavorite = vi.fn()
const toggleArchive = vi.fn()
const duplicateProject = vi.fn()
const deleteProject = vi.fn()
const batchFavorite = vi.fn()
const batchArchive = vi.fn()
const batchDelete = vi.fn()
const exportProject = vi.fn()
const importProject = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listProjects: (q: unknown) => listProjects(q),
    listTemplates: () => listTemplates(),
    createProject: (b: unknown) => createProject(b),
    toggleFavorite: (id: string) => toggleFavorite(id),
    toggleArchive: (id: string) => toggleArchive(id),
    duplicateProject: (id: string) => duplicateProject(id),
    deleteProject: (id: string) => deleteProject(id),
    batchFavorite: (ids: string[]) => batchFavorite(ids),
    batchArchive: (ids: string[]) => batchArchive(ids),
    batchDelete: (ids: string[]) => batchDelete(ids),
    exportProject: (id: string) => exportProject(id),
    importProject: (b: unknown) => importProject(b),
  },
}))

const project = {
  id: 'p1',
  name: '星海回声',
  description: '一场关于记忆的太空旅程。',
  status: 'draft',
  platform: 'landscape',
  targetDuration: 60,
  style: '',
  coverUrl: '',
  shots: [],
  characters: [],
  scenes: [],
  tags: [],
  isFavorite: false,
  isArchived: false,
  isPublished: false,
  likeCount: 0,
  viewCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Project

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/projects']}>
        <LangProvider>
          <ProjectsPage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listProjects.mockResolvedValue({ total: 1, items: [project] })
    listTemplates.mockResolvedValue({ items: [] })
    createProject.mockResolvedValue(project)
  })

  it('渲染项目卡片与统计', async () => {
    renderPage()
    expect(await screen.findByText('星海回声')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })

  it('空列表显示空态', async () => {
    listProjects.mockResolvedValue({ total: 0, items: [] })
    renderPage()
    expect(await screen.findByText('还没有项目')).toBeInTheDocument()
  })

  it('打开新建项目弹窗并可提交', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('星海回声')
    const createButton = screen.getAllByRole('button').find((el) => /新建|New/i.test(el.textContent || ''))
    expect(createButton).toBeTruthy()
    await user.click(createButton!)
    const input = await screen.findByPlaceholderText(/例如|e\.g\./i)
    await user.type(input, '新项目')
    const submit = screen.getAllByRole('button').find((el) => /创建|Create/i.test(el.textContent || '') && el !== createButton)
    await user.click(submit!)
    expect(createProject).toHaveBeenCalled()
  })
})
