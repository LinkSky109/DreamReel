import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { SyncTab } from './SyncTab'
import { LangProvider } from '../../lib/i18n'
import type { NovelDetail } from '../../domain/types'

const generateNovelStyle = vi.fn()
const getNovelSyncScopes = vi.fn()
const getNovelManifest = vi.fn()
const getNovelSyncLedger = vi.fn()
const syncNovel = vi.fn()
const getCloudDriveStatus = vi.fn()
const createQuarkQr = vi.fn()
const logoutCloudDrive = vi.fn()

vi.mock('../../lib/api', () => ({
  api: {
    generateNovelStyle: (id: string) => generateNovelStyle(id),
    getNovelSyncScopes: (id: string) => getNovelSyncScopes(id),
    getNovelManifest: (id: string, scope: string) => getNovelManifest(id, scope),
    getNovelSyncLedger: (id: string) => getNovelSyncLedger(id),
    syncNovel: (id: string, body: unknown) => syncNovel(id, body),
    getCloudDriveStatus: (verify: boolean) => getCloudDriveStatus(verify),
    createQuarkQr: () => createQuarkQr(),
    getQuarkQrStatus: vi.fn(),
    logoutCloudDrive: () => logoutCloudDrive(),
  },
}))

const novel: NovelDetail = {
  id: 'n1',
  title: '长夜将明',
  stage: 'sync' as never,
  counts: { chapters: 12, characters: 3, episodes: 3 },
  style: {
    scope: 'book',
    name: '写实叙事',
    visual: '自然光',
    narration: '第三人称',
    music: '低沉',
    provider: 'llm',
  },
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-02T00:00:00.000Z',
}

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <LangProvider>
          <SyncTab novel={novel} onChanged={vi.fn()} />
        </LangProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('SyncTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    generateNovelStyle.mockResolvedValue({})
    getNovelSyncScopes.mockResolvedValue([
      { key: 'deliverables', label: '产物 + 文档' },
      { key: 'all', label: '全部' },
    ])
    getNovelManifest.mockResolvedValue({ fileCount: 12, scope: 'deliverables', files: [] })
    getNovelSyncLedger.mockResolvedValue({
      last: {
        backend: 'webdav',
        url: 'https://dav.example',
        remoteDir: 'novel-1',
        at: '2026-10-02T00:00:00.000Z',
        uploaded: 3,
        skipped: 9,
      },
    })
    getCloudDriveStatus.mockResolvedValue({ configured: false })
    syncNovel.mockResolvedValue({
      fileCount: 12,
      changed: 3,
      copied: 3,
      uploaded: 3,
      skipped: 9,
    })
    createQuarkQr.mockResolvedValue({ token: 't1', svg: '<svg></svg>', expiresInSec: 120 })
    logoutCloudDrive.mockResolvedValue({})
  })

  it('渲染风格、同步记录与文件数', async () => {
    renderTab()
    expect(await screen.findByText('写实叙事')).toBeInTheDocument()
    expect(screen.getByText('自然光')).toBeInTheDocument()
    expect(await screen.findByText(/12 个文件/)).toBeInTheDocument()
    expect(screen.getByText(/上次同步/)).toHaveTextContent('webdav')
  })

  it('生成风格调用接口', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.click(await screen.findByRole('button', { name: /重新生成风格/ }))
    await waitFor(() => expect(generateNovelStyle).toHaveBeenCalledWith('n1'))
  })

  it('本地预览需要目录并调用 dryRun', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.type(await screen.findByPlaceholderText(/本地同步目标目录/), '/tmp/out')
    await user.click(screen.getByRole('button', { name: '预览变更' }))
    await waitFor(() =>
      expect(syncNovel).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({ backend: 'local', dryRun: true, targetDir: '/tmp/out' })
      )
    )
  })

  it('WebDAV 同步带范围、冲突策略与强制标记', async () => {
    const user = userEvent.setup()
    renderTab()
    await user.type(await screen.findByPlaceholderText(/远端子目录/), 'novel-1')
    await user.click(screen.getByLabelText('完整重传'))
    await user.click(screen.getByRole('button', { name: '同步到 WebDAV' }))
    await waitFor(() =>
      expect(syncNovel).toHaveBeenCalledWith(
        'n1',
        expect.objectContaining({
          backend: 'webdav',
          dryRun: false,
          remoteDir: 'novel-1',
          onConflict: 'overwrite',
          force: true,
          scope: 'deliverables',
        })
      )
    )
  })

  it('音色管理提供旧版入口', async () => {
    renderTab()
    expect(await screen.findByRole('link', { name: /打开旧版音色管理/ })).toHaveAttribute(
      'href',
      '/novel-legacy/n1?tab=sync'
    )
  })
})
