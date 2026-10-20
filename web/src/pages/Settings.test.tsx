import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SettingsPage } from './Settings'
import { LangProvider } from '../lib/i18n'
import { ThemeProvider } from '../lib/theme'

const getPerformance = vi.fn()
const listWebhooks = vi.fn()
const getWebhookEvents = vi.fn()
const createWebhook = vi.fn()
const updateWebhook = vi.fn()
const deleteWebhook = vi.fn()
const testWebhook = vi.fn()
const getWebhookDeliveries = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getSystemInfo: () =>
      Promise.resolve({
        app: { name: 'DreamReel', version: '0.1.0', env: 'test', uptime: 120 },
        system: {
          platform: 'darwin',
          arch: 'arm64',
          nodeVersion: 'v22',
          cpuCount: 8,
          totalMemory: 8 * 1024 * 1024 * 1024,
          freeMemory: 4 * 1024 * 1024 * 1024,
        },
        process: { pid: 1, memoryUsage: { heapUsed: 1024 } },
        storage: { usedMB: '1.00', fileCount: 2, path: '/tmp' },
        config: { port: 3000 },
      }),
    getProviderStatus: () => Promise.resolve({}),
    getQuota: () => Promise.resolve(null),
    listStyles: () => Promise.resolve({ items: [] }),
    getVoices: () => Promise.resolve({ voices: [] }),
    getNotificationPreferences: () => Promise.resolve({ preferences: {} }),
    updateNotificationPreferences: (body: unknown) => Promise.resolve({ preferences: body }),
    getPlans: () => Promise.resolve({ plans: [] }),
    getCurrentSubscription: () => Promise.resolve({}),
    getPerformance: () => getPerformance(),
    listWebhooks: () => listWebhooks(),
    getWebhookEvents: () => getWebhookEvents(),
    createWebhook: (body: unknown) => createWebhook(body),
    updateWebhook: (id: string, body: unknown) => updateWebhook(id, body),
    deleteWebhook: (id: string) => deleteWebhook(id),
    testWebhook: (id: string) => testWebhook(id),
    getWebhookDeliveries: (id: string) => getWebhookDeliveries(id),
  },
  hasToken: () => false,
}))

const performance = {
  system: {
    cpu: { loadAvg1m: 0.5, loadAvg5m: 0.4, loadAvg15m: 0.3, cores: 8, usagePercent: 25 },
    memory: { totalMB: 8192, usedMB: 4096, freeMB: 4096, usagePercent: 50 },
    process: { pid: 1, uptime: 100, memoryUsage: { heapUsed: 1024 } },
    uptime: 120,
  },
  requests: {
    total: 120,
    errors: 2,
    errorRate: 1.67,
    avgResponseTime: 32,
    avgResponseTimeSec: '0.03',
    slowestEndpoints: [{ endpoint: '/api/video/generate', count: 8, avgTime: 120, errors: 1, errorRate: 12.5 }],
    busiestEndpoints: [{ endpoint: '/api/projects', count: 60, avgTime: 12, errors: 0 }],
  },
  timestamp: '2026-10-20T00:00:00.000Z',
}

const webhook = {
  id: 'wh_1',
  url: 'https://example.com/hook',
  events: ['video.completed'],
  userId: 'default',
  name: '通知服务',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  lastTriggeredAt: null,
  successCount: 3,
  failureCount: 1,
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/settings']}>
        <LangProvider>
          <ThemeProvider>
            <SettingsPage />
          </ThemeProvider>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SettingsPage runtime & webhooks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    getPerformance.mockResolvedValue(performance)
    listWebhooks.mockResolvedValue({ webhooks: [webhook] })
    getWebhookEvents.mockResolvedValue({
      events: ['video.completed', 'export.completed', 'project.created'],
    })
    createWebhook.mockResolvedValue({ ...webhook, id: 'wh_2', name: '新服务' })
    updateWebhook.mockResolvedValue({ ...webhook, active: false })
    deleteWebhook.mockResolvedValue({ success: true })
    testWebhook.mockResolvedValue({ success: true })
    getWebhookDeliveries.mockResolvedValue({
      deliveries: [
        {
          id: 'dlv_1',
          webhookId: 'wh_1',
          event: 'video.completed',
          url: 'https://example.com/hook',
          statusCode: 200,
          success: true,
          attempt: 1,
          timestamp: '2026-10-20T08:00:00.000Z',
        },
      ],
    })
  })

  it('展示性能指标与 Webhook 列表', async () => {
    renderPage()
    expect(await screen.findByText('25%')).toBeInTheDocument()
    expect(screen.getByText('/api/video/generate')).toBeInTheDocument()
    expect(await screen.findByText('通知服务')).toBeInTheDocument()
    expect(screen.getByText('https://example.com/hook')).toBeInTheDocument()
  })

  it('创建 Webhook 调用真实接口', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('通知服务')
    await user.click(screen.getByRole('button', { name: '添加 Webhook' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('URL'), 'https://example.com/new')
    await user.click(within(dialog).getByRole('checkbox', { name: /project.created/ }))
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(createWebhook).toHaveBeenCalledWith({
        name: 'https://example.com/new',
        url: 'https://example.com/new',
        events: ['project.created'],
      })
    )
  })

  it('查看 Webhook 投递日志', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('通知服务')
    await user.click(screen.getByRole('button', { name: '投递日志' }))
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText('2026-10-20 08:00:00')).toBeInTheDocument()
    expect(within(dialog).getByText('成功')).toBeInTheDocument()
    expect(within(dialog).getByText('200')).toBeInTheDocument()
  })

  it('停用 Webhook 调用更新接口', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('通知服务')
    await user.click(screen.getByRole('button', { name: '停用' }))
    await waitFor(() => expect(updateWebhook).toHaveBeenCalledWith('wh_1', { active: false }))
  })
})
