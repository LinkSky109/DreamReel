import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { EpisodeTab } from './EpisodeTab'
import { LangProvider } from '../../lib/i18n'
import type { NovelDetail } from '../../domain/types'

const listNovelSeasons = vi.fn()
const listNovelEpisodes = vi.fn()
const getSeasonAssetSubset = vi.fn()
const generateEpisodeScript = vi.fn()
const generateEpisodeAssets = vi.fn()
const composeEpisode = vi.fn()
const exportEpisodeHandoff = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    listNovelSeasons: (id: string) => listNovelSeasons(id),
    listNovelEpisodes: (id: string, sid: string) => listNovelEpisodes(id, sid),
    getSeasonAssetSubset: (id: string, sid: string) => getSeasonAssetSubset(id, sid),
    generateEpisodeScript: (id: string, eid: string, body: unknown) => generateEpisodeScript(id, eid, body),
    generateEpisodeAssets: (id: string, eid: string, body: unknown) => generateEpisodeAssets(id, eid, body),
    composeEpisode: (id: string, eid: string, body: unknown) => composeEpisode(id, eid, body),
    exportEpisodeHandoff: (id: string, eid: string) => exportEpisodeHandoff(id, eid),
    bulkGenerateSeason: vi.fn(),
    bulkGenerateSeasonAssets: vi.fn(),
  },
}))

const novel: NovelDetail = {
  id: 'n1',
  title: '长夜将明',
  stage: 'episodes',
  counts: { chapters: 12, characters: 3, episodes: 2 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const episodes = [
  {
    id: 'ep1',
    novelId: 'n1',
    seasonId: 's1',
    episodeNo: 1,
    title: '第一章 起风',
    targetSeconds: 90,
    screenplay: { totalSeconds: 88, shots: [{ index: 1, description: '风起' }] },
    assets: { image: { url: '/img.png' }, video: { url: '/v.mp4' } },
  },
  {
    id: 'ep2',
    novelId: 'n1',
    seasonId: 's1',
    episodeNo: 2,
    title: '第二章 入城',
    targetSeconds: 90,
    screenplay: null,
    assets: {},
  },
]

function renderTab(stage: NovelDetail['stage'] = 'episodes') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LangProvider>
          <EpisodeTab novel={{ ...novel, stage }} onChanged={vi.fn()} />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('EpisodeTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listNovelSeasons.mockResolvedValue([
      { id: 's1', novelId: 'n1', seasonNo: 1, title: '第1季', episodeCount: 2, chapterStart: 0, chapterEnd: 1 },
    ])
    listNovelEpisodes.mockResolvedValue(episodes)
    getSeasonAssetSubset.mockResolvedValue({
      seasonId: 's1',
      seasonTitle: '第1季',
      chapters: '0-1',
      episodes: 2,
      totalAssets: 10,
      subsetCount: 4,
      withImages: 2,
      remaining: 2,
    })
    generateEpisodeScript.mockResolvedValue({ ...episodes[0], screenplay: { shots: [{}, {}] } })
    generateEpisodeAssets.mockResolvedValue({ assets: { image: { url: '/i.png' } } })
    composeEpisode.mockResolvedValue({ fileName: 'ep1.mp4' })
    exportEpisodeHandoff.mockResolvedValue({ dir: '/exports/ep1' })
  })

  it('渲染单集状态与季资产子集', async () => {
    renderTab()
    expect(await screen.findByText(/第一章 起风/)).toBeInTheDocument()
    expect(screen.getByText(/第二章 入城/)).toBeInTheDocument()
    expect(screen.getByText('剧本✓')).toBeInTheDocument()
    expect(screen.getByText(/本季设定图子集/)).toBeInTheDocument()
    expect(screen.getByText('2', { selector: '.dr-episode-subset strong' })).toBeInTheDocument()
  })

  it('生成剧本调用接口', async () => {
    const user = userEvent.setup()
    renderTab()
    const second = (await screen.findByText(/第二章 入城/)).closest('.dr-episode-item') as HTMLElement
    await user.click(within(second).getByRole('button', { name: '生成剧本' }))
    await waitFor(() => expect(generateEpisodeScript).toHaveBeenCalledWith('n1', 'ep2', {}))
  })

  it('搜索按集号过滤', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText(/第一章 起风/)
    await user.type(screen.getByPlaceholderText(/搜集号/), '2')
    expect(screen.queryByText(/第一章 起风/)).not.toBeInTheDocument()
    expect(screen.getByText(/第二章 入城/)).toBeInTheDocument()
  })

  it('进入成片阶段后锁定剧本与资产', async () => {
    renderTab('compose')
    const item = (await screen.findByText(/第一章 起风/)).closest('.dr-episode-item') as HTMLElement
    expect(within(item).getByRole('button', { name: '重生成剧本' })).toBeDisabled()
    expect(within(item).getByRole('button', { name: '生成资产' })).toBeDisabled()
  })

  it('分镜入口跳到新版分镜页', async () => {
    renderTab()
    const item = (await screen.findByText(/第一章 起风/)).closest('.dr-episode-item') as HTMLElement
    expect(within(item).getByRole('link', { name: /分镜/ })).toHaveAttribute(
      'href',
      '/novel/n1/shots/ep1'
    )
  })
})
