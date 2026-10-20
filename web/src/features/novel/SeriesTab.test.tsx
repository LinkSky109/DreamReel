import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SeriesTab } from './SeriesTab'
import { LangProvider } from '../../lib/i18n'
import type { NovelDetail } from '../../domain/types'

const listNovelSeasons = vi.fn()
const getNovelSeriesEstimate = vi.fn()
const planNovelSeries = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    listNovelSeasons: (id: string) => listNovelSeasons(id),
    getNovelSeriesEstimate: (id: string) => getNovelSeriesEstimate(id),
    planNovelSeries: (id: string, body: unknown) => planNovelSeries(id, body),
  },
}))

const novel: NovelDetail = {
  id: 'n1',
  title: '长夜将明',
  stage: 'series',
  counts: { chapters: 12, characters: 3, episodes: 0 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

function renderTab(stage: NovelDetail['stage'] = 'series') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LangProvider>
        <SeriesTab novel={{ ...novel, stage }} onChanged={vi.fn()} />
      </LangProvider>
    </QueryClientProvider>
  )
}

describe('SeriesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listNovelSeasons.mockResolvedValue([
      { id: 's1', novelId: 'n1', seasonNo: 1, title: '第1季', episodeCount: 200, chapterStart: 1, chapterEnd: 10 },
      { id: 's2', novelId: 'n1', seasonNo: 2, title: '第2季', episodeCount: 40, chapterStart: 11, chapterEnd: 12 },
    ])
    getNovelSeriesEstimate.mockResolvedValue({
      chapters: 12,
      totalChars: 8100,
      seasons: 2,
      episodes: 240,
      episodeSeconds: 90,
      charsPerSecond: 4.5,
      plannedSeconds: 21600,
      supportSeconds: { '4': 2025, '4.5': 1800, '5': 1620 },
      supportEpisodes: 20,
    })
    planNovelSeries.mockResolvedValue({ seasons: 1, episodes: 240, episodesPerSeason: 200, episodeSeconds: 90 })
  })

  it('渲染估算与季列表', async () => {
    renderTab()
    expect(await screen.findByText('第1季')).toBeInTheDocument()
    expect(screen.getByText('第2季')).toBeInTheDocument()
    expect(screen.getByText(/200 集/)).toBeInTheDocument()
    expect(screen.getByText('0.5h')).toBeInTheDocument()
  })

  it('规划需确认并调用接口', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('button', { name: /规划（1章/ }))
    expect(await screen.findByText('确认规划')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认规划' }))
    await waitFor(() => expect(planNovelSeries).toHaveBeenCalledWith('n1', {}))
  })

  it('锁定后禁用规划', async () => {
    renderTab('episodes')
    const button = await screen.findByRole('button', { name: /规划（1章/ })
    expect(button).toBeDisabled()
    expect(screen.getByText('已锁定')).toBeInTheDocument()
  })
})
