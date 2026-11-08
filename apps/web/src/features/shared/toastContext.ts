/**
 * 轻提示的上下文与公共类型。
 *
 * 只承载状态与调用契约；渲染在 toast.tsx 的 ToastViewport 中完成。
 * 拆成独立文件是为了让调用方 `useToast()` 与 Provider 组件分开导入，
 * 避免同一文件同时导出组件与非组件（Fast Refresh 会告警）。
 */
import { createContext, useContext } from 'react'

export type ToastVariant = 'shell' | 'reports' | 'stack'

export interface ToastAction {
  label: string
  run: () => void
}

export interface ToastOptions {
  /** 位置 / 层级族，默认 shell（预览壳与设置页共用）。只决定把提示渲染在哪，不决定时长。 */
  variant?: ToastVariant
  /** 行内动作，如「撤销」。带动作的提示停留 6 秒，无动作 2.4 秒；点击后先执行回调再关闭。 */
  action?: ToastAction
}

export interface ToastItem {
  id: number
  variant: ToastVariant
  message: string
  action?: ToastAction
}

export interface ToastContextValue {
  toasts: readonly ToastItem[]
  notify: (message: string, options?: ToastOptions) => number
  dismiss: (id: number) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast 必须在 ToastProvider 内使用')
  return value
}
