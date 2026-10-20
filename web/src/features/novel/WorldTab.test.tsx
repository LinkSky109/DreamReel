import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WorldTab } from './WorldTab'
import { LangProvider } from '../../lib/i18n'
import type { NovelDetail } from '../../domain/types'

const getNovelWorld = vi.fn()
const listNovelWorldEntities = vi.fn()
const listNovelWorldRelations = vi.fn()
const listNovelWorldSets = vi.fn()
const getNovelSchema = vi.fn()
const getNovelExtractStatus = vi.fn()
const extractNovelWorld = vi.fn()
const bulkReviewNovel = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    getNovelWorld: (id: string) => getNovelWorld(id),
    listNovelWorldEntities: (id: string) => listNovelWorldEntities(id),
    listNovelWorldRelations: (id: string) => listNovelWorldRelations(id),
    listNovelWorldSets: (id: string) => listNovelWorldSets(id),
    getNovelSchema: (id: string) => getNovelSchema(id),
    getNovelExtractStatus: (id: string) => getNovelExtractStatus(id),
    extractNovelWorld: (id: string, body: unknown) => extractNovelWorld(id, body),
    bulkReviewNovel: (id: string, body: unknown) => bulkReviewNovel(id, body),
    selectNovelWorldSet: vi.fn(),
  },
}))

const novel: NovelDetail = {
  id: 'n1',
  title: '长夜将明',
  stage: 'world',
  counts: { chapters: 12, characters: 3, episodes: 0 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const entities = [
  {
    id: 'e1',
    novelId: 'n1',
    type: 'faction',
    name: '边城镖局',
    aliases: ['镖局'],
    description: '边城最大的镖局',
    attributes: { territory: '北境边城' },
    relations: [{ target: '赵五', kind: '敌对' }],
    mentions: 5,
    provider: 'llm',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'e2',
    novelId: 'n1',
    type: 'event',
    name: '夜行押镖',
    aliases: [],
    description: '',
    attributes: {},
    relations: [],
    mentions: 2,
    provider: 'llm',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
]

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LangProvider>
        <WorldTab novel={novel} onChanged={vi.fn()} />
      </LangProvider>
    </QueryClientProvider>
  )
}

describe('WorldTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getNovelWorld.mockResolvedValue({
      total: 2,
      byType: { faction: 1, event: 1 },
      byTypeLabel: { 势力组织: 1, 重大事件: 1 },
      relations: 1,
      missingCoreTypes: [],
    })
    listNovelWorldEntities.mockResolvedValue(entities)
    listNovelWorldRelations.mockResolvedValue([
      { from: 'e1', fromName: '边城镖局', to: 'e2', toName: '赵五', kind: '敌对' },
    ])
    listNovelWorldSets.mockResolvedValue([])
    getNovelSchema.mockResolvedValue({
      character: { fields: [], groups: {} },
      world: {
        types: [
          { key: 'faction', label: '势力组织' },
          { key: 'event', label: '重大事件' },
        ],
        attributes: { faction: [{ key: 'territory', label: '领地/首都' }] },
      },
    })
    getNovelExtractStatus.mockResolvedValue({})
    extractNovelWorld.mockResolvedValue({ provider: 'heuristic', entities: 2 })
    bulkReviewNovel.mockResolvedValue({ updated: 1 })
  })

  it('渲染实体、属性与关系', async () => {
    renderTab()
    expect((await screen.findAllByText('边城镖局')).length).toBeGreaterThan(0)
    expect(screen.getByText('夜行押镖')).toBeInTheDocument()
    expect(screen.getByText('领地/首都')).toBeInTheDocument()
    expect(screen.getByText('北境边城')).toBeInTheDocument()
    expect(screen.getAllByText('赵五').length).toBeGreaterThan(0)
  })

  it('按类型筛选实体', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findAllByText('边城镖局')
    await user.click(screen.getByRole('button', { name: /重大事件 1/ }))
    const entityList = document.querySelector('.dr-world-entity-list') as HTMLElement
    expect(within(entityList).queryByText('边城镖局')).not.toBeInTheDocument()
    expect(within(entityList).getByText('夜行押镖')).toBeInTheDocument()
  })

  it('批量确认选中实体', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('checkbox', { name: '选择 边城镖局' }))
    await user.click(within(document.querySelector('.dr-bulk-bar') as HTMLElement).getByRole('button', { name: '确认' }))
    await waitFor(() =>
      expect(bulkReviewNovel).toHaveBeenCalledWith('n1', {
        kind: 'world',
        ids: ['e1'],
        status: 'confirmed',
      })
    )
  })

  it('生成世界观调用接口', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('button', { name: /生成世界观/ }))
    await waitFor(() =>
      expect(extractNovelWorld).toHaveBeenCalledWith('n1', { provider: 'llm' })
    )
  })
})
