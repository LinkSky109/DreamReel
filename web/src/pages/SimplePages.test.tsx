import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LangProvider } from '../lib/i18n'
import { NotFoundPage } from './NotFound'
import { MorePage } from './More'
import { LogoutPage } from './Logout'

function renderWithProviders(ui: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <LangProvider>
          <Routes>
            <Route path="/" element={ui} />
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('Simple pages', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('NotFound 渲染并可重新加载', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    renderWithProviders(<NotFoundPage />)
    expect(screen.getByText('页面不存在')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect(reload).toHaveBeenCalled()
  })

  it('More 渲染导航与额外入口', () => {
    renderWithProviders(<MorePage />)
    expect(screen.getByRole('heading', { name: '全部功能' })).toBeInTheDocument()
    expect(screen.getAllByRole('link').length).toBeGreaterThan(5)
    expect(screen.getByText('套餐与定价')).toBeInTheDocument()
  })

  it('Logout 清 token 并跳转登录', async () => {
    localStorage.setItem('dreamreel_token', 'tok')
    renderWithProviders(<LogoutPage />)
    expect(await screen.findByText('login page')).toBeInTheDocument()
    expect(localStorage.getItem('dreamreel_token')).toBeNull()
  })
})
