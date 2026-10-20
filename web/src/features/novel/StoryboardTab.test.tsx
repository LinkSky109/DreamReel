import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StoryboardTab } from './StoryboardTab'
import { LangProvider } from '../../lib/i18n'
import type { NovelDetail } from '../../domain/types'

const getNovelStoryboard = vi.fn()
const createNovelStoryboardFromMarks = vi.fn()
const updateNovelStoryboardShot = vi.fn()
const deleteNovelStoryboardShot = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    getNovelStoryboard: (id: string) => getNovelStoryboard(id),
    createNovelStoryboardFromMarks: (id: string) => createNovelStoryboardFromMarks(id),
    updateNovelStoryboardShot: (id: string, sid: string, body: unknown) => updateNovelStoryboardShot(id, sid, body),
    deleteNovelStoryboardShot: (id: string, sid: string) => deleteNovelStoryboardShot(id, sid),
  },
}))

const novel: NovelDetail = {
  id: 'n1',
  title: '长夜将明',
  stage: 'episodes',
  counts: { chapters: 2, characters: 3, episodes: 1 },
  marks: [
    { chapter: 0, para: 0 },
    { chapter: 1, para: 1 },
  ],
  createdAt: '',
  updatedAt: '',
}

const shot = {
  id: 's1',
  chapter: 0,
  para: 0,
  chapterTitle: '第一章',
  text: '风从北面来。',
  duration: 5,
  shotType: '中景',
  camera: '固定',
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LangProvider>
        <StoryboardTab novel={novel} onChanged={vi.fn()} />
      </LangProvider>
    </QueryClientProvider>
  )
}

describe('StoryboardTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNovelStoryboard.mockResolvedValue([shot])
    createNovelStoryboardFromMarks.mockResolvedValue({ shots: [shot], created: 2 })
    updateNovelStoryboardShot.mockResolvedValue(shot)
    deleteNovelStoryboardShot.mockResolvedValue({})
  })

  it('渲染分镜草稿与来源', async () => {
    renderTab()
    expect(await screen.findByDisplayValue('风从北面来。')).toBeInTheDocument()
    expect(screen.getByText(/第 1 章/)).toBeInTheDocument()
  })

  it('编辑并保存分镜', async () => {
    const user = userEvent.setup()
    renderTab()
    const text = await screen.findByDisplayValue('风从北面来。')
    await user.clear(text)
    await user.type(text, '风从北面来，城门开着。')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(updateNovelStoryboardShot).toHaveBeenCalledWith(
        'n1',
        's1',
        expect.objectContaining({ text: '风从北面来，城门开着。', duration: 5 })
      )
    )
  })

  it('从标记生成草稿', async () => {
    const user = userEvent.setup()
    getNovelStoryboard.mockResolvedValue([])
    renderTab()
    await user.click(await screen.findByRole('button', { name: '从标记生成' }))
    await waitFor(() => expect(createNovelStoryboardFromMarks).toHaveBeenCalledWith('n1'))
  })

  it('删除分镜', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByDisplayValue('风从北面来。')
    await user.click(screen.getByRole('button', { name: '删除分镜' }))
    await waitFor(() => expect(deleteNovelStoryboardShot).toHaveBeenCalledWith('n1', 's1'))
  })
})
