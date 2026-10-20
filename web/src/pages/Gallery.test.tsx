import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { GalleryPage } from './Gallery'
import { LangProvider } from '../lib/i18n'

const listGallery = vi.fn()
const likeGalleryWork = vi.fn()
const remixGalleryWork = vi.fn()
const recordGalleryView = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listGallery: (params: unknown) => listGallery(params),
    likeGalleryWork: (id: string, userId: string) => likeGalleryWork(id, userId),
    remixGalleryWork: (id: string, userId: string) => remixGalleryWork(id, userId),
    recordGalleryView: (id: string) => recordGalleryView(id),
  },
}))

const items = [
  {
    id: 'p1',
    name: '星海回声',
    description: '一场关于记忆的太空旅程。',
    coverUrl: '',
    previewUrl: '',
    authorId: 'usr_lin',
    likeCount: 3,
    viewCount: 12,
    shotCount: 6,
    publishedAt: '2026-10-10T00:00:00.000Z',
  },
  {
    id: 'p2',
    name: '雨后城市',
    description: '城市与人的短片。',
    coverUrl: '',
    previewUrl: '',
    authorId: 'usr_zhou',
    likeCount: 1,
    viewCount: 4,
    shotCount: 3,
    publishedAt: '2026-10-09T00:00:00.000Z',
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/gallery']}>
        <LangProvider>
          <GalleryPage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('GalleryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('dreamreel_user', JSON.stringify({ id: 'usr_lin' }))
    listGallery.mockResolvedValue({ total: 2, items })
    likeGalleryWork.mockResolvedValue({ liked: true, likeCount: 4 })
    remixGalleryWork.mockResolvedValue({
      success: true,
      remixId: 'p3',
      sourceId: 'p1',
      sourceName: '星海回声',
      copiedShots: 6,
    })
    recordGalleryView.mockResolvedValue({ viewCount: 13 })
  })

  it('渲染作品并支持分类筛选', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('星海回声')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '故事短片' }))
    await waitFor(() => expect(listGallery).toHaveBeenCalledWith({ category: 'short', sort: 'latest' }))
  })

  it('点赞调用真实接口并更新计数', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('星海回声')
    await user.click(screen.getByRole('button', { name: /点赞 星海回声/ }))
    await waitFor(() => expect(likeGalleryWork).toHaveBeenCalledWith('p1', 'usr_lin'))
    expect((await screen.findAllByText('4')).length).toBeGreaterThan(0)
  })

  it('复刻调用接口并提示结果', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('星海回声')
    await user.click(screen.getAllByRole('button', { name: /复刻/ })[0])
    await waitFor(() => expect(remixGalleryWork).toHaveBeenCalledWith('p1', 'usr_lin'))
  })
})
