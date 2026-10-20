import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from '../components/Modal'

function Harness() {
  const [open, setOpen] = useState(true)
  return (
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
  )
}

describe('Modal (Radix Dialog)', () => {
  it('打开时渲染对话框并聚焦', () => {
    render(<Harness />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('弹层内容')).toBeInTheDocument()
  })

  it('Esc 关闭并移除对话框', async () => {
    render(<Harness />)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('点击关闭按钮可关闭', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
