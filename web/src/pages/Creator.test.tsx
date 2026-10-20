import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CreatorPage } from './Creator'
import { LangProvider } from '../lib/i18n'

const getCreatorPage = vi.fn()
const updateCreatorProfile = vi.fn()

vi.mock('../lib/api', () => ({
  api: {
    getCreatorPage: (userId: string) => getCreatorPage(userId),
    updateCreatorProfile: (userId: string, body: unknown) => updateCreatorProfile(userId, body),
  },
}))

const page = {
  profile: {
    userId: 'usr_lin',
    displayName: '林一',
    bio: '拍太空与城市。',
    isPublic: true,
    createdAt: '2026-09-01T00:00:00.000Z',
  },
  works: [
    { id: 'p1', name: '星海回声', status: 'in-progress', shotCount: 6, updatedAt: '2026-10-10T00:00:00.000Z' },
  ],
  stats: { workCount: 1, totalDuration: 42, completedCount: 0, likeCount: 3 },
  publicUrl: '/creator/usr_lin',
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/creator/usr_lin']}>
        <LangProvider>
          <Routes>
            <Route path="/creator/:name" element={<CreatorPage />} />
          </Routes>
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('CreatorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('dreamreel_user', JSON.stringify({ id: 'usr_lin' }))
    getCreatorPage.mockResolvedValue(page)
    updateCreatorProfile.mockResolvedValue({
      success: true,
      profile: { ...page.profile, displayName: '林一导演' },
    })
  })

  it('渲染创作者资料、统计与作品', async () => {
    renderPage()
    expect(await screen.findByRole('heading', { name: '林一' })).toBeInTheDocument()
    expect(screen.getByText('拍太空与城市。')).toBeInTheDocument()
    expect(screen.getByText(/42s/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /星海回声/ })).toBeInTheDocument()
  })

  it('本人可编辑资料并保存', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('heading', { name: '林一' })
    await user.click(screen.getByRole('button', { name: /编辑资料/ }))
    const dialog = await screen.findByRole('dialog')
    const nameInput = within(dialog).getByLabelText('昵称')
    await user.clear(nameInput)
    await user.type(nameInput, '林一导演')
    await user.click(within(dialog).getByRole('button', { name: '保存' }))
    await waitFor(() =>
      expect(updateCreatorProfile).toHaveBeenCalledWith('usr_lin', {
        displayName: '林一导演',
        bio: '拍太空与城市。',
        isPublic: true,
      })
    )
  })
})
