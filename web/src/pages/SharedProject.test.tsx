import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { SharedProjectPage } from './SharedProject'
import { LangProvider } from '../lib/i18n'

const getSharedProject = vi.fn()
const getProject = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getSharedProject: (token: string) => getSharedProject(token),
    getProject: (id: string) => getProject(id),
  },
}))

function renderPage(path = '/share/tok_1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LangProvider>
          <Routes>
            <Route path="/share/:token" element={<SharedProjectPage />} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SharedProjectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSharedProject.mockResolvedValue({
      projectId: 'p1',
      share: { isPublic: true, allowComments: false },
    })
    getProject.mockResolvedValue({
      id: 'p1',
      name: '星海回声',
      description: '一场关于记忆的太空旅程。',
      platform: 'landscape',
      characters: [{ id: 'c1', name: '林' }],
      shots: [
        {
          id: 's1',
          index: 0,
          description: '飞船穿过星云',
          status: 'completed',
          duration: 5,
          videoUrl: '/storage/videos/s1.mp4',
        },
      ],
    })
  })

  it('以独立布局渲染分享项目', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '星海回声' })).toBeInTheDocument()
    expect(screen.getByText('一场关于记忆的太空旅程。')).toBeInTheDocument()
    expect(screen.getByText(/飞船穿过星云/)).toBeInTheDocument()
    expect(screen.getByText('只读分享')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '侧栏导航' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '面包屑' })).not.toBeInTheDocument()
  })

  it('无效链接显示可读错误态', async () => {
    getSharedProject.mockRejectedValue(new Error('分享链接无效或项目未公开'))
    renderPage('/share/bad')
    expect(await screen.findByText('分享链接无效')).toBeInTheDocument()
    expect(screen.getByText(/链接可能已关闭公开访问/)).toBeInTheDocument()
  })
})
