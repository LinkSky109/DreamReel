import { useEffect, useRef, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { useLang } from '../lib/i18n'
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
 * Radix Dialog 负责焦点陷阱、Esc 与遮罩关闭；
 * 这里额外记录打开前的触发元素，在关闭后归还焦点（规范 §6 Modal）。
 * 视觉仍使用规范令牌（.dr-modal / .dr-scrim）。
 */
export function Modal({ open, title, onClose, children, footer, width }: ModalProps) {
  const { t } = useLang()
  const triggerRef = useRef<HTMLElement | null>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (open) {
      wasOpenRef.current = true
      if (!triggerRef.current) {
        const active = document.activeElement
        if (active instanceof HTMLElement && !active.closest('[role="dialog"]')) {
          triggerRef.current = active
        }
      }
      return
    }
    if (!wasOpenRef.current) {
      // 关闭状态：记录最近一次 pointerdown / keydown 前的焦点元素，作为打开后的归还目标
      const remember = (event: FocusEvent) => {
        const active = event.target
        if (active instanceof HTMLElement && !active.closest('[role="dialog"]')) {
          triggerRef.current = active
        }
      }
      document.addEventListener('focusin', remember, true)
      return () => {
        document.removeEventListener('focusin', remember, true)
      }
    }
    wasOpenRef.current = false
    const trigger = triggerRef.current
    triggerRef.current = null
    if (trigger && document.contains(trigger)) {
      requestAnimationFrame(() => trigger.focus())
    }
  }, [open])

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
              <button type="button" className="dr-icon-btn" aria-label={t('关闭', 'Close')}>
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
