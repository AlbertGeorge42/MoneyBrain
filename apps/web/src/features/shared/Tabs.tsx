/**
 * 共享页签：Segmented 的 tablist 语义外观层。
 *
 * 基础视觉、结构与交互全部复用 Segmented（segmented.css 单一实现）；
 * 这里只固定 role=tablist / role=tab + aria-selected，保留原生按钮键盘可达性。
 */
import type { ReactNode } from 'react'
import { Segmented } from './Segmented'

export interface TabItem<T extends string> {
  id: T
  label: ReactNode
}

export function Tabs<T extends string>({
  label,
  value,
  items,
  onChange,
  bordered,
  className,
}: {
  label: string
  value: T
  items: readonly TabItem<T>[]
  onChange: (next: T) => void
  bordered?: boolean
  className?: string
}) {
  return (
    <Segmented
      label={label}
      value={value}
      options={items}
      onChange={onChange}
      role="tablist"
      itemRole="tab"
      bordered={bordered}
      className={className}
    />
  )
}
