import type { ReactNode } from 'react'
import './skeleton.css'

interface SettingRowProps {
  label: ReactNode
  /** 行内变体的描述；堆叠变体的数值。 */
  description?: ReactNode
  /** 行内变体右侧的控件，例如开关、选择器、更多按钮。 */
  control?: ReactNode
  /** 堆叠变体中间的强调值（侧栏信息块）。 */
  value?: ReactNode
  /** 子级设置行缩进。 */
  indent?: boolean
  variant?: 'inline' | 'stack'
}

/**
 * 设置行：所有「标签/描述 + 控件」行的唯一实现；侧栏信息块走 stack 变体。
 * 行高与对齐数值见 docs/blueprint/ux/page-skeleton.md §2.3。
 */
export function SettingRow({
  label,
  description,
  control,
  value,
  indent = false,
  variant = 'inline',
}: SettingRowProps) {
  const className = [
    'mb-setting-row',
    variant === 'stack' ? 'is-stack' : '',
    indent ? 'is-indented' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={className} data-skeleton="setting-row">
      <div className="mb-setting-row-copy">
        <span className="mb-setting-row-label">{label}</span>
        {variant === 'stack' && value ? (
          <span className="mb-setting-row-value">{value}</span>
        ) : null}
        {description ? <span className="mb-setting-row-desc">{description}</span> : null}
      </div>
      {variant === 'inline' && control ? (
        <div className="mb-setting-row-control">{control}</div>
      ) : null}
    </div>
  )
}
