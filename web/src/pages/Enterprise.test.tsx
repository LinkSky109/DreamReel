import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { EnterprisePage } from './Enterprise'
import { LangProvider } from '../lib/i18n'

const getEnterpriseOverview = vi.fn()
const getEnterpriseConfig = vi.fn()
const getEnterpriseAudit = vi.fn()
const getEnterpriseDeployment = vi.fn()
const updateEnterpriseConfig = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getEnterpriseOverview: () => getEnterpriseOverview(),
    getEnterpriseConfig: () => getEnterpriseConfig(),
    getEnterpriseAudit: (params: unknown) => getEnterpriseAudit(params),
    getEnterpriseDeployment: () => getEnterpriseDeployment(),
    updateEnterpriseConfig: (body: unknown) => updateEnterpriseConfig(body),
  },
}))

const config = {
  sso: { enabled: false, provider: 'saml', entryPoint: '', issuer: '' },
  passwordPolicy: {
    minLength: 10,
    requireMixedCase: true,
    requireNumber: true,
    requireSymbol: true,
    sessionTimeoutHours: 12,
  },
  security: {
    enforceIpAllowlist: false,
    ipAllowlist: [],
    exportWatermark: true,
    watermarkText: 'DreamReel Enterprise',
    disablePublicSharing: false,
  },
  dataResidency: { region: 'cn-east-1', retentionDays: 365 },
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/enterprise']}>
        <LangProvider>
          <EnterprisePage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('EnterprisePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getEnterpriseOverview.mockResolvedValue({
      teams: 3,
      members: 8,
      projects: 12,
      auditEvents: 6,
      auditStats: {},
      config,
    })
    getEnterpriseConfig.mockResolvedValue(config)
    getEnterpriseAudit.mockResolvedValue({
      total: 1,
      items: [
        {
          id: 'aud_1',
          actor: 'admin',
          action: 'enterprise.config.update',
          resourceType: 'enterprise_config',
          result: 'success',
          timestamp: '2026-10-20T08:00:00.000Z',
        },
      ],
    })
    getEnterpriseDeployment.mockResolvedValue({
      edition: 'enterprise',
      version: '0.1.0',
      deployment: 'self_hosted',
      features: ['sso_saml_oidc', 'audit_log'],
      support: { sla: '99.9% uptime', channel: 'dedicated engineer' },
    })
    updateEnterpriseConfig.mockResolvedValue({
      ...config,
      security: { ...config.security, exportWatermark: false },
    })
  })

  it('渲染企业指标、审计与部署信息', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '企业管理' })).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.getByText('enterprise.config.update')).toBeInTheDocument()
    expect(screen.getByText('self_hosted')).toBeInTheDocument()
  })

  it('修改策略后需确认再保存', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('enterprise.config.update')
    await user.click(screen.getByRole('checkbox', { name: /导出文件加水印/ }))
    const saveButton = screen.getByRole('button', { name: '保存策略' })
    await waitFor(() => expect(saveButton).toBeEnabled())
    await user.click(saveButton)
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '确认保存' }))
    await waitFor(() => expect(updateEnterpriseConfig).toHaveBeenCalled())
    expect(updateEnterpriseConfig.mock.calls[0][0].security.exportWatermark).toBe(false)
  })
})
