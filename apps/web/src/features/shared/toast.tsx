/**
 * 全局轻提示：一处维护队列、定时器与渲染，调用方只描述「说什么、带什么动作」。
 *
 * 统一口径：
 * - 时长只看有没有动作：无动作 2.4s，带动作 6s；与 variant 无关。
 * - 所有族最多同时 3 条，超出时新盖旧（移除最旧一条），最新的固定在底部、旧的向上排。
 * - 动作文案与回调由调用方提供，这里不改写。
 *
 * variant 只决定渲染位置与层级，这是定位需要而非口径差异：
 * - shell：预览壳与设置页，挂 body 级宿主（`.mb-hf-portal`），避免被 `.mb-hf-canvas` /
 *   `.mb-hf-phone` 的 transform 变成 fixed 包含块，从而始终保持贴视口底部、位于 dock 之上；
 * - reports：报表页，留在页面 DOM 内跟随手机框定位；设置抽屉打开时加 `is-over-sheet`
 *   抬到抽屉之上，避免遮住常驻底部的「完成」；
 * - stack：流水页，留在页面 DOM 内，与合计条 / 批量条保持同一底部槽位。
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ToastContext,
  useToast,
  type ToastContextValue,
  type ToastItem,
  type ToastOptions,
  type ToastVariant,
} from './toastContext'
import { getPortalHost } from './portalHost'
import './toast.css'

const DEFAULT_MS = 2400
const ACTION_MS = 6000
const MAX_VISIBLE = 3

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
      const sameVariant = stateRef.current.filter((entry) => entry.variant === variant)
      const overflow = sameVariant.slice(0, Math.max(0, sameVariant.length + 1 - MAX_VISIBLE))
      overflow.forEach((entry) => clearTimer(entry.id))
      commit([...stateRef.current.filter((entry) => !overflow.includes(entry)), item])

      const timer = window.setTimeout(() => dismiss(id), options.action ? ACTION_MS : DEFAULT_MS)
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
 * 三族共用同一个堆叠结构：容器贴底、子项自下而上排列，最新一条在最下方。
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

  if (variant === 'shell') {
    const node = (
      <div className="mb-hf-toast-stack">
        {items.map((item) => (
          <div key={item.id} className="mb-hf-toast" role="status">
            <span>{item.message}</span>
            {item.action && (
              <button type="button" className="mb-hf-toast-action" onClick={() => runAction(item)}>
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    )
    return typeof document === 'undefined' ? node : createPortal(node, getPortalHost())
  }

  return (
    <div className={className ? `mb-rp-toast-stack ${className}` : 'mb-rp-toast-stack'}>
      {items.map((item) => (
        <div key={item.id} className="mb-rp-toast" role="status">
          {item.message}
        </div>
      ))}
    </div>
  )
}
