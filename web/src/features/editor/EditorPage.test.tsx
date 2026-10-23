import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LangProvider } from '../../lib/i18n'
import { EditorPage } from './EditorPage'
import type { Project } from '../../domain/types'

const getProject = vi.fn()
const getQuota = vi.fn()
const listStyles = vi.fn()
const updateProject = vi.fn()
const exportProjectVideo = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    getProject: (id: string) => getProject(id),
    getQuota: () => getQuota(),
    listStyles: () => listStyles(),
    updateProject: (id: string, body: unknown) => updateProject(id, body),
    exportProjectVideo: (id: string) => exportProjectVideo(id),
    exportProject: vi.fn(),
  },
}))

const project: Project = {
  id: 'p1',
  name: '星海回声',
  description: '测试项目',
  status: 'draft',
  targetDuration: 60,
  style: '',
  platform: 'landscape',
  coverUrl: '',
  userId: 'u1',
  shots: [],
  characters: [],
  scenes: [],
  script: { synopsis: '', shots: [] },
  tags: [],
  isFavorite: false,
  isArchived: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
} as unknown as Project

function renderEditor(path = '/project/p1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LangProvider>
          <Routes>
            <Route path="/project/:id" element={<EditorPage />} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('EditorPage RTL smoke', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getProject.mockResolvedValue(project)
    getQuota.mockResolvedValue({ video: { daily: { used: 0, limit: 5, remaining: 5 } } })
    listStyles.mockResolvedValue({ items: [] })
    updateProject.mockResolvedValue(project)
    exportProjectVideo.mockResolvedValue({})
  })

  it('渲染项目名与 5 个主阶段', async () => {
    const { container } = renderEditor()
    expect(await screen.findByRole('heading', { name: '星海回声' })).toBeInTheDocument()
    const labels = Array.from(container.querySelectorAll('button.ed-stage')).map((el) =>
      el.textContent?.trim()
    )
    for (const label of ['剧本', '分镜', '生成', '配音', '剪辑']) {
      expect(labels.some((text) => text?.includes(label))).toBe(true)
    }
  })

  it('通过 URL 打开分镜阶段并标记 current', async () => {
    renderEditor('/project/p1?tab=shots')
    const shots = await screen.findByRole('button', { name: /分镜/ })
    expect(shots).toHaveAttribute('aria-current', 'step')
  })

  it('点击阶段按钮切换 current', async () => {
    const user = userEvent.setup()
    const { container } = renderEditor()
    await screen.findByRole('heading', { name: '星海回声' })
    const generate = Array.from(container.querySelectorAll('button.ed-stage')).find((el) =>
      el.textContent?.includes('生成')
    ) as HTMLButtonElement
    await user.click(generate)
    expect(generate).toHaveAttribute('aria-current', 'step')
  })
})
