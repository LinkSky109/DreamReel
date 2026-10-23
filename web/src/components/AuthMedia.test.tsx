import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { AuthImage } from './AuthImage'
import { AuthVideo } from './AuthVideo'
import { AuthAudio } from './AuthAudio'

describe('AuthMedia', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
    URL.createObjectURL = vi.fn(() => 'blob:mock')
    URL.revokeObjectURL = vi.fn()
  })

  it('无 src 时显示加载占位', () => {
    render(<AuthImage alt="封面" />)
    expect(screen.getByLabelText('封面')).toBeInTheDocument()
  })

  it('同源资源携带 token 并渲染 blob 图片', async () => {
    localStorage.setItem('dreamreel_token', 'tok')
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) })
    vi.stubGlobal('fetch', fetchMock)

    render(<AuthImage src="/storage/a.png" alt="封面" />)
    const img = await screen.findByRole('img', { name: '封面' })
    expect(img).toHaveAttribute('src', 'blob:mock')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/storage/a.png'),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer tok' }) })
    )
  })

  it('失败时显示登录提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }))
    render(<AuthImage src="https://cdn.example.com/a.png" alt="封面" />)
    expect(await screen.findByText('需登录查看')).toBeInTheDocument()
  })

  it('视频与音频成功渲染', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['x']) }))
    const { container } = render(
      <>
        <AuthVideo src="/storage/v.mp4" />
        <AuthAudio src="/storage/a.mp3" />
      </>
    )
    await waitFor(() => expect(container.querySelector('video')).toBeTruthy())
    expect(container.querySelector('video')).toHaveAttribute('src', 'blob:mock')
    expect(container.querySelector('audio')).toHaveAttribute('src', 'blob:mock')
  })
})
