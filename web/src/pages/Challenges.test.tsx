import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ChallengesPage } from './Challenges'
import { LangProvider } from '../lib/i18n'

const listChallenges = vi.fn()
const getChallengeDetail = vi.fn()
const joinChallenge = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listChallenges: (status?: string) => listChallenges(status),
    getChallengeDetail: (id: string) => getChallengeDetail(id),
    joinChallenge: (id: string, body: unknown) => joinChallenge(id, body),
  },
  hasToken: () => false,
}))

const challenges = [
  {
    id: 'challenge-dream',
    title: '梦境重塑',
    theme: '一个反复出现的梦',
    description: '用 AI 呈现最难忘的梦境。',
    rules: ['时长 15-60 秒', '至少 1 个角色'],
    reward: '首页推荐 + Pro 月卡',
    startAt: '2026-09-20',
    endAt: '2026-10-20',
    status: 'active',
    entryCount: 2,
  },
  {
    id: 'challenge-city',
    title: '城市微光',
    theme: '城市里被忽略的瞬间',
    description: '记录城市角落的小人物。',
    rules: ['时长 10-45 秒'],
    reward: 'Top3 流量扶持',
    startAt: '2026-09-25',
    endAt: '2026-10-25',
    status: 'active',
    entryCount: 0,
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/challenges']}>
        <LangProvider>
          <Routes>
            <Route path="/challenges" element={<ChallengesPage />} />
            <Route path="/project/:id" element={<div>editor page</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ChallengesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listChallenges.mockImplementation((status?: string) =>
      Promise.resolve({ total: challenges.length, items: status && status !== 'all' ? challenges.filter((item) => item.status === status) : challenges })
    )
    getChallengeDetail.mockResolvedValue({ ...challenges[0], entries: [{ id: 'project-1', name: '我的梦境', likeCount: 12 }], entryCount: 1 })
    joinChallenge.mockResolvedValue({ success: true, challenge: challenges[0], project: { id: 'project-new' } })
  })

  it('渲染挑战与投稿数，并切换筛选', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('梦境重塑')).toBeInTheDocument()
    expect(screen.getByText('2 份投稿')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /已结束/ }))
    expect(await screen.findByText('当前筛选下没有挑战')).toBeInTheDocument()
  })

  it('打开详情并参与创建投稿项目', async () => {
    const user = userEvent.setup()
    renderPage()
    const first = (await screen.findByText('梦境重塑')).closest('.challenge-card') as HTMLElement
    await user.click(within(first).getByRole('button', { name: /查看与参与/ }))
    expect(await screen.findByText('参赛规则')).toBeInTheDocument()
    expect(screen.getByText('我的梦境')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /参与挑战，创建投稿项目/ }))
    await waitFor(() => expect(joinChallenge).toHaveBeenCalledWith('challenge-dream', {}))
    expect(await screen.findByText('editor page')).toBeInTheDocument()
  })
})
