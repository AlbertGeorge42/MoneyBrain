import type { HTMLAttributes, ReactNode } from 'react'
import './badge.css'

export type BadgeTone = 'income' | 'expense' | 'transfer' | 'neutral' | 'excluded'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 业务语义色。 */
  tone?: BadgeTone
  children?: ReactNode
}

/**
 * 语义徽标：跨 feature 单一实现（原 mb-ov-badge / mb-tx-badge 两套，
 * 且旧调用用 `--${tone}` 独立类与绑定式 CSS 失配导致颜色未生效）。
 * tone prop 输出绑定式 class，语义色可靠生效。
 */
export function Badge({ tone = 'neutral', className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={['mb-shared-badge', `mb-shared-badge--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </span>
  )
}
