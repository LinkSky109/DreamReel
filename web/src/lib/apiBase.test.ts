import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { apiBase } from './api'

type EnvWindow = Window & { ENV_API_URL?: string }

describe('apiBase', () => {
  beforeEach(() => {
    localStorage.clear()
    delete (window as EnvWindow).ENV_API_URL
    vi.stubEnv('VITE_API_BASE_URL', '')
  })

  afterEach(() => {
    localStorage.clear()
    delete (window as EnvWindow).ENV_API_URL
    vi.unstubAllEnvs()
  })

  it('默认同源 /api，即使开发服务器带端口也不回退到 localhost:3000', () => {
    // jsdom 默认地址带 :3000，旧实现会拼出 http://localhost:3000/api。
    expect(window.location.port).not.toBe('')
    expect(apiBase()).toBe('/api')
  })

  it('运行时 ENV_API_URL 优先', () => {
    ;(window as EnvWindow).ENV_API_URL = 'https://api.example.com'
    expect(apiBase()).toBe('https://api.example.com')
  })

  it('构建期 VITE_API_BASE_URL 次之', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://build.example.com')
    localStorage.setItem('dreamreel_api_url', 'https://saved.example.com')
    expect(apiBase()).toBe('https://build.example.com')
  })

  it('localStorage 覆盖默认值', () => {
    localStorage.setItem('dreamreel_api_url', 'https://saved.example.com')
    expect(apiBase()).toBe('https://saved.example.com')
  })

  it('忽略空白值并去掉尾部斜杠，避免出现 // 路径', () => {
    ;(window as EnvWindow).ENV_API_URL = '  '
    expect(apiBase()).toBe('/api')

    ;(window as EnvWindow).ENV_API_URL = 'https://api.example.com/'
    expect(apiBase()).toBe('https://api.example.com')
  })
})
