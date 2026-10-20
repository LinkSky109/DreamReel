import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NovelDetailPage } from './NovelDetail'
import { LangProvider } from '../lib/i18n'

const getNovel = vi.fn()
const advanceNovel = vi.fn()
const ingestNovel = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getNovel: (id: string) => getNovel(id),
    advanceNovel: (id: string) => advanceNovel(id),
    ingestNovel: (id: string, body: unknown) => ingestNovel(id, body),
  },
}))

const detail = {
  id: 'n1',
  title: '长夜将明',
  author: '林川',
  stage: 'source' as const,
  counts: { chapters: 12, characters: 2, episodes: 0 },
  sourceRef: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

function renderPage(initial = '/novel/n1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <LangProvider>
          <Routes>
            <Route path="/novel/:id" element={<NovelDetailPage />} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('NovelDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNovel.mockResolvedValue(detail)
    advanceNovel.mockResolvedValue({ stage: 'characters' })
    ingestNovel.mockResolvedValue({ chapters: 12 })
  })

  it('渲染头部与阶段进度', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '长夜将明' })).toBeInTheDocument()
    expect(screen.getByText(/章 12/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /推进到下一阶段（角色）/ })).toBeInTheDocument()
  })

  it('推进阶段需确认后调用接口', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /推进到下一阶段/ }))
    expect(await screen.findByText('确认推进')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认推进' }))
    await waitFor(() => expect(advanceNovel).toHaveBeenCalledWith('n1'))
  })

  it('来源页可粘贴文本摄取', async () => {
    const user = userEvent.setup()
    renderPage('/novel/n1?tab=source')
    await screen.findByRole('heading', { name: '来源' })
    await user.type(screen.getByPlaceholderText(/粘贴正文/), '第一章 起风')
    await user.click(screen.getByRole('button', { name: /摄取/ }))
    await waitFor(() =>
      expect(ingestNovel).toHaveBeenCalledWith('n1', { sourceType: 'text', text: '第一章 起风' })
    )
  })

  it('未迁移标签给出旧版入口', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('tab', { name: '世界观' }))
    expect(await screen.findByText(/仍在旧版制作台/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /在旧版打开此模块/ })).toHaveAttribute(
      'href',
      '/novel-legacy/n1?tab=world'
    )
  })
})
