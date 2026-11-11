/**
 * 设置 · 收支分类分区（收入 / 支出 / 转账两级树）。
 *
 * 行内菜单的打开态与二次确认态由页面统一持有，保证同一时间只开一个菜单；
 * 删除 / 转移 / 移动等写操作仍走页面的账本操作与抽屉。
 * 排序用 dnd-kit 拖拽（GripVertical 为手柄，同级内可拖），只允许竖直方向；
 * 列表默认全部收起。
 */
import { ChevronDown, ChevronRight, GripVertical, Plus, Tag } from 'lucide-react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { HfButton } from '@/features/shared/HfButton'
import { HfTabs } from '@/features/shared/HfTabs'
import { isKeyExpanded, type ExpandedKeys } from '@/features/shared/foldState'
import { CategoryIcon } from '@/features/overview/category'
import { getCategoryIconKey, getCategoryRootId, type Ledger, type TxType } from '@/features/overview/model'
import { restrictToVerticalAxis, useVerticalDragSensors, verticalDragStyle } from './drag'
import { RowMenu } from './RowMenu'
import {
  CATEGORY_TABS,
  type CategoryRow,
  type CategoryTab,
} from './model'
import type { Editor } from './EditorSheet'
import type { Mover } from './MoverSheet'

interface CategoriesSectionProps {
  ledger: Ledger
  rows: CategoryRow[]
  tab: CategoryTab
  onTabChange: (tab: CategoryTab) => void
  expandedKeys: ExpandedKeys
  onToggleExpanded: (key: string) => void
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenEditor: (editor: Editor) => void
  onOpenMover: (mover: Mover) => void
  /** 拖拽落位：把 id 移到同级兄弟的第 targetIndex 位。 */
  onReorder: (id: string, targetIndex: number) => void
  onDelete: (row: CategoryRow, type: TxType) => void
}

/** 单行（含递归子行）：自身是 sortable 项，展开的子行包进嵌套 SortableContext。 */
function CategoryRowItem({
  row,
  type,
  level,
  ledger,
  expandedKeys,
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
  type: TxType
  level: number
  ledger: Ledger
  expandedKeys: ExpandedKeys
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
  })
  const open = isKeyExpanded(expandedKeys, `cat-${row.id}`)
  // 与账本回退链一致：自身 iconKey → 父级继承；没有 iconKey 时保留原 Tag 占位。
  const iconKey = getCategoryIconKey(ledger, row.id)
  const rootId = getCategoryRootId(ledger, row.id)
  return (
    <div ref={setNodeRef} style={verticalDragStyle(transform, transition, isDragging)}>
      <div className={level > 0 ? 'mb-set-row is-child' : 'mb-set-row'}>
        {row.childCount > 0 ? (
          <HfButton
            className="mb-set-fold"
            aria-label={open ? '收起子分类' : '展开子分类'}
            aria-expanded={open}
            onClick={() => onToggleExpanded(`cat-${row.id}`)}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </HfButton>
        ) : (
          <span className="mb-set-child-space" aria-hidden="true" />
        )}
        <span className="mb-set-drag" {...attributes} {...listeners}>
          <GripVertical size={14} />
        </span>
        <span className="mb-set-icon">
          {iconKey ? <CategoryIcon rootId={rootId} iconKey={iconKey} /> : <Tag size={16} />}
        </span>
        <span className="mb-set-name">{row.name}</span>
        <span className="mb-set-meta">
          {row.txCount} 笔{row.childCount > 0 ? ` · ${row.childCount} 个子分类` : ''}
        </span>
        <RowMenu
          id={`cat-${row.id}`}
          openId={menuOpen}
          onOpen={onMenuOpen}
          confirming={confirming}
          onConfirm={onConfirm}
          items={[
            ...(level === 0
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
              hint: row.childCount > 0 ? '有子分类，先处理子分类' : undefined,
              onSelect: () => onDelete(row, type),
            },
          ]}
        />
      </div>
      {open && row.children.length > 0 && (
        <SortableContext
          items={row.children.map((child) => child.id)}
          strategy={verticalListSortingStrategy}
        >
          {row.children.map((child) => (
            <CategoryRowItem
              key={child.id}
              row={child}
              type={type}
              level={level + 1}
              ledger={ledger}
              expandedKeys={expandedKeys}
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
        </SortableContext>
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

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)
    // 顶层行：直接在 rows 内重排。
    const topIndex = rows.findIndex((row) => row.id === activeId)
    if (topIndex >= 0) {
      const newIndex = rows.findIndex((row) => row.id === overId)
      if (newIndex >= 0) onReorder(activeId, newIndex)
      return
    }
    // 子分类：找到共同父级，在父级 children 内重排。
    for (const parent of rows) {
      const childIds = parent.children.map((child) => child.id)
      if (childIds.includes(activeId) && childIds.includes(overId)) {
        const newIndex = parent.children.findIndex((child) => child.id === overId)
        if (newIndex >= 0) onReorder(activeId, newIndex)
        return
      }
    }
  }

  return (
    <>
      <div className="mb-set-toolbar">
        <HfTabs
          variant="settings"
          label="收支分类"
          value={tab}
          items={CATEGORY_TABS.map((item) => ({ id: item.type, label: item.label }))}
          onChange={onTabChange}
        />
        <HfButton
          className="mb-set-btn is-primary is-small"
          onClick={() => onOpenEditor({ kind: 'category', mode: 'create', type: tab })}
        >
          <Plus size={15} />
          新增一级分类
        </HfButton>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
          <div className="mb-set-list">
            {rows.length > 0 ? (
              rows.map((row) => (
                <CategoryRowItem
                  key={row.id}
                  row={row}
                  type={tab}
                  level={0}
                  ledger={ledger}
                  expandedKeys={expandedKeys}
                  onToggleExpanded={onToggleExpanded}
                  menuOpen={menuOpen}
                  onMenuOpen={onMenuOpen}
                  confirming={confirming}
                  onConfirm={onConfirm}
                  onOpenEditor={onOpenEditor}
                  onOpenMover={onOpenMover}
                  onDelete={onDelete}
                />
              ))
            ) : (
              <div className="mb-set-list-empty">
                <Tag size={22} />
                <p>这个类型下还没有分类</p>
                <HfButton
                  className="mb-set-btn is-primary"
                  onClick={() => onOpenEditor({ kind: 'category', mode: 'create', type: tab })}
                >
                  <Plus size={16} /> 新增一级分类
                </HfButton>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}
