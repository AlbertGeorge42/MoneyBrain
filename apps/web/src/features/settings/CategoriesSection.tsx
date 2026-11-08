/**
 * 设置 · 收支分类分区（收入 / 支出 / 转账两级树）。
 *
 * 行内菜单的打开态与二次确认态由页面统一持有，保证同一时间只开一个菜单；
 * 删除 / 转移 / 移动等写操作仍走页面的账本操作与抽屉。
 */
import { ChevronDown, ChevronRight, GripVertical, Plus, Tag } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfTabs } from '@/features/shared/HfTabs'
import { CategoryIcon } from '@/features/overview/category'
import { getCategoryIconKey, getCategoryRootId, type Ledger, type TxType } from '@/features/overview/model'
import { RowMenu } from './RowMenu'
import {
  CATEGORY_TABS,
  categorySiblings,
  type CategoryRow,
  type CategoryTab,
} from './settingsModel'
import type { Editor } from './EditorSheet'
import type { Mover } from './MoverSheet'

interface CategoriesSectionProps {
  ledger: Ledger
  rows: CategoryRow[]
  tab: CategoryTab
  onTabChange: (tab: CategoryTab) => void
  collapsed: ReadonlySet<string>
  onToggleCollapsed: (key: string) => void
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenEditor: (editor: Editor) => void
  onOpenMover: (mover: Mover) => void
  onReorder: (id: string, direction: 'up' | 'down') => void
  onDelete: (row: CategoryRow, type: TxType) => void
}

export function CategoriesSection({
  ledger,
  rows,
  tab,
  onTabChange,
  collapsed,
  onToggleCollapsed,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenEditor,
  onOpenMover,
  onReorder,
  onDelete,
}: CategoriesSectionProps) {
  const renderRow = (row: CategoryRow, type: TxType, level: number) => {
    const expandedRow = !collapsed.has(`cat-${row.id}`)
    const siblings = categorySiblings(ledger, row.id)
    const index = siblings.findIndex((category) => category.id === row.id)
    // 与账本回退链一致：自身 iconKey → 父级继承；没有 iconKey 时保留原 Tag 占位。
    const iconKey = getCategoryIconKey(ledger, row.id)
    const rootId = getCategoryRootId(ledger, row.id)
    return (
      <div key={row.id} className={level > 0 ? 'mb-set-group is-child' : 'mb-set-group'}>
        <div className={level > 0 ? 'mb-set-row is-child' : 'mb-set-row'}>
          {row.childCount > 0 ? (
            <HfButton
              className="mb-set-fold"
              aria-label={expandedRow ? '收起子分类' : '展开子分类'}
              aria-expanded={expandedRow}
              onClick={() => onToggleCollapsed(`cat-${row.id}`)}
            >
              {expandedRow ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </HfButton>
          ) : (
            <span className="mb-set-child-space" aria-hidden="true" />
          )}
          <span className="mb-set-drag" aria-hidden="true">
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
                key: `up-${row.id}`,
                label: '上移',
                disabled: index <= 0,
                onSelect: () => onReorder(row.id, 'up'),
              },
              {
                key: `down-${row.id}`,
                label: '下移',
                disabled: index < 0 || index >= siblings.length - 1,
                onSelect: () => onReorder(row.id, 'down'),
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
        {expandedRow && row.children.map((child) => renderRow(child, type, level + 1))}
      </div>
    )
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
          className="mb-set-add"
          onClick={() => onOpenEditor({ kind: 'category', mode: 'create', type: tab })}
        >
          <Plus size={16} />
          新增一级
        </HfButton>
      </div>
      <div className="mb-set-list">
        {rows.length > 0 ? (
          rows.map((row) => renderRow(row, tab, 0))
        ) : (
          <div className="mb-set-list-empty">
            <Tag size={22} />
            <p>这个类型下还没有分类</p>
            <HfButton
              className="mb-set-btn is-primary"
              onClick={() => onOpenEditor({ kind: 'category', mode: 'create', type: tab })}
            >
              新增一级分类
            </HfButton>
          </div>
        )}
      </div>
    </>
  )
}
