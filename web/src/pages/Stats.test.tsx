import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { StatsPage } from './Stats'
import { LangProvider } from '../lib/i18n'

const getStatsDashboard = vi.fn()
const getStatsTrend = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getStatsDashboard: () => getStatsDashboard(),
    getStatsTrend: (days: number) => getStatsTrend(days),
  },
}))

const trend = [
  { date: '2026-10-19', projectsCreated: 1, videoGenerations: 3, exports: 0 },
  { date: '2026-10-20', projectsCreated: 0, videoGenerations: 5, exports: 1 },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LangProvider>
          <StatsPage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('StatsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getStatsDashboard.mockResolvedValue({
      overview: {
        totalProjects: 1,
        totalShots: 6,
        completedShots: 2,
        completionRate: 33,
        totalCharacters: 3,
        totalVideoGenerations: 8,
        totalExports: 1,
        totalDubbingMinutes: 2,
      },
      trend,
      styleDistribution: [{ styleId: 'cinematic', count: 1 }],
      platformDistribution: [{ platform: 'landscape', count: 1 }],
      quotaUsage: {
        video: { daily: { used: 2, limit: 5, remaining: 3 } },
        dubbing: { monthly: { used: 120, limit: 600, remaining: 480 } },
      },
      recentProjects: [],
    })
    getStatsTrend.mockResolvedValue(trend)
  })

  it('渲染概览、额度与风格分布', async () => {
    renderPage()
    expect(await screen.findByText('镜头完成率')).toBeInTheDocument()
    expect(screen.getByText('33%')).toBeInTheDocument()
    expect(screen.getByText('2 / 5')).toBeInTheDocument()
    expect(screen.getByText('电影感')).toBeInTheDocument()
    expect(screen.getByText(/横屏 16:9/)).toBeInTheDocument()
  })

  it('切换 30 天重新请求趋势', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('镜头完成率')
    await user.selectOptions(screen.getByRole('combobox'), '30')
    await waitFor(() => expect(getStatsTrend).toHaveBeenCalledWith(30))
  })
})
