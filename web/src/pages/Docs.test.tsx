import { describe, expect, it, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { DocsPage } from './Docs'
import { LangProvider } from '../lib/i18n'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/docs']}>
      <LangProvider>
        <DocsPage />
      </LangProvider>
    </MemoryRouter>
  )
}

describe('DocsPage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('中文模式展示分组与端点说明', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'API 文档' })).toBeInTheDocument()
    expect(screen.getByText('项目与分镜')).toBeInTheDocument()
    expect(screen.getByText('账户与额度')).toBeInTheDocument()
    expect(screen.getByText('资产与协作')).toBeInTheDocument()
    expect(screen.getByText('创建项目')).toBeInTheDocument()
    expect(screen.getByText('参数校验失败')).toBeInTheDocument()
  })

  it('英文模式展示英文分组与端点说明', () => {
    localStorage.setItem('dreamreel_lang', 'en')
    renderPage()
    expect(screen.getByRole('heading', { name: 'API docs' })).toBeInTheDocument()
    expect(screen.getByText('Projects & shots')).toBeInTheDocument()
    expect(screen.getByText('Account & quota')).toBeInTheDocument()
    expect(screen.getByText('Assets & collaboration')).toBeInTheDocument()
    expect(screen.getByText('Create project')).toBeInTheDocument()
    expect(screen.getByText('Validation failed')).toBeInTheDocument()
  })
})
