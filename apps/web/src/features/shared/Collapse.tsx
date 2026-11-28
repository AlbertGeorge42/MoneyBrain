/**
 * 折叠动画的唯一实现：高度 + 透明度组合过渡，无弹簧回弹。
 *
 * 状态仍由调用方的展开集合持有，本组件只负责「展开时挂载、收起动画结束后卸载」，
 * 不保存第二份展开状态、不写持久化。动画中途再次切换方向时从当前高度 / 透明度续接，
 * 保证拖拽取消与连续拖拽不会跳变。
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type TransitionEvent,
} from 'react'
import './collapse.css'

export type CollapseTiming = 'normal' | 'quick' | 'restore'

/** 仅在浏览器没有解析出 CSS 时长变量时兜底，数值与主题变量一致。 */
const FALLBACK_MS: Record<CollapseTiming, number> = {
  normal: 180,
  quick: 120,
  restore: 170,
}

export interface CollapseProps {
  open: boolean
  timing?: CollapseTiming
  /** 展开 / 收起动画完成时回调，供 dnd-kit 重新测量最终布局。 */
  onSettled?: () => void
  children: ReactNode
}

export function Collapse({ open, timing = 'normal', onSettled, children }: CollapseProps) {
  const holderRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<number | null>(null)
  const settleRef = useRef<(() => void) | null>(null)
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled
  const [mounted, setMounted] = useState(open)

  // 展开时先把子节点挂进 DOM，下一次 layout effect 才能量到真实高度。
  useEffect(() => {
    if (open) setMounted(true)
  }, [open])

  useLayoutEffect(() => {
    const el = holderRef.current
    if (!el) return

    // 首次渲染直接落到目标状态，不播放动画。
    if (!el.dataset.state) {
      el.dataset.state = open ? 'open' : 'closed'
      el.style.height = open ? 'auto' : '0px'
      el.style.opacity = open ? '1' : '0'
      return
    }

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }

    const state = el.dataset.state
    settleRef.current = () => {
      const current = el.dataset.state
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (current === 'opening') {
        el.style.height = 'auto'
        el.dataset.state = 'open'
        settledRef.current?.()
      } else if (current === 'closing') {
        el.dataset.state = 'closed'
        setMounted(false)
        settledRef.current?.()
      }
    }

    if (open) {
      if (!mounted || state === 'open' || state === 'opening') return
    } else if (state === 'closed') {
      return
    }

    // 先钉住当前高度并关掉过渡，强制回流后再改目标值——否则从 auto 起跳不会动画。
    const currentHeight = el.getBoundingClientRect().height
    const currentOpacity = Number(getComputedStyle(el).opacity) || 0
    el.style.transition = 'none'
    el.style.height = `${currentHeight}px`
    el.style.opacity = String(currentOpacity)
    void el.offsetHeight
    el.style.transition = ''

    el.dataset.state = open ? 'opening' : 'closing'
    if (open) {
      el.style.height = `${el.scrollHeight}px`
      el.style.opacity = '1'
    } else {
      el.style.height = '0px'
      el.style.opacity = '0'
    }

    // transitionend 在 prefers-reduced-motion（时长 0）或动画被打断时可能不触发，
    // 用定时兜底保证一定从中间态落到终态。
    const raw = getComputedStyle(el).getPropertyValue('--mb-collapse-dur')
    const parsed = Number.parseFloat(raw)
    const ms = Number.isFinite(parsed) ? parsed : FALLBACK_MS[timing]
    timerRef.current = window.setTimeout(() => settleRef.current?.(), ms + 40)
  }, [open, mounted, timing])

  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const handleTransitionEnd = (event: TransitionEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget || event.propertyName !== 'height') return
    settleRef.current?.()
  }

  return (
    <div
      ref={holderRef}
      className="mb-shared-collapse"
      data-timing={timing}
      onTransitionEnd={handleTransitionEnd}
    >
      {mounted ? children : null}
    </div>
  )
}
