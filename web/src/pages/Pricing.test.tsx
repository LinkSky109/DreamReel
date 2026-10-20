import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PricingPage } from './Pricing'
import { LangProvider } from '../lib/i18n'

let authed = false
const getPlans = vi.fn()
const getCurrentSubscription = vi.fn()
const subscribe = vi.fn()
const cancelSubscription = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getPlans: () => getPlans(),
    getCurrentSubscription: () => getCurrentSubscription(),
    subscribe: (body: unknown) => subscribe(body),
    cancelSubscription: () => cancelSubscription(),
  },
  hasToken: () => authed,
}))

const plans = [
  {
    id: 'free',
    name: '免费版',
    priceMonthly: 0,
    priceYearly: 0,
    features: {
      videoGenerationsPerDay: 5,
      maxDurationSeconds: 5,
      maxResolution: '720p',
      maxCharacters: 3,
      dubbingMinutesPerMonth: 10,
      maxProjects: 3,
      exportWatermark: true,
      priorityQueue: false,
      collaboration: false,
    },
  },
  {
    id: 'pro',
    name: '专业版',
    priceMonthly: 99,
    priceYearly: 990,
    features: {
      videoGenerationsPerDay: 200,
      maxDurationSeconds: 15,
      maxResolution: '4k',
      maxCharacters: 10,
      dubbingMinutesPerMonth: 300,
      maxProjects: 100,
      exportWatermark: false,
      priorityQueue: true,
      collaboration: true,
    },
  },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/pricing']}>
        <LangProvider>
          <Routes>
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/login" element={<div>login page</div>} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('PricingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authed = false
    getPlans.mockResolvedValue({ plans })
    getCurrentSubscription.mockResolvedValue({ plan: { id: 'free', name: '免费版' } })
    subscribe.mockResolvedValue({ success: true })
    cancelSubscription.mockResolvedValue({ success: true })
  })

  it('渲染套餐并切换年付价格', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('专业版')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /年付/ }))
    expect(screen.getByText('990')).toBeInTheDocument()
  })

  it('未登录订阅跳转登录', async () => {
    const user = userEvent.setup()
    renderPage()
    const card = (await screen.findByText('专业版')).closest('.pricing-card') as HTMLElement
    await user.click(within(card).getByRole('button', { name: '立即订阅' }))
    expect(await screen.findByText('login page')).toBeInTheDocument()
  })

  it('已登录订阅走支付弹窗', async () => {
    authed = true
    const user = userEvent.setup()
    renderPage()
    const card = (await screen.findByText('专业版')).closest('.pricing-card') as HTMLElement
    await user.click(within(card).getByRole('button', { name: '立即订阅' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('卡号'), '4242424242424242')
    await user.click(within(dialog).getByRole('button', { name: /确认支付/ }))
    await waitFor(() =>
      expect(subscribe).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'pro', billingCycle: 'monthly' })
      )
    )
  })
})
