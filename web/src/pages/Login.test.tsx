import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LoginPage } from './Login'
import { LangProvider } from '../lib/i18n'

const login = vi.fn()
const register = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    login: (body: unknown) => login(body),
    register: (body: unknown) => register(body),
  },
}))

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/login']}>
        <LangProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<div>home page</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    login.mockResolvedValue({ token: 't1', user: { id: 'u1', username: '林一', email: 'a@b.c' } })
    register.mockResolvedValue({ token: 't2', user: { id: 'u2', username: '新用户', email: 'n@b.c' } })
  })

  it('登录保存 token 并返回首页', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText('邮箱'), 'a@b.c')
    await user.type(screen.getByLabelText('密码'), 'demo1234')
    await user.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => expect(login).toHaveBeenCalledWith({ email: 'a@b.c', password: 'demo1234' }))
    expect(localStorage.getItem('dreamreel_token')).toBe('t1')
    expect(await screen.findByText('home page')).toBeInTheDocument()
  })

  it('注册模式提交用户名/邮箱/密码', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole('tab', { name: '注册' }))
    await user.type(screen.getByLabelText('用户名'), '新用户')
    await user.type(screen.getByLabelText('邮箱'), 'n@b.c')
    await user.type(screen.getByLabelText('密码'), 'demo1234')
    await user.click(screen.getByRole('button', { name: '注册并登录' }))
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({ username: '新用户', email: 'n@b.c', password: 'demo1234' })
    )
  })

  it('错误信息展示', async () => {
    const user = userEvent.setup()
    login.mockRejectedValue(new Error('邮箱或密码错误'))
    renderPage()
    await user.type(screen.getByLabelText('邮箱'), 'a@b.c')
    await user.type(screen.getByLabelText('密码'), 'bad')
    await user.click(screen.getByRole('button', { name: '登录' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('邮箱或密码错误')
  })
})
