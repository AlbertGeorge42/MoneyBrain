import type { ReactNode } from 'react'
import { Card } from './Card'
import './emptyState.css'

export interface EmptyStateProps {
  /** 56px 圆形图标标记；省略则为纯文字空态。 */
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** 主操作按钮（放在描述下方）。 */
  action?: ReactNode
  /** 卡片外壳：report 用于报表页，surface（默认）用于总览/预算/设置。 */
  variant?: 'surface' | 'report'
}

/**
 * 空状态：跨 feature 单一实现（原 mb-rp-empty / mb-bg-empty / mb-set-empty
 * 三套结构同构、仅尺寸与圆角漂移）。差异通过 props 表达，不再各写一套 CSS。
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'surface',
}: EmptyStateProps) {
  return (
    <Card variant={variant} className="mb-shared-empty">
      {icon && (
        <div className="mb-shared-empty-mark" aria-hidden="true">
          {icon}
        </div>
      )}
      <h2 className="mb-shared-empty-title">{title}</h2>
      {description && <p className="mb-shared-empty-desc">{description}</p>}
      {action}
    </Card>
  )
}
