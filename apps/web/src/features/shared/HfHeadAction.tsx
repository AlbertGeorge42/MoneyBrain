/**
 * 页头动作按钮。
 *
 * 移动端页头的次级动作（流水「显示」、预算「新增」）语义相同，
 * 原来在三个业务 CSS 里各写一份 `.mb-*-head-action`，尺寸与配色却已经漂移。
 * 这里收成一处：触控高度、accent 文字色、字重都由同一份规则决定。
 */
import type { ReactNode } from 'react'
import './headAction.css'

export function HfHeadAction({
  children,
  onClick,
  ariaExpanded,
  ariaLabel,
}: {
  children: ReactNode
  onClick: () => void
  /** 关联的浮层是否展开（按钮形态不变，只是给读屏软件一个状态）。 */
  ariaExpanded?: boolean
  ariaLabel?: string
}) {
  return (
    <button
      type="button"
      className="mb-head-action"
      aria-expanded={ariaExpanded}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
