/**
 * 设置 · 收支分类分区（收入 / 支出 / 转账两级树）。
 *
 * 行内菜单的打开态与二次确认态由页面统一持有，保证同一时间只开一个菜单；
 * 删除 / 转移 / 移动等写操作仍走页面的账本操作与抽屉。
 * 排序用 dnd-kit 拖拽（GripVertical 为手柄，同级内可拖），只允许竖直方向；
 * 列表默认全部收起。
 */
import { useCallback, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Plus, Tag } from 'lucide-react'
import {
  DndContext,
  MeasuringStrategy,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { Button } from '@/features/shared/Button'
import { Collapse, type CollapseTiming } from '@/features/shared/Collapse'
import { Tabs } from '@/features/shared/Tabs'
import { isKeyExpanded, type ExpandedKeys } from '@/features/shared/foldState'
import { CategoryIcon } from '@/features/overview/category'
import { getCategoryIconKey, type Ledger, type TxType } from '@/features/overview/model'
import {
  restrictToVerticalAxis,
  sameScopeClosestCenter,
  useTemporaryDragCollapse,
  useVerticalDragSensors,
  verticalDragStyle,
} from './drag'
import { CollapseRemeasure } from './CollapseRemeasure'
import { RowMenu } from './RowMenu'
import {
  CATEGORY_TABS,
  type CategoryRow,
  type CategoryTab,
} from './model'
import type { Editor } from './EditorSheet'
import type { Mover } from './MoverSheet'
import type { ConfigOrderScope } from './useLedgerConfigController'

interface CategoriesSectionProps {
  ledger: Ledger
  rows: CategoryRow[]
  tab: CategoryTab
  onTabChange: (tab: CategoryTab) => void
  expandedKeys: ExpandedKeys
  onToggleExpanded: (key: string) => void
  onSetGroupsExpanded: (keys: readonly string[], expanded: boolean) => void
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenEditor: (editor: Editor) => void
  onOpenMover: (mover: Mover) => void
  /** 拖拽落位：scope 定位同级列表，overId 用于本地 arrayMove，targetIndex 用于写库。 */
  onReorder: (
    scope: ConfigOrderScope,
    id: string,
    overId: string,
    targetIndex: number,
  ) => void
  onDelete: (row: CategoryRow, type: TxType) => void
}

/** 可见行的扁平元信息：一级与二级都进同一个 SortableContext，按 scope 区分兄弟组。 */
interface FlatCategoryRow {
  row: CategoryRow
  parentId?: string
  level: number
  scope: string
  siblings: readonly string[]
}

/** 单行（含递归子行）：sortable 节点只包这一行，展开的子行是平级兄弟而不是父行的一部分。 */
function CategoryRowItem({
  row,
  meta,
  type,
  ledger,
  expandedKeys,
  dragging,
  timing,
  onCollapseSettled,
  onToggleExpanded,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenEditor,
  onOpenMover,
  onDelete,
}: {
  row: CategoryRow
  meta: FlatCategoryRow
  type: TxType
  ledger: Ledger
  expandedKeys: ExpandedKeys
  /** 列表正在拖拽：临时禁用折叠按钮，避免并发改写展开状态。 */
  dragging: boolean
  timing: CollapseTiming
  onCollapseSettled: () => void
  onToggleExpanded: (key: string) => void
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenEditor: (editor: Editor) => void
  onOpenMover: (mover: Mover) => void
  onDelete: (row: CategoryRow, type: TxType) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
    data: { sortScope: meta.scope },
  })
  const open = isKeyExpanded(expandedKeys, `cat-${row.id}`)
  // 与账本回退链一致：自身 iconKey → 父级继承；没有 iconKey 时保留原 Tag 占位。
  const iconKey = getCategoryIconKey(ledger, row.id)
  return (
    <div className="mb-set-node">
      <div
        ref={setNodeRef}
        style={verticalDragStyle(transform, transition, isDragging)}
        className={meta.level > 0 ? 'mb-set-row is-child' : 'mb-set-row'}
      >
        {row.childCount > 0 ? (
          <Button
            className="mb-set-fold"
            aria-label={open ? '收起子分类' : '展开子分类'}
            aria-expanded={open}
            disabled={dragging}
            onClick={() => onToggleExpanded(`cat-${row.id}`)}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </Button>
        ) : (
          <span className="mb-set-child-space" aria-hidden="true" />
        )}
        <span className="mb-set-icon">
          {iconKey ? <CategoryIcon iconKey={iconKey} /> : <Tag size={16} />}
        </span>
        <span className="mb-set-name">{row.name}</span>
        <RowMenu
          id={`cat-${row.id}`}
          openId={menuOpen}
          onOpen={onMenuOpen}
          confirming={confirming}
          onConfirm={onConfirm}
          items={[
            ...(meta.level === 0
              ? [
                  {
                    key: `child-${row.id}`,
                    label: '新增子分类',
                    onSelect: () =>
                      onOpenEditor({ kind: 'category', mode: 'create', type, parentId: row.id }),
                  },
                ]
              : []),
            {
              key: `edit-${row.id}`,
              label: '编辑',
              onSelect: () =>
                onOpenEditor({ kind: 'category', mode: 'edit', type, categoryId: row.id }),
            },
            {
              key: `move-${row.id}`,
              label: '移动到…',
              onSelect: () =>
                onOpenMover({
                  kind: 'category',
                  id: row.id,
                  name: row.name,
                  type,
                  currentParentId:
                    ledger.categories.find((category) => category.id === row.id)?.parentId ?? null,
                }),
            },
            {
              key: `del-${row.id}`,
              label: '删除',
              danger: true,
              // 有子分类时先处理层级；仅被交易引用时打开转移弹窗，完成转移即删除。
              confirm: row.childCount === 0 && row.txCount === 0,
              disabled: row.childCount > 0,
              onSelect: () => onDelete(row, type),
            },
          ]}
        />
        <span className="mb-set-drag" {...attributes} {...listeners}>
          <GripVertical size={14} />
        </span>
      </div>
      {row.children.length > 0 && (
        <Collapse open={open} timing={timing} onSettled={onCollapseSettled}>
          <div className="mb-set-children">
            {row.children.map((child) => (
            <CategoryRowItem
              key={child.id}
              row={child}
              meta={{
                row: child,
                parentId: row.id,
                level: meta.level + 1,
                scope: `cat:${type}:${row.id}`,
                siblings: row.children.map((item) => item.id),
              }}
              type={type}
              ledger={ledger}
              expandedKeys={expandedKeys}
              dragging={dragging}
              timing={timing}
              onCollapseSettled={onCollapseSettled}
              onToggleExpanded={onToggleExpanded}
              menuOpen={menuOpen}
              onMenuOpen={onMenuOpen}
              confirming={confirming}
              onConfirm={onConfirm}
              onOpenEditor={onOpenEditor}
              onOpenMover={onOpenMover}
              onDelete={onDelete}
            />
            ))}
          </div>
        </Collapse>
      )}
    </div>
  )
}

