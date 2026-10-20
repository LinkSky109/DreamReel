import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { RecycleBinPage } from './RecycleBin'
import { LangProvider } from '../lib/i18n'
import type { RecycleBinItem } from '../domain/types'

const getRecycleBin = vi.fn()
const getRecycleBinStats = vi.fn()
const restoreProject = vi.fn()
const permanentlyDeleteProject = vi.fn()
const emptyRecycleBin = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getRecycleBin: (limit: number) => getRecycleBin(limit),
    getRecycleBinStats: () => getRecycleBinStats(),
    restoreProject: (id: string) => restoreProject(id),
    permanentlyDeleteProject: (id: string) => permanentlyDeleteProject(id),
    emptyRecycleBin: () => emptyRecycleBin(),
  },
}))

const item = {
  id: 'p1',
  name: '被删项目',
  description: '测试项目',
  status: 'draft',
  style: 'cinematic',
  platform: 'landscape',
  shots: [{ id: 's1' }],
  tags: [],
  deletedAt: '2026-10-20T06:00:00.000Z',
  createdAt: '',
  updatedAt: '',
} as unknown as RecycleBinItem

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LangProvider>
          <RecycleBinPage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('RecycleBinPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getRecycleBin.mockResolvedValue({ total: 1, items: [item] })
    getRecycleBinStats.mockResolvedValue({ total: 1, newestDeletedAt: item.deletedAt })
    restoreProject.mockResolvedValue({})
    permanentlyDeleteProject.mockResolvedValue({})
    emptyRecycleBin.mockResolvedValue({ deletedCount: 1 })
  })

  it('渲染回收站项目', async () => {
    renderPage()
    expect(await screen.findByText('被删项目')).toBeInTheDocument()
  })

  it('恢复项目', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /恢复/ }))
    await waitFor(() => expect(restoreProject).toHaveBeenCalledWith('p1'))
  })

  it('永久删除需确认', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '永久删除' }))
    await user.click(await screen.findByRole('button', { name: '确认永久删除' }))
    await waitFor(() => expect(permanentlyDeleteProject).toHaveBeenCalledWith('p1'))
  })

  it('清空回收站需确认', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '清空回收站' }))
    await user.click(await screen.findByRole('button', { name: '确认清空' }))
    await waitFor(() => expect(emptyRecycleBin).toHaveBeenCalled())
  })

  it('空状态', async () => {
    getRecycleBin.mockResolvedValue({ total: 0, items: [] })
    getRecycleBinStats.mockResolvedValue({ total: 0 })
    renderPage()
    expect(await screen.findByText('回收站是空的')).toBeInTheDocument()
  })
})
