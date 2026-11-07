/**
 * 全局轻提示：一处维护队列、定时器与渲染，调用方只描述「说什么、多久、带什么动作」。
 *
 * 三族位置/视觉按既有页面保持不变，由 variant 选择：
 * - shell：预览壳与设置页，挂 body 级宿主，底部固定、位于 dock 之上；
 * - reports：报表页，留在页面 DOM 内，跟随手机框定位，设置抽屉打开时可切到抽屉之上；
 * - stack：流水页，留在页面 DOM 内，最多 3 条自下而上堆叠。
 *
 * 上限与默认时长是对旧实现的逐项保留，不做静默统一：
 * - shell 普通 2.4s / 带动作 6s；设置页调用方显式传 2.6s；
 * - reports 2.4s；stack 恒为 6s，是否有撤销动作都一样。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ToastContext,
  useToast,
  type ToastAction,
  type ToastContextValue,
  type ToastItem,
  type ToastOptions,
  type ToastVariant,
} from './toastContext'
import { getPortalHost } from './portalHost'
import './toast.css'

const DEFAULT_SHELL_MS = 2400
const DEFAULT_ACTION_MS = 6000
const DEFAULT_STACK_MS = 6000
const MAX_STACKED = 3

function defaultDuration(variant: ToastVariant, action?: ToastAction): number {
  if (variant === 'stack') return DEFAULT_STACK_MS
  return action ? DEFAULT_ACTION_MS : DEFAULT_SHELL_MS
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const stateRef = useRef<ToastItem[]>([])
  const timers = useRef(new Map<number, number>())
  const seq = useRef(0)

  const commit = useCallback((next: ToastItem[]) => {
    stateRef.current = next
    setToasts(next)
  }, [])

  const clearTimer = useCallback((id: number) => {
    const timer = timers.current.get(id)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id)
      commit(stateRef.current.filter((item) => item.id !== id))
    },
    [clearTimer, commit],
  )

  const notify = useCallback(
    (message: string, options: ToastOptions = {}): number => {
      const variant = options.variant ?? 'shell'
      const id = seq.current + 1
      seq.current = id
      const item: ToastItem = { id, variant, message, action: options.action }
      const limit = variant === 'stack' ? MAX_STACKED : 1
      const sameVariant = stateRef.current.filter((entry) => entry.variant === variant)
      const overflow = sameVariant.slice(0, Math.max(0, sameVariant.length + 1 - limit))
      overflow.forEach((entry) => clearTimer(entry.id))
      commit([...stateRef.current.filter((entry) => !overflow.includes(entry)), item])

      const duration = options.duration ?? defaultDuration(variant, options.action)
      const timer = window.setTimeout(() => dismiss(id), duration)
      timers.current.set(id, timer)
      return id
    },
    [clearTimer, commit, dismiss],
  )

  const value = useMemo<ToastContextValue>(() => ({ toasts, notify, dismiss }), [toasts, notify, dismiss])

  useEffect(() => {
    const pending = timers.current
    return () => {
      pending.forEach((timer) => window.clearTimeout(timer))
      pending.clear()
    }
  }, [])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport variant="shell" />
    </ToastContext.Provider>
  )
}

/**
 * 渲染某一族的提示。shell 自动挂 body 级宿主；reports / stack 留在调用处，
 * 以保持原有的 fixed 包含块（预览手机框 / 页面根）。
 */
export function ToastViewport({ variant, className }: { variant: ToastVariant; className?: string }) {
  const { toasts, dismiss } = useToast()
  const items = toasts.filter((item) => item.variant === variant)
  if (items.length === 0) return null

  const runAction = (item: ToastItem) => {
    item.action?.run()
    dismiss(item.id)
  }

  if (variant === 'stack') {
    return (
      <div className="mb-tx-toast-stack">
        {items.map((item) => (
          <div key={item.id} className="mb-tx-toast" role="status">
            <span>{item.message}</span>
            {item.action && (
              <button type="button" className="mb-tx-toast-action" onClick={() => runAction(item)}>
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    )
  }

  const item = items[items.length - 1]
  if (variant === 'shell') {
    const node = (
      <div className="mb-hf-toast" role="status">
        <span>{item.message}</span>
        {item.action && (
          <button type="button" className="mb-hf-toast-action" onClick={() => runAction(item)}>
            {item.action.label}
          </button>
        )}
      </div>
    )
    return typeof document === 'undefined' ? node : createPortal(node, getPortalHost())
  }

  return (
    <div className={className ? `mb-rp-toast ${className}` : 'mb-rp-toast'} role="status">
      {item.message}
    </div>
  )
}
