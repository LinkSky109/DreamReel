import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NovelsPage } from './Novels'
import { LangProvider } from '../lib/i18n'

const listNovels = vi.fn()
const createNovel = vi.fn()
const deleteNovel = vi.fn()
const ingestNovel = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listNovels: () => listNovels(),
    createNovel: (body: unknown) => createNovel(body),
    deleteNovel: (id: string) => deleteNovel(id),
    ingestNovel: (id: string, body: unknown) => ingestNovel(id, body),
  },
}))

const novel = {
  id: 'n1',
  title: '长夜将明',
  author: '林川',
  stage: 'source' as const,
  counts: { chapters: 12, characters: 0, episodes: 0 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/novels']}>
        <LangProvider>
          <Routes>
            <Route path="/novels" element={<NovelsPage />} />
            <Route path="/novel/:id" element={<div>detail page</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('NovelsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('渲染小说列表与阶段/计数', async () => {
    listNovels.mockResolvedValue([novel])
    renderPage()
    expect((await screen.findAllByText('长夜将明')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/林川/).length).toBeGreaterThan(0)
    expect(screen.getByText(/12 章/)).toBeInTheDocument()
  })

  it('空列表展示导入入口', async () => {
    listNovels.mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('还没有小说项目')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '导入第一部小说' })).toBeInTheDocument()
  })

  it('导入后跳转详情', async () => {
    listNovels.mockResolvedValue([])
    createNovel.mockResolvedValue({ ...novel, id: 'n2' })
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /导入小说/ }))
    await user.type(await screen.findByPlaceholderText(/例：长夜将明/), '新书')
    await user.click(screen.getByRole('button', { name: '导入并切章' }))
    await waitFor(() => expect(createNovel).toHaveBeenCalledWith(expect.objectContaining({ title: '新书' })))
    expect(await screen.findByText('detail page')).toBeInTheDocument()
  })

  it('删除需确认并调用接口', async () => {
    listNovels.mockResolvedValue([novel])
    deleteNovel.mockResolvedValue({})
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /删除 长夜将明/ }))
    expect(await screen.findByText('确认删除')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认删除' }))
    await waitFor(() => expect(deleteNovel).toHaveBeenCalledWith('n1'))
  })
})
