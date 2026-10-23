import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { request } from './api'

describe('401 统一处理', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('清除 token 并广播 unauthorized 事件', async () => {
    localStorage.setItem('dreamreel_token', 'tok')
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: '未登录' }),
    }) as unknown as typeof fetch

    const handler = vi.fn()
    window.addEventListener('dreamreel:unauthorized', handler)

    await expect(request('/projects')).rejects.toMatchObject({ status: 401 })
    expect(localStorage.getItem('dreamreel_token')).toBeNull()
    expect(handler).toHaveBeenCalledTimes(1)

    window.removeEventListener('dreamreel:unauthorized', handler)
  })

  it('登录接口 401 不广播跳转', async () => {
    const handler = vi.fn()
    window.addEventListener('dreamreel:unauthorized', handler)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: '密码错误' }),
    }) as unknown as typeof fetch

    await expect(request('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
    })
    expect(handler).not.toHaveBeenCalled()
    window.removeEventListener('dreamreel:unauthorized', handler)
  })
})
