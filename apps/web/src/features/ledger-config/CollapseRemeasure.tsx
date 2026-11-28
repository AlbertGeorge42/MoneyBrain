/**
 * 折叠动画结束后强制 dnd-kit 重新测量 droppable。
 *
 * 动画期间行位在变；若指针停留不动，dnd-kit 不会自行重算碰撞，松手就会沿用动画中途的
 * rect 而落偏。Collapse 的 onSettled 走这里，量到最终布局后再刷新碰撞目标。
 */
import { useEffect } from 'react'
import { useDndContext } from '@dnd-kit/core'

export function CollapseRemeasure({ register }: { register: (remeasure: () => void) => void }) {
  const { measureDroppableContainers } = useDndContext()
  useEffect(() => {
    register(() => measureDroppableContainers([]))
  }, [register, measureDroppableContainers])
  return null
}
