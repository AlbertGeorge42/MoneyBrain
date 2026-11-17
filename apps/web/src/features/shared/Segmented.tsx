/**
 * 共享分段切换：跨 feature 单一实现。
 *
 * Segmented（role=group）与 Tabs（role=tablist）共用本组件，只靠 props 表达差异：
 * - size：xs(28) / sm(32，默认) / lg(44)
 * - tone：raised（默认）/ accent（选中用强调文字）/ solid（选中用实心强调）
 * - fill：选项等宽铺满；bordered：容器描边
 * - ariaPressed：是否输出 aria-pressed（预算编辑器原本无此属性）
 * 基础视觉只在 segmented.css 定义一次，feature 不再维护自己的 is-active 实现。
 */
import type { ReactNode } from 'react'
import './segmented.css'

export interface SegmentedOption<T extends string> {
  id: T
  label: ReactNode
}

export type SegmentedTone = 'raised' | 'accent' | 'solid'

export interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: readonly SegmentedOption<T>[]
  onChange: (next: T) => void
  size?: 'xs' | 'sm' | 'lg'
  tone?: SegmentedTone
  fill?: boolean
  /** 仅移动端等宽铺满（时间粒度：桌面按内容、移动端均分整行）。 */
  fillMobile?: boolean
  bordered?: boolean
  ariaPressed?: boolean
  role?: 'group' | 'tablist'
  itemRole?: 'tab'
  className?: string
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = 'sm',
  tone = 'raised',
  fill = false,
  fillMobile = false,
  bordered = false,
  ariaPressed = true,
  role = 'group',
  itemRole,
  className,
}: SegmentedProps<T>) {
  const containerClass = [
    'mb-shared-seg',
    bordered ? 'mb-shared-seg--bordered' : '',
    fill ? 'mb-shared-seg--fill' : '',
    fillMobile ? 'mb-shared-seg--fill-mobile' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={containerClass} role={role} aria-label={label}>
      {options.map((option) => {
        const active = option.id === value
        const itemClass = [
          'mb-shared-seg-btn',
          size === 'xs' ? 'mb-shared-seg-btn--xs' : '',
          size === 'lg' ? 'mb-shared-seg-btn--lg' : '',
          tone === 'accent' ? 'mb-shared-seg-btn--accent' : '',
          tone === 'solid' ? 'mb-shared-seg-btn--solid' : '',
          active ? 'is-active' : '',
        ]
          .filter(Boolean)
          .join(' ')
        return (
          <button
            key={option.id}
            type="button"
            className={itemClass}
            role={itemRole}
            aria-pressed={itemRole === 'tab' ? undefined : ariaPressed ? active : undefined}
            aria-selected={itemRole === 'tab' ? active : undefined}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
