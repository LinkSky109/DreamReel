import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DirectorsPage } from './Directors'
import { LangProvider } from '../lib/i18n'

const listDirectors = vi.fn()
const listProjects = vi.fn()
const applyDirector = vi.fn()
const disableDirector = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listDirectors: () => listDirectors(),
    listProjects: (params: unknown) => listProjects(params),
    applyDirector: (directorId: string, projectId: string) => applyDirector(directorId, projectId),
    disableDirector: (projectId: string) => disableDirector(projectId),
  },
  hasToken: () => false,
}))

const director = {
  id: 'noir',
  name: '暗夜低语',
  tagline: '黑色电影·暗夜低语',
  era: '1940s 黑色电影',
  statement: '我相信阴影里藏着真相。',
  camera: { style: '低照度低调光摄影', moves: ['缓慢推轨', '荷兰角倾斜构图'] },
  pacing: { tempo: 'slow', shotDurationBias: 1, description: '慢节奏留白' },
  performance: { style: '冷硬克制', cues: ['画外独白旁白', '面部微表情克制'] },
  colorLighting: { palette: '黑白幽蓝', lighting: '高反差低调光', description: '浓重阴影' },
  musicMood: '萨克斯低回的冷爵士',
}

const project = {
  id: 'project-1',
  name: '测试项目',
  description: '',
  coverUrl: '',
  status: 'draft',
  targetDuration: 60,
  style: '',
  platform: 'landscape',
  shots: [{ id: 'shot-1', locked: true }, { id: 'shot-2', locked: false }],
  tags: [],
  isFavorite: false,
  isArchived: false,
  directorMode: { enabled: true, directorId: 'noir' },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/directors']}>
        <LangProvider>
          <Routes>
            <Route path="/directors" element={<DirectorsPage />} />
            <Route path="/projects" element={<div>projects page</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DirectorsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listDirectors.mockResolvedValue({ total: 1, items: [director] })
    listProjects.mockResolvedValue({ items: [project], total: 1 })
    applyDirector.mockResolvedValue({
      director,
      project,
      guidance: [{ index: 0, cameraMovement: '缓慢推轨', duration: 6, directorGuidance: '表演:画外独白' }],
      appliedCount: 1,
      skippedCount: 1,
      skipped: [{ index: 0, shotId: 'shot-1' }],
    })
    disableDirector.mockResolvedValue(project)
  })

  it('渲染导演档案', async () => {
    renderPage()
    expect(await screen.findByText('暗夜低语')).toBeInTheDocument()
    expect(screen.getByText('慢节奏留白')).toBeInTheDocument()
  })

  it('选择项目后应用并展示跳过锁定镜头', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /查看档案并应用/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('我相信阴影里藏着真相。')).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByRole('combobox'), 'project-1')
    expect(within(dialog).getByText(/1 个锁定镜头将跳过/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '应用并编排分镜' }))
    await waitFor(() => expect(applyDirector).toHaveBeenCalledWith('noir', 'project-1'))
    expect(await within(dialog).findByText(/镜已编排/)).toBeInTheDocument()
    expect(within(dialog).getAllByText('缓慢推轨').length).toBeGreaterThan(0)
  })
})
