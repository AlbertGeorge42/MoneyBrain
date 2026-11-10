import type { ReactNode } from 'react'
import './skeleton.css'

interface ControlRowProps {
  children: ReactNode
}

/**
 * 控件行：页面级控件唯一的容身处，位置固定紧跟页头。
 *
 * 本次迁移保持零视觉差异：display:contents 让内部的传统控件元素
 * 直接参与内容容器排布；控件白名单与各宽度数值见
 * docs/ui-design.md §2.5。
 */
export function ControlRow({ children }: ControlRowProps) {
  return (
    <div className="mb-control-row" data-skeleton="control-row">
      {children}
    </div>
  )
}
