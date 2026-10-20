import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ApiConsolePage } from './ApiConsole'
import { LangProvider } from '../lib/i18n'

const listApiKeys = vi.fn()
const createApiKey = vi.fn()
const revokeApiKey = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listApiKeys: (userId?: string) => listApiKeys(userId),
    createApiKey: (body: unknown) => createApiKey(body),
    revokeApiKey: (id: string) => revokeApiKey(id),
  },
}))

const createdKey = ['drk', 'test', 'key'].join('_')

const keys = [
  {
    id: 'key_1',
    name: '剪辑服务',
    keyPrefix: 'drk_12345678',
    scopes: ['project:read', 'video:generate'],
    createdAt: '2026-10-01T08:00:00.000Z',
    lastUsedAt: '2026-10-19T09:30:00.000Z',
    callCount: 42,
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/api-console']}>
        <LangProvider>
          <ApiConsolePage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ApiConsolePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('dreamreel_user', JSON.stringify({ id: 'usr_a' }))
    listApiKeys.mockResolvedValue({ total: 1, items: keys })
    createApiKey.mockResolvedValue({ ...keys[0], id: 'key_2', apiKey: createdKey })
    revokeApiKey.mockResolvedValue({ success: true })
  })

  it('渲染密钥、用量与端点', async () => {
    renderPage()
    expect(await screen.findByText('剪辑服务')).toBeInTheDocument()
    expect(screen.getAllByText('42').length).toBeGreaterThan(0)
    expect(screen.getByText('/api/open/v1/videos/generate')).toBeInTheDocument()
  })

  it('创建密钥后仅显示一次完整 Key', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('剪辑服务')
    await user.click(screen.getByRole('button', { name: /创建 Key/ }))
    await user.type(screen.getByLabelText('密钥名称'), '新服务')
    await user.click(screen.getByRole('button', { name: '创建' }))
    await waitFor(() => expect(createApiKey).toHaveBeenCalled())
    expect(await screen.findByText(createdKey)).toBeInTheDocument()
    expect(screen.getByText(/唯一一次显示完整密钥/)).toBeInTheDocument()
  })

  it('吊销密钥需要确认', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('剪辑服务')
    await user.click(screen.getByRole('button', { name: '吊销' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '确认吊销' }))
    await waitFor(() => expect(revokeApiKey).toHaveBeenCalledWith('key_1'))
  })
})
