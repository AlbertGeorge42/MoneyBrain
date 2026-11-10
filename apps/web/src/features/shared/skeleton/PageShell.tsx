import type { ReactNode } from 'react'
import './skeleton.css'

interface PageShellProps {
  /** 页头：标题 / 副标题 / 页级动作。移动端可由 PageShell 省略，交给 shell 头代偿。 */
  head?: ReactNode
  /** 控件行：时间器 / 分段控件 / 筛选器。没有页面级控件时传空。 */
  controls?: ReactNode
  children: ReactNode
}

/**
 * 页面骨架：页头 / 控件行 / 内容三段。
 *
 * 迁移期用 display:contents 让三段直接参与内容容器的 flex 排布，
 * 保证与旧 DOM 零视觉差异；槽位与数值见 docs/ui-design.md §2.5。
 */
export function PageShell({ head, controls, children }: PageShellProps) {
  return (
    <div className="mb-page-shell" data-skeleton="page-shell">
      {head}
      {controls}
      {children}
    </div>
  )
}
