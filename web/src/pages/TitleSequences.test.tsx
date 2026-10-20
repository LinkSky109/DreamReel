import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TitleSequencesPage } from './TitleSequences'
import { LangProvider } from '../lib/i18n'

const listTitleSequences = vi.fn()
const listProjects = vi.fn()
const generateTitleSequence = vi.fn()
const getProject = vi.fn()
const updateProject = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listTitleSequences: () => listTitleSequences(),
    listProjects: (params: unknown) => listProjects(params),
    generateTitleSequence: (id: string, body: unknown) => generateTitleSequence(id, body),
    getProject: (id: string) => getProject(id),
    updateProject: (id: string, body: unknown) => updateProject(id, body),
  },
  hasToken: () => false,
}))

const template = {
  id: 'classic-gold',
  name: '黑底金字经典',
  visualDescription: '近黑背景居中呈现烫金片名。',
  musicMood: '低沉弦乐铺底',
  ffmpeg: { duration: 4, resolution: '720p', aspectRatio: '16:9', bgColors: ['0x050505', '0x1a1408'], titleColor: '#d9b45a' },
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
  shots: [{ id: 'shot-1', index: 0, description: '原镜头', duration: 5, status: 'completed' }],
  tags: [],
  isFavorite: false,
  isArchived: false,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/title-sequences']}>
        <LangProvider>
          <Routes>
            <Route path="/title-sequences" element={<TitleSequencesPage />} />
            <Route path="/projects" element={<div>projects page</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('TitleSequencesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listTitleSequences.mockResolvedValue({ total: 1, items: [template] })
    listProjects.mockResolvedValue({ items: [project], total: 1 })
    generateTitleSequence.mockResolvedValue({
      templateId: template.id,
      templateName: template.name,
      projectId: project.id,
      title: '梦境重启',
      subtitle: 'A Dream Reel Story',
      duration: 4,
      videoUrl: '/storage/title-sequences/demo.mp4',
      filePath: '/tmp/demo.mp4',
      titleRendered: true,
      audioTrack: true,
      audio: 'silent',
      musicMood: template.musicMood,
    })
    getProject.mockResolvedValue(project)
    updateProject.mockResolvedValue(project)
  })

  it('选择模板并生成片头', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('黑底金字经典')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /使用此模板/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/片名/), '梦境重启')
    expect(within(dialog).getByText('梦境重启')).toBeInTheDocument()
    await user.selectOptions(within(dialog).getByRole('combobox'), 'project-1')
    await user.click(within(dialog).getByRole('button', { name: '生成片头' }))
    await waitFor(() =>
      expect(generateTitleSequence).toHaveBeenCalledWith('classic-gold', { projectId: 'project-1', title: '梦境重启', subtitle: '' })
    )
    expect(within(dialog).getByText('标题已上屏')).toBeInTheDocument()
  })

  it('把生成的片头插入项目最前面', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /使用此模板/ }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/片名/), '梦境重启')
    await user.selectOptions(within(dialog).getByRole('combobox'), 'project-1')
    await user.click(within(dialog).getByRole('button', { name: '生成片头' }))
    await user.click(await within(dialog).findByRole('button', { name: '插入项目片头' }))
    await waitFor(() => expect(updateProject).toHaveBeenCalled())
    const shots = updateProject.mock.calls[0][1].shots
    expect(shots).toHaveLength(2)
    expect(shots[0].videoUrl).toBe('/storage/title-sequences/demo.mp4')
    expect(shots[0].status).toBe('completed')
    expect(shots[1].index).toBe(1)
  })
})
