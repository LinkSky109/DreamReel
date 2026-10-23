import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { api } from './api'

/**
 * api.ts 端到端契约（URL / method / body）。
 * 只验证请求构造，不依赖后端。
 */
function mockJson(payload: unknown = { ok: true }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function lastCall(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, init }
}

describe('api 请求契约', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('认证与配额', async () => {
    const fetchMock = mockJson()
    await api.getMe()
    expect(lastCall(fetchMock).url).toBe('/api/auth/me')

    await api.login({ email: 'a@b.com', password: 'x' })
    let call = lastCall(fetchMock)
    expect(call.url).toBe('/api/auth/login')
    expect(call.init.method).toBe('POST')
    expect(JSON.parse(String(call.init.body))).toEqual({ email: 'a@b.com', password: 'x' })

    await api.getQuota()
    expect(lastCall(fetchMock).url).toBe('/api/quota/me')
  })

  it('项目列表查询与写操作', async () => {
    const fetchMock = mockJson({ items: [], total: 0 })
    await api.listProjects({ search: '星', status: 'draft', limit: 10 })
    const url = lastCall(fetchMock).url
    expect(url).toContain('/api/projects?')
    expect(url).toContain('search=%E6%98%9F')
    expect(url).toContain('status=draft')
    expect(url).toContain('limit=10')

    await api.createProject({ name: '新项目' })
    expect(lastCall(fetchMock).init.method).toBe('POST')

    await api.updateProject('p1', { name: '改名' })
    let call = lastCall(fetchMock)
    expect(call.url).toBe('/api/projects/p1')
    expect(call.init.method).toBe('PUT')

    await api.toggleFavorite('p1')
    call = lastCall(fetchMock)
    expect(call.url).toBe('/api/projects/p1/favorite')
    expect(call.init.method).toBe('POST')

    await api.batchFavorite(['p1', 'p2'], true)
    call = lastCall(fetchMock)
    expect(call.url).toBe('/api/projects/batch/favorite')
    expect(JSON.parse(String(call.init.body))).toMatchObject({ favorite: true })
  })

  it('统计、小说与分享端点', async () => {
    const fetchMock = mockJson({ data: [] })
    await api.getStatsDashboard()
    expect(lastCall(fetchMock).url).toBe('/api/stats/dashboard')

    await api.listNovels()
    expect(lastCall(fetchMock).url).toBe('/api/novels')

    await api.getNovel('n1')
    expect(lastCall(fetchMock).url).toBe('/api/novels/n1')

    await api.createNovel({ title: '长夜', author: '林' })
    let call = lastCall(fetchMock)
    expect(call.url).toBe('/api/novels')
    expect(JSON.parse(String(call.init.body)).title).toBe('长夜')

    await api.getSharedProject('tok')
    expect(lastCall(fetchMock).url).toBe('/api/collab/shared/tok')
  })

  it('脚本生成携带 body', async () => {
    const fetchMock = mockJson({ success: true })
    await api.generateScript({ idea: '火星', targetDuration: 60 } as never)
    const call = lastCall(fetchMock)
    expect(call.url).toBe('/api/script/generate')
    expect(call.init.method).toBe('POST')
    expect(JSON.parse(String(call.init.body)).idea).toBe('火星')
  })
})
