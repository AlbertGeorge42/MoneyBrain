/**
 * 账本配置的拖拽排序共用件：只允许竖直方向移动。
 *
 * modifier 把 transform 的 x 归零，行样式再兜一层同样的归零（DragOverlay /
 * 测量阶段也拿不到水平位移），因此手柄拖动时元素不会左右漂移。
 */
import type { CSSProperties } from 'react'
import type { Modifier } from '@dnd-kit/core'
import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS, type Transform } from '@dnd-kit/utilities'

export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** 官方 sortable 的传感器组合：指针带 4px 防误触，键盘走同级坐标换算。 */
export function useVerticalDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/**
 * 拖拽行样式遵循 dnd-kit 官方 sortable 写法：transform / transition 原样来自 useSortable。
 * 尤其 transition 不能在释放时手动关掉——兄弟行从排序位移回到新 DOM 位置需要这条过渡，
 * 否则会看到「先弹回原位、再换到目标位」。x 归零只兜底水平漂移。
 */
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
