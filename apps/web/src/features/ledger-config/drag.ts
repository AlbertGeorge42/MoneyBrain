/**
 * 账本配置的拖拽排序共用件：只允许竖直方向移动。
 *
 * modifier 把 transform 的 x 归零，行样式再兜一层同样的归零（DragOverlay /
 * 测量阶段也拿不到水平位移），因此手柄拖动时元素不会左右漂移。
 */
import type { CSSProperties } from 'react'
import type { Modifier } from '@dnd-kit/core'
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { CSS, type Transform } from '@dnd-kit/utilities'

export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

export function useVerticalDragSensors() {
  return useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
}

export function verticalDragStyle(
  transform: Transform | null,
  transition?: string,
  isDragging = false,
): CSSProperties {
  return {
    transform: CSS.Transform.toString(transform ? { ...transform, x: 0 } : null),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
}