export function CategoriesSection({
  ledger,
  rows,
  tab,
  onTabChange,
  expandedKeys,
  onToggleExpanded,
  onSetGroupsExpanded,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenEditor,
  onOpenMover,
  onReorder,
  onDelete,
}: CategoriesSectionProps) {
  const sensors = useVerticalDragSensors()
  const { begin, finish, draggingKey, restoringKey } = useTemporaryDragCollapse(onSetGroupsExpanded)
  const remeasureRef = useRef<() => void>(() => {})
  const registerRemeasure = useCallback((remeasure: () => void) => {
    remeasureRef.current = remeasure
  }, [])
  const remeasure = useCallback(() => remeasureRef.current(), [])
  const collapseTiming = (id: string): CollapseTiming =>
    draggingKey === `cat-${id}` ? 'quick' : restoringKey === `cat-${id}` ? 'restore' : 'normal'

  // 一级与二级共用一份扁平 items：两者都是 44px 的单行，位移与碰撞口径完全一致。
  const flatRows = useMemo(() => {
    const result: FlatCategoryRow[] = []
    const walk = (
      items: readonly CategoryRow[],
      parentId: string | undefined,
      level: number,
      scope: string,
    ) => {
      const siblings = items.map((item) => item.id)
      items.forEach((row) => {
        result.push({ row, parentId, level, scope, siblings })
        if (isKeyExpanded(expandedKeys, `cat-${row.id}`) && row.children.length > 0) {
          walk(row.children, row.id, level + 1, `cat:${tab}:${row.id}`)
        }
      })
    }
    walk(rows, undefined, 0, `cat:${tab}:root`)
    return result
  }, [rows, expandedKeys, tab])

  const handleDragStart = (event: DragStartEvent) => {
    const activeMeta = flatRows.find((meta) => meta.row.id === String(event.active.id))
    // 只有一级节点从专用手柄拖起时才临时折叠；二级拖拽不碰展开状态。
    if (!activeMeta || activeMeta.parentId) return
    const key = `cat-${activeMeta.row.id}`
    begin(key, isKeyExpanded(expandedKeys, key))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    try {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const activeId = String(active.id)
      const overId = String(over.id)
      const byId = new Map(flatRows.map((meta) => [meta.row.id, meta]))
      const activeMeta = byId.get(activeId)
      const overMeta = byId.get(overId)
      // 跨层级 / 跨父级的落点直接忽略，一级与二级走同一套兄弟判定。
      if (!activeMeta || !overMeta || activeMeta.scope !== overMeta.scope) return
      const newIndex = activeMeta.siblings.indexOf(overId)
      if (newIndex < 0) return
      const scope: ConfigOrderScope = activeMeta.parentId
        ? { kind: 'category', type: tab, parentId: activeMeta.parentId }
        : { kind: 'category', type: tab }
      onReorder(scope, activeId, overId, newIndex)
    } finally {
      // 先完成排序，再恢复原始展开状态；无有效落位 / 异常也一定恢复。
      finish()
    }
  }

  return (
    <>
      <div className="mb-set-toolbar">
        <Tabs
          label="收支分类"
          value={tab}
          items={CATEGORY_TABS.map((item) => ({ id: item.type, label: item.label }))}
          onChange={onTabChange}
        />
        <Button
          variant="primary" size="sm"
          onClick={() => onOpenEditor({ kind: 'category', mode: 'create', type: tab })}
        >
          <Plus size={15} />
          新增一级分类
        </Button>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={sameScopeClosestCenter}
        modifiers={[restrictToVerticalAxis]}
        // 折叠后行位变化，强制重新测量 droppable，避免沿用折叠前的缓存。
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={finish}
      >
        <CollapseRemeasure register={registerRemeasure} />
        <SortableContext
          items={flatRows.map((meta) => meta.row.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={draggingKey ? 'mb-set-list is-dragging' : 'mb-set-list'}>
            {rows.length > 0 ? (
              rows.map((row) => {
                const meta = flatRows.find((item) => item.row.id === row.id)!
                return (
                  <CategoryRowItem
                    key={row.id}
                    row={row}
                    meta={meta}
                    type={tab}
                    ledger={ledger}
                    expandedKeys={expandedKeys}
                    dragging={draggingKey !== null}
                    timing={collapseTiming(row.id)}
                    onCollapseSettled={remeasure}
                    onToggleExpanded={onToggleExpanded}
                    menuOpen={menuOpen}
                    onMenuOpen={onMenuOpen}
                    confirming={confirming}
                    onConfirm={onConfirm}
                    onOpenEditor={onOpenEditor}
                    onOpenMover={onOpenMover}
                    onDelete={onDelete}
                  />
                )
              })
            ) : (
              <div className="mb-set-list-empty">
                <Tag size={22} />
                <p>这个类型下还没有分类</p>
                <Button
                  variant="primary"
                  onClick={() => onOpenEditor({ kind: 'category', mode: 'create', type: tab })}
                >
                  <Plus size={16} /> 新增一级分类
                </Button>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}
