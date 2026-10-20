import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { StorePage } from './Store'
import { LangProvider } from '../lib/i18n'

const listStorePacks = vi.fn()
const myStoreAssets = vi.fn()
const purchaseStorePack = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    listStorePacks: () => listStorePacks(),
    myStoreAssets: (userId: string) => myStoreAssets(userId),
    purchaseStorePack: (packId: string, userId: string) => purchaseStorePack(packId, userId),
  },
  hasToken: () => false,
}))

const packs = [
  { id: 'pack-nolan', name: '诺兰叙事风格包', type: 'style_pack', price: 19, author: '官方', description: '冷色调与时间交叉叙事。', items: 5 },
  { id: 'pack-anime', name: '日系动漫风格包', type: 'style_pack', price: 0, author: '社区', description: '日系动漫风格预设。', items: 4 },
  { id: 'pack-audio', name: 'Lo-Fi 氛围音乐包', type: 'audio_pack', price: 15, author: '独立制作人', description: '12 首循环。', items: 12 },
]

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/store']}>
        <LangProvider>
          <StorePage />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('StorePage', () => {
  beforeEach(() => {
    localStorage.clear()
    localStorage.setItem('dreamreel_user', JSON.stringify({ id: 'usr_a', username: '测试' }))
    vi.clearAllMocks()
    listStorePacks.mockResolvedValue({ total: 3, items: packs })
    myStoreAssets.mockResolvedValue({ total: 1, totalValue: 19, items: [{ packId: 'pack-nolan', price: 19, purchasedAt: '2026-10-01T00:00:00.000Z', orderId: 'ord_1', pack: packs[0] }] })
    purchaseStorePack.mockResolvedValue({ success: true, orderId: 'ord_2', price: 0, pack: packs[1] })
  })

  it('渲染素材包、已拥有状态与分类筛选', async () => {
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByText('诺兰叙事风格包')).toBeInTheDocument()
    const ownedCard = screen.getByText('诺兰叙事风格包').closest('.store-card') as HTMLElement
    expect(within(ownedCard).getByRole('button', { name: /已拥有/ })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: /音效包/ }))
    expect(screen.queryByText('诺兰叙事风格包')).not.toBeInTheDocument()
    expect(screen.getByText('Lo-Fi 氛围音乐包')).toBeInTheDocument()
  })

  it('免费领取调用真实接口', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('日系动漫风格包')
    await user.click(screen.getByRole('button', { name: '免费领取' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '确认领取' }))
    await waitFor(() => expect(purchaseStorePack).toHaveBeenCalledWith('pack-anime', 'usr_a'))
  })

  it('付费包显示演示购买说明', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Lo-Fi 氛围音乐包')
    await user.click(screen.getByRole('button', { name: /¥15 购买/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/不会产生真实扣款/)).toBeInTheDocument()
  })
})
