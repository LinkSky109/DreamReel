import { toast } from 'sonner'

export type ToastType = 'success' | 'error' | 'info'

export function showToast(message: string, type: ToastType = 'success'): void {
  if (type === 'error') {
    toast.error(message)
  } else if (type === 'info') {
    toast(message)
  } else {
    toast.success(message)
  }
}
