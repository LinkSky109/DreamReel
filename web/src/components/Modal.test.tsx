import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../components/Modal'
import { LangProvider } from '../lib/i18n'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <LangProvider>
      <button type="button" onClick={() => setOpen(true)}>
        打开弹层
      </button>
      <Modal
        open={open}
        title="测试弹层"
        onClose={() => setOpen(false)}
        footer={
          <button type="button" onClick={() => setOpen(false)}>
            完成
          </button>
        }
      >
        <p>弹层内容</p>
      </Modal>
    </LangProvider>
  )
}

describe('Modal (Radix Dialog)', () => {
  it('打开时渲染对话框并聚焦关闭按钮', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '打开弹层' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('弹层内容')).toBeInTheDocument()
    expect(document.activeElement?.getAttribute('aria-label')).toBe('关闭')
  })

  it('Esc 关闭、移除对话框并把焦点还给触发元素', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: '打开弹层' })
    await user.click(trigger)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('点击关闭按钮可关闭', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '打开弹层' }))
    await user.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
