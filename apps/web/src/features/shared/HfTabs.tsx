/**
 * 共享页签。
 *
 * 三处页签只有视觉类名不同：报表页（桌面 / 移动各一份实现）与设置页。
 * 结构、ARIA 与键盘可达性完全沿用原生按钮：Enter / Space 触发，Tab 依次聚焦。
 */
import type { ReactNode } from 'react'

export interface HfTabItem<T extends string> {
  id: T
  label: ReactNode
}

export function HfTabs<T extends string>({
  label,
  value,
  items,
  onChange,
  variant,
  className,
}: {
  label: string
  value: T
  items: readonly HfTabItem<T>[]
  onChange: (next: T) => void
  variant: 'report' | 'settings'
  /** 追加到容器上的类名（报表移动端用 `is-mobile`）。 */
  className?: string
}) {
  const containerClass = variant === 'report' ? 'mb-rp-tabs' : 'mb-set-tabs'
  const tabClass = variant === 'report' ? 'mb-rp-tab' : 'mb-set-tab'
  return (
    <div
      className={className ? `${containerClass} ${className}` : containerClass}
      role="tablist"
      aria-label={label}
    >
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            className={active ? `${tabClass} is-active` : tabClass}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
