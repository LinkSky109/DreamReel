import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ShotsPage } from './ShotsPage'
import { LangProvider } from '../lib/i18n'

const getNovel = vi.fn()
const listNovelEpisodes = vi.fn()
const listEpisodeShots = vi.fn()
const listNovelAssets = vi.fn()
const listEpisodeStates = vi.fn()
const setEpisodeShotRefs = vi.fn()
const autoRefsEpisodeShots = vi.fn()
const exportEpisodeShotHandoff = vi.fn()
const importEpisodeShotVideos = vi.fn()
const generateEpisodeStates = vi.fn()
const upsertCharacterState = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getNovel: (id: string) => getNovel(id),
    listNovelEpisodes: (id: string) => listNovelEpisodes(id),
    listEpisodeShots: (id: string, eid: string) => listEpisodeShots(id, eid),
    listNovelAssets: (id: string) => listNovelAssets(id),
    listEpisodeStates: (id: string, eid: string) => listEpisodeStates(id, eid),
    setEpisodeShotRefs: (id: string, eid: string, index: number, refs: string[]) => setEpisodeShotRefs(id, eid, index, refs),
    autoRefsEpisodeShots: (id: string, eid: string) => autoRefsEpisodeShots(id, eid),
    exportEpisodeShotHandoff: (id: string, eid: string) => exportEpisodeShotHandoff(id, eid),
    importEpisodeShotVideos: (id: string, eid: string) => importEpisodeShotVideos(id, eid),
    generateEpisodeStates: (id: string, eid: string) => generateEpisodeStates(id, eid),
    upsertCharacterState: (id: string, cid: string, ep: number, body: unknown) => upsertCharacterState(id, cid, ep, body),
  },
}))

vi.mock('../components/AuthImage', () => ({
  AuthImage: ({ alt }: { alt: string }) => <div data-testid="auth-image">{alt}</div>,
}))
vi.mock('../components/AuthVideo', () => ({
  AuthVideo: () => <div data-testid="auth-video" />,
}))

const shot = {
  index: 1,
  description: '林川拔刀',
  dialogue: '走。',
  duration: 6,
  referenceImages: ['/storage/a1.png'],
  videoUrl: null,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/novel/n1/shots/ep1']}>
        <LangProvider>
          <Routes>
            <Route path="/novel/:id/shots/:eid" element={<ShotsPage />} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ShotsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNovel.mockResolvedValue({ id: 'n1', title: '长夜将明', stage: 'episodes', counts: {}, createdAt: '', updatedAt: '' })
    listNovelEpisodes.mockResolvedValue([
      { id: 'ep1', novelId: 'n1', seasonId: 's1', episodeNo: 1, title: '第一章 起风', targetSeconds: 90, screenplay: { shots: [shot] } },
    ])
    listEpisodeShots.mockResolvedValue([shot])
    listNovelAssets.mockResolvedValue({
      assets: [
        { id: 'a1', category: 'character', name: '林川', imageUrl: '/storage/a1.png' },
        { id: 'a2', category: 'scene', name: '边城', imageUrl: '/storage/a2.png' },
      ],
      stats: {},
    })
    listEpisodeStates.mockResolvedValue({
      episodeNo: 1,
      items: [
        {
          characterId: 'c1',
          name: '林川',
          exact: { appearance: '黑衣', equipment: '刀', injuries: '', abilities: '' },
          effective: null,
        },
      ],
    })
    setEpisodeShotRefs.mockResolvedValue(shot)
    autoRefsEpisodeShots.mockResolvedValue({ shotsTouched: 1, refsAdded: 2 })
    exportEpisodeShotHandoff.mockResolvedValue({ dir: '/tmp/handoff', shotCount: 1, refCount: 1 })
    importEpisodeShotVideos.mockResolvedValue({ imported: [], total: 1, missing: ['shot01'] })
    generateEpisodeStates.mockResolvedValue({ count: 1, states: [] })
    upsertCharacterState.mockResolvedValue({})
  })

  it('渲染分镜、参考图与角色形象', async () => {
    renderPage()
    expect(await screen.findByText('林川拔刀')).toBeInTheDocument()
    expect(screen.getByText('林川')).toBeInTheDocument()
    expect(screen.getByDisplayValue('黑衣')).toBeInTheDocument()
    expect(screen.getByText(/分镜 1/)).toBeInTheDocument()
  })

  it('选择参考图调用设置接口', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: /添加参考图/ }))
    await user.click(await screen.findByRole('button', { name: /边城/ }))
    await waitFor(() =>
      expect(setEpisodeShotRefs).toHaveBeenCalledWith('n1', 'ep1', 1, ['/storage/a1.png', '/storage/a2.png'])
    )
  })

  it('自动匹配与导出调用接口', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '自动匹配参考图' }))
    await waitFor(() => expect(autoRefsEpisodeShots).toHaveBeenCalledWith('n1', 'ep1'))
    await user.click(screen.getByRole('button', { name: '导出分镜清单' }))
    await waitFor(() => expect(exportEpisodeShotHandoff).toHaveBeenCalledWith('n1', 'ep1'))
  })

  it('保存角色形象携带集号', async () => {
    const user = userEvent.setup()
    renderPage()
    const appearance = await screen.findByDisplayValue('黑衣')
    await user.clear(appearance)
    await user.type(appearance, '白衣')
    await user.click(screen.getByRole('button', { name: '保存本集形象' }))
    await waitFor(() =>
      expect(upsertCharacterState).toHaveBeenCalledWith('n1', 'c1', 1, {
        appearance: '白衣',
        equipment: '刀',
        injuries: '',
        abilities: '',
      })
    )
  })
})
