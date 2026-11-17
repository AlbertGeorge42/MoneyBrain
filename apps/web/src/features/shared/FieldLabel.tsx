import type { HTMLAttributes, LabelHTMLAttributes, ReactNode } from 'react'
import './typography.css'

type FieldLabelTag = 'label' | 'span' | 'legend'

interface FieldLabelBaseProps {
  children?: ReactNode
  /** 默认 span；关联表单控件用 label，字段组用 legend。 */
  as?: FieldLabelTag
  className?: string
}

type FieldLabelProps = FieldLabelBaseProps &
  (LabelHTMLAttributes<HTMLLabelElement> & HTMLAttributes<HTMLElement>)

/**
 * 表单字段标签：跨 feature 单一实现（原 mb-shared-label / mb-set-label /
 * mb-tx-field-label 三套逐字相同）。
 * 元素语义通过 as 表达：span（默认）、label（配 htmlFor）、legend（字段组）。
 */
export function FieldLabel({ as = 'span', className, children, ...rest }: FieldLabelProps) {
  const Tag = as
  return (
    <Tag className={['mb-shared-label', className].filter(Boolean).join(' ') || undefined} {...rest}>
      {children}
    </Tag>
  )
}
