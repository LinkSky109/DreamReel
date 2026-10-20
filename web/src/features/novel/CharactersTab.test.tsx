import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CharactersTab } from './CharactersTab'
import { LangProvider } from '../../lib/i18n'
import type { NovelDetail } from '../../domain/types'

const listNovelCharacters = vi.fn()
const listNovelCharacterSets = vi.fn()
const getNovelReviewStats = vi.fn()
const getNovelSchema = vi.fn()
const getNovelExtractStatus = vi.fn()
const approveNovelCharacter = vi.fn()
const patchNovelCharacter = vi.fn()
const bulkReviewNovel = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    listNovelCharacters: (id: string) => listNovelCharacters(id),
    listNovelCharacterSets: (id: string) => listNovelCharacterSets(id),
    getNovelReviewStats: (id: string) => getNovelReviewStats(id),
    getNovelSchema: (id: string) => getNovelSchema(id),
    getNovelExtractStatus: (id: string) => getNovelExtractStatus(id),
    approveNovelCharacter: (id: string, cid: string) => approveNovelCharacter(id, cid),
    patchNovelCharacter: (id: string, cid: string, patch: unknown) => patchNovelCharacter(id, cid, patch),
    bulkReviewNovel: (id: string, body: unknown) => bulkReviewNovel(id, body),
    extractNovelCharacters: vi.fn(),
    extractNovelAll: vi.fn(),
    selectNovelCharacterSet: vi.fn(),
  },
}))

const novel: NovelDetail = {
  id: 'n1',
  title: '长夜将明',
  stage: 'characters',
  counts: { chapters: 12, characters: 1, episodes: 0 },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

const character = {
  id: 'c1',
  novelId: 'n1',
  name: '林川',
  aliases: ['川子'],
  description: '边城镖师',
  kind: 'individual' as const,
  card: { age: '二十九', personality: '沉默寡言' },
  provider: 'llm',
  status: 'pending',
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <LangProvider>
        <CharactersTab novel={novel} onChanged={vi.fn()} />
      </LangProvider>
    </QueryClientProvider>
  )
}

describe('CharactersTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listNovelCharacters.mockResolvedValue([character])
    listNovelCharacterSets.mockResolvedValue([])
    getNovelReviewStats.mockResolvedValue({ approved: 0, revisionRate: 0 })
    getNovelSchema.mockResolvedValue({
      character: {
        fields: [
          { key: 'age', label: '年龄', group: 'basic' },
          { key: 'personality', label: '性格底色', group: 'basic' },
        ],
        groups: { basic: '基础档案' },
      },
    })
    getNovelExtractStatus.mockResolvedValue({})
    approveNovelCharacter.mockResolvedValue({ ...character, status: 'approved' })
    patchNovelCharacter.mockResolvedValue(character)
    bulkReviewNovel.mockResolvedValue({ updated: 1 })
  })

  it('渲染角色卡字段与审核状态', async () => {
    renderTab()
    expect(await screen.findByText('林川')).toBeInTheDocument()
    expect(screen.getByText(/川子/)).toBeInTheDocument()
    expect(screen.getByText('年龄')).toBeInTheDocument()
    expect(screen.getByText('二十九')).toBeInTheDocument()
    expect(screen.getByText('待审核')).toBeInTheDocument()
  })

  it('通过角色调用审核接口', async () => {
    const user = userEvent.setup()
    renderTab()
    const card = (await screen.findByText('林川')).closest('.dr-character-card') as HTMLElement
    await user.click(within(card).getByRole('button', { name: '通过' }))
    await waitFor(() => expect(approveNovelCharacter).toHaveBeenCalledWith('n1', 'c1'))
  })

  it('批量通过选中角色', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('checkbox', { name: '选择 林川' }))
    await user.click(within(document.querySelector('.dr-bulk-bar') as HTMLElement).getByRole('button', { name: '通过' }))
    await waitFor(() =>
      expect(bulkReviewNovel).toHaveBeenCalledWith('n1', {
        kind: 'characters',
        ids: ['c1'],
        status: 'approved',
      })
    )
  })

  it('修订字段保存到 card', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('button', { name: '修订' }))
    const textarea = await screen.findByLabelText('内容')
    await user.clear(textarea)
    await user.type(textarea, '谨慎寡言')
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(patchNovelCharacter).toHaveBeenCalledWith('n1', 'c1', {
        card: { personality: '谨慎寡言' },
      })
    )
  })
})
