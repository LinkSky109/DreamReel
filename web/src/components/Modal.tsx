import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { Icon } from './Icon'

type ModalProps = {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: number
}

/**
 * Radix Dialog：焦点陷阱、Esc、遮罩关闭、焦点归还由组件库负责。
 * 视觉仍使用规范令牌（.dr-modal / .dr-scrim）。
 */
export function Modal({ open, title, onClose, children, footer, width }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dr-scrim" />
        <Dialog.Content
          className="dr-modal"
          style={width ? { width: `min(${width}px, 100%)` } : undefined}
          aria-describedby={undefined}
        >
          <div className="dr-modal-head">
            <Dialog.Title className="dr-modal-title">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="dr-icon-btn" aria-label="关闭">
                <Icon name="close" size={16} />
              </button>
            </Dialog.Close>
          </div>
          {children}
          {footer ? <div className="dr-modal-actions">{footer}</div> : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
