import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { NovelDetailPage } from './NovelDetail'
import { LangProvider } from '../lib/i18n'

const getNovel = vi.fn()
const listNovelCharacters = vi.fn()
const listNovelWorldEntities = vi.fn()
const getNovelChunks = vi.fn()
const toggleNovelMark = vi.fn()
const reviewNovelCharacter = vi.fn()
const reviewNovelWorldEntity = vi.fn()
const confirmAllNovelReview = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getNovel: (id: string) => getNovel(id),
    listNovelCharacters: (id: string) => listNovelCharacters(id),
    listNovelWorldEntities: (id: string) => listNovelWorldEntities(id),
    getNovelChunks: (id: string) => getNovelChunks(id),
    toggleNovelMark: (id: string, chapter: number, para: number) => toggleNovelMark(id, chapter, para),
    reviewNovelCharacter: (id: string, cid: string, body: unknown) => reviewNovelCharacter(id, cid, body),
    reviewNovelWorldEntity: (id: string, eid: string, body: unknown) => reviewNovelWorldEntity(id, eid, body),
    confirmAllNovelReview: (id: string) => confirmAllNovelReview(id),
  },
}))

const novel = {
  id: 'n1',
  title: '长夜将明',
  author: '林川',
  stage: 'characters' as const,
  counts: { chapters: 1, characters: 1, episodes: 0, worldEntities: 1 },
  reviewStats: { approved: 0 },
  marks: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const characters = [
  {
    id: 'c1',
    novelId: 'n1',
    name: '林川',
    aliases: [],
    kind: 'individual' as const,
    card: {},
    provider: 'heuristic',
    status: 'pending' as const,
    note: '待核对年龄',
    createdAt: '',
    updatedAt: '',
  },
]

const entities = [
  {
    id: 'e1',
    novelId: 'n1',
    type: 'faction',
    name: '边城镖局',
    aliases: [],
    attributes: {},
    relations: [],
    mentions: 2,
    provider: 'heuristic',
    status: 'pending' as const,
    note: '',
    createdAt: '',
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/novel/n1']}>
        <LangProvider>
          <Routes>
            <Route path="/novel/:id" element={<NovelDetailPage />} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('NovelDetail review', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNovel.mockResolvedValue(novel)
    listNovelCharacters.mockResolvedValue(characters)
    listNovelWorldEntities.mockResolvedValue(entities)
    getNovelChunks.mockResolvedValue([
      { id: 'ch1', novelId: 'n1', index: 0, chapterTitle: '第一章 起风', text: '风从北面来。\n林川出发。' },
    ])
    toggleNovelMark.mockResolvedValue({ marks: [{ chapter: 0, para: 0 }], marked: true })
    reviewNovelCharacter.mockResolvedValue({})
    reviewNovelWorldEntity.mockResolvedValue({})
    confirmAllNovelReview.mockResolvedValue({ characters: 1, entities: 1 })
  })

  it('点击段落标记为分镜素材', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByText('第一章 起风'))
    await user.click(await screen.findByRole('button', { name: /风从北面来/ }))
    await waitFor(() => expect(toggleNovelMark).toHaveBeenCalledWith('n1', 0, 0))
  })

  it('角色审校状态与备注保存', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('林川')
    const groups = document.querySelectorAll('.nv-rail-group')
    await user.click(groups[2].querySelectorAll('.nv-rail-item')[0] as HTMLElement)
    expect(await screen.findByText('审校检查器')).toBeInTheDocument()
    await user.click(within(document.querySelector('.nv-inspector') as HTMLElement).getByRole('button', { name: '需修订' }))
    await waitFor(() =>
      expect(reviewNovelCharacter).toHaveBeenCalledWith('n1', 'c1', { status: 'revision', note: '待核对年龄' })
    )
  })

  it('世界观实体可审校', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findAllByText('边城镖局')
    const groups = document.querySelectorAll('.nv-rail-group')
    await user.click(groups[3].querySelectorAll('.nv-rail-item')[0] as HTMLElement)
    await user.click(await screen.findByRole('button', { name: '已确认' }))
    await waitFor(() =>
      expect(reviewNovelWorldEntity).toHaveBeenCalledWith('n1', 'e1', { status: 'confirmed', note: '' })
    )
  })

  it('全部确认调用接口', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '全部确认' }))
    await waitFor(() => expect(confirmAllNovelReview).toHaveBeenCalledWith('n1'))
  })
})
