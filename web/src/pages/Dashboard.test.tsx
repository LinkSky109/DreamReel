import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { DashboardPage } from './Dashboard'
import { LangProvider } from '../lib/i18n'

vi.mock('../lib/api', () => ({
  api: {
    listProjects: vi.fn(async () => ({ total: 0, items: [] })),
    getRecentProjects: vi.fn(async () => ({ projects: [] })),
    listTemplates: vi.fn(async () => ({ total: 0, items: [] })),
    getQuota: vi.fn(async () => ({
      video: { daily: { used: 0, limit: 5, remaining: 5, resetAt: '' } },
      image: { daily: { used: 0, limit: 10, remaining: 10 } },
      maxDuration: 90,
      maxResolution: '1080p',
    })),
  },
  hasToken: () => false,
}))

function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LangProvider>
          <DashboardPage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Dashboard', () => {
  it('无项目时展示空状态与唯一主 CTA', async () => {
    renderDashboard()
    expect(await screen.findByText('从一句话开始')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /新建第一个项目/ })).toBeInTheDocument()
    expect(screen.queryByText('制作队列')).not.toBeInTheDocument()
  })
})
