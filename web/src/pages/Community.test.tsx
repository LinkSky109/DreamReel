import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { CommunityPage } from './Community'
import { LangProvider } from '../lib/i18n'

const listCommunityReviews = vi.fn()
const getCommunityLeaderboard = vi.fn()
const createCommunityReview = vi.fn()
const likeCommunityReview = vi.fn()
const createCommunityReport = vi.fn()
const getCommunityReview = vi.fn()
const listProjects = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listCommunityReviews: (params: unknown) => listCommunityReviews(params),
    getCommunityLeaderboard: (period: string, limit: number) => getCommunityLeaderboard(period, limit),
    createCommunityReview: (body: unknown) => createCommunityReview(body),
    likeCommunityReview: (id: string, userId: string) => likeCommunityReview(id, userId),
    createCommunityReport: (body: unknown) => createCommunityReport(body),
    getCommunityReview: (id: string) => getCommunityReview(id),
    listProjects: (params: unknown) => listProjects(params),
  },
  hasToken: () => true,
}))

const review = {
  id: 'rev_1',
  userId: 'usr_a',
  movieId: '沙丘',
  title: '沙丘：声音比画面更接近未来',
  content: '低频震动先于画面抵达，沙漠因此有了重量。',
  movieTags: ['sci-fi', 'epic'],
  storyScore: 8,
  visualScore: 10,
  performanceScore: 9,
  soundtrackScore: 10,
  overallScore: 9.2,
  likeCount: 3,
  commentCount: 0,
  createdAt: new Date().toISOString(),
  status: 'published',
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/community']}>
        <LangProvider>
          <CommunityPage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CommunityPage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    listCommunityReviews.mockResolvedValue([review])
    getCommunityLeaderboard.mockResolvedValue({
      period: 'weekly',
      leaderboard: [{ rank: 1, reviewId: review.id, title: review.title, userId: 'usr_a', overallScore: 9.2, likeCount: 3, heat: 55.2, createdAt: review.createdAt }],
    })
    createCommunityReview.mockResolvedValue(review)
    likeCommunityReview.mockResolvedValue({ ...review, likeCount: 4 })
    createCommunityReport.mockResolvedValue({ id: 'rep_1', reviewId: review.id, reporterId: 'usr_a', reason: '剧透未标注', status: 'pending' })
    getCommunityReview.mockResolvedValue(review)
    listProjects.mockResolvedValue({ items: [] })
  })

  it('渲染影评与四维评分', async () => {
    renderPage()
    expect((await screen.findAllByText(review.title)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('4.5').length).toBeGreaterThan(0)
    expect(screen.getByText('55.2')).toBeInTheDocument()
  })

  it('发布影评并提交四维评分', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: '写影评' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/标题/), '一次安静的失败')
    await user.type(within(dialog).getByLabelText(/正文/), '镜头留白让失败有了尊严。')
    await user.click(within(dialog).getByRole('button', { name: '发布影评' }))
    await waitFor(() =>
      expect(createCommunityReview).toHaveBeenCalledWith(
        expect.objectContaining({ title: '一次安静的失败', userId: 'usr_a', storyScore: 8, visualScore: 8 })
      )
    )
  })

  it('点赞与举报有反馈', async () => {
    const user = userEvent.setup()
    renderPage()
    const card = (await screen.findAllByText(review.title))[0].closest('.community-card') as HTMLElement
    await user.click(within(card).getByRole('button', { name: /^3$/ }))
    await waitFor(() => expect(likeCommunityReview).toHaveBeenCalledWith('rev_1', 'usr_a'))

    await user.click(within(card).getByRole('button', { name: '举报' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/原因/), '剧透未标注')
    await user.click(within(dialog).getByRole('button', { name: '提交举报' }))
    await waitFor(() => expect(createCommunityReport).toHaveBeenCalledWith(expect.objectContaining({ reviewId: 'rev_1', reporterId: 'usr_a', reason: '剧透未标注' })))
  })
})
