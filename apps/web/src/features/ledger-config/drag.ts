/**
 * 账本配置的拖拽排序共用件：只允许竖直方向移动。
 *
 * modifier 把 transform 的 x 归零，行样式再兜一层同样的归零（DragOverlay /
 * 测量阶段也拿不到水平位移），因此手柄拖动时元素不会左右漂移。
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { flushSync } from 'react-dom'
import {
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type Modifier,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { CSS, type Transform } from '@dnd-kit/utilities'

export const restrictToVerticalAxis: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/**
 * 同级碰撞检测：一级与二级都注册在同一个 SortableContext 里，
 * 但只跟自己同一 scope 的兄弟比较，避免拖子级时把父级 / 别组子级当成落点。
 * 拖一级前的临时折叠已经改变 DOM，碰撞检测直接用折叠后的新布局，不做坐标补偿。
 */
export const sameScopeClosestCenter: CollisionDetection = (args) => {
  const scope = (args.active.data.current as { sortScope?: string } | undefined)?.sortScope
  if (!scope) return closestCenter(args)
  return closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (container) =>
        (container.data.current as { sortScope?: string } | undefined)?.sortScope === scope,
    ),
  })
}

/** 官方 sortable 的传感器组合：指针带 4px 防误触，键盘走同级坐标换算。 */
export function useVerticalDragSensors() {
  return useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
}

/**
 * 一级节点拖拽时的临时折叠：复用宿主已有的展开集合 setter，不另建状态系统，也不写持久化。
 *
 * begin 必须先记录原始展开状态，再同步折叠；flushSync 让 DOM 在 onDragStart 返回前就更新，
 * 后续碰撞检测拿到的就是折叠后的行位。finish 在排序完成后按原始状态恢复。
 */
export function useTemporaryDragCollapse(
  setExpanded: (keys: readonly string[], expanded: boolean) => void,
) {
  const setExpandedRef = useRef(setExpanded)
  setExpandedRef.current = setExpanded
  const dragRef = useRef<{ key: string; wasExpanded: boolean } | null>(null)
  const restoreTimer = useRef<number | null>(null)
  const [draggingKey, setDraggingKey] = useState<string | null>(null)
  // 恢复阶段单独标记，让同一节点用较长时长展开；快速连续拖拽时由 begin 清掉。
  const [restoringKey, setRestoringKey] = useState<string | null>(null)

  const begin = useCallback((key: string, wasExpanded: boolean) => {
    if (restoreTimer.current !== null) {
      window.clearTimeout(restoreTimer.current)
      restoreTimer.current = null
    }
    setRestoringKey(null)
    dragRef.current = { key, wasExpanded }
    setDraggingKey(key)
    if (wasExpanded) flushSync(() => setExpandedRef.current([key], false))
  }, [])

  const finish = useCallback(() => {
    const state = dragRef.current
    dragRef.current = null
    setDraggingKey(null)
    if (state?.wasExpanded) {
      setRestoringKey(state.key)
      setExpandedRef.current([state.key], true)
      restoreTimer.current = window.setTimeout(() => {
        restoreTimer.current = null
        setRestoringKey(null)
      }, 220)
    }
  }, [])

  // 组件在拖拽中卸载（关闭抽屉 / 刷新列表）时也不能遗留临时折叠。
  useEffect(
    () => () => {
      if (restoreTimer.current !== null) window.clearTimeout(restoreTimer.current)
      const state = dragRef.current
      dragRef.current = null
      if (state?.wasExpanded) setExpandedRef.current([state.key], true)
    },
    [],
  )

  return { begin, finish, draggingKey, restoringKey }
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
