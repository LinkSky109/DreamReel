import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ArtTab } from './ArtTab'
import { LangProvider } from '../../lib/i18n'
import type { NovelDetail } from '../../domain/types'

const listNovelAssets = vi.fn()
const createNovelAsset = vi.fn()
const updateNovelAsset = vi.fn()
const deleteNovelAsset = vi.fn()
const generateNovelAsset = vi.fn()
const bulkGenerateNovelAssets = vi.fn()
const suggestNovelAssets = vi.fn()
const cancelNovelAssetBulk = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    listNovelAssets: (id: string) => listNovelAssets(id),
    createNovelAsset: (id: string, body: unknown) => createNovelAsset(id, body),
    updateNovelAsset: (id: string, aid: string, body: unknown) => updateNovelAsset(id, aid, body),
    deleteNovelAsset: (id: string, aid: string) => deleteNovelAsset(id, aid),
    generateNovelAsset: (id: string, aid: string) => generateNovelAsset(id, aid),
    bulkGenerateNovelAssets: (id: string, body: unknown) => bulkGenerateNovelAssets(id, body),
    suggestNovelAssets: (id: string) => suggestNovelAssets(id),
    cancelNovelAssetBulk: (id: string) => cancelNovelAssetBulk(id),
  },
}))

vi.mock('../../components/AuthImage', () => ({
  AuthImage: ({ alt }: { alt: string }) => <div data-testid="auth-image">{alt}</div>,
}))

const novel: NovelDetail = {
  id: 'n1',
  title: '长夜将明',
  stage: 'art' as never,
  counts: { chapters: 12, characters: 3, episodes: 3 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const assets = [
  {
    id: 'a1',
    novelId: 'n1',
    category: 'character' as const,
    name: '林川',
    prompt: '边城镖师',
    source: 'character',
    status: 'generated',
    imageUrl: '/storage/a1.png',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'a2',
    novelId: 'n1',
    category: 'scene' as const,
    name: '边城',
    prompt: '',
    source: 'manual',
    status: 'draft',
    imageUrl: null,
    createdAt: '2026-10-01T00:00:00.000Z',
  },
]

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LangProvider>
        <ArtTab novel={novel} onChanged={vi.fn()} />
      </LangProvider>
    </QueryClientProvider>
  )
}

describe('ArtTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listNovelAssets.mockResolvedValue({
      assets,
      stats: { total: 2, generated: 1, failed: 0, byCategory: { character: 1, scene: 1 } },
    })
    createNovelAsset.mockResolvedValue({})
    updateNovelAsset.mockResolvedValue({})
    deleteNovelAsset.mockResolvedValue({})
    generateNovelAsset.mockResolvedValue({})
    bulkGenerateNovelAssets.mockResolvedValue({
      processed: 1,
      ok: 1,
      failed: 0,
      total: 2,
      withImages: 2,
      remaining: 0,
    })
    suggestNovelAssets.mockResolvedValue({ created: 2 })
    cancelNovelAssetBulk.mockResolvedValue({ cancelled: true })
  })

  it('渲染统计与卡片', async () => {
    renderTab()
    expect((await screen.findAllByText('林川')).length).toBeGreaterThan(0)
    expect(screen.getByText('边城')).toBeInTheDocument()
    expect(screen.getByText(/已出图 1/)).toBeInTheDocument()
    expect(screen.getByTestId('auth-image')).toHaveTextContent('林川')
  })

  it('按类别筛选', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findAllByText('林川')
    await user.click(screen.getByRole('button', { name: /场景 1/ }))
    expect(screen.queryAllByText('林川')).toHaveLength(0)
    expect(screen.getByText('边城')).toBeInTheDocument()
  })

  it('新增设定图', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.type(await screen.findByPlaceholderText(/名称/), '王城')
    await user.click(screen.getByRole('button', { name: '新增' }))
    await waitFor(() =>
      expect(createNovelAsset).toHaveBeenCalledWith('n1', {
        category: 'character',
        name: '王城',
        prompt: undefined,
      })
    )
  })

  it('编辑保存名称与描述', async () => {
    const user = userEvent.setup()
    renderTab()
    const strong = (await screen.findAllByText('林川')).find((el) => el.tagName === 'STRONG')!
    const card = strong.closest('.dr-art-card') as HTMLElement
    await user.click(card.querySelector('button:nth-of-type(2)') as HTMLElement)
    const name = await screen.findByLabelText('名称')
    await user.clear(name)
    await user.type(name, '林川·青年')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(updateNovelAsset).toHaveBeenCalledWith('n1', 'a1', {
        name: '林川·青年',
        prompt: '边城镖师',
      })
    )
  })

  it('批量出图按当前类别调用', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findAllByText('林川')
    await user.click(screen.getByRole('button', { name: /角色 1/ }))
    await user.click(screen.getByRole('button', { name: '本类批量出图' }))
    await waitFor(() =>
      expect(bulkGenerateNovelAssets).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({ categories: ['character'], reset: true })
      )
    )
  })
})
