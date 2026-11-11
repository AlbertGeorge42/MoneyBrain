/**
 * 设置 · 账户分组分区（资产 / 负债一级 → 账户）。
 *
 * 与收支分类一致：用 mb-set-* 列表 + dnd-kit 拖拽排序（分组可拖、账户在组内可拖），
 * 只允许竖直拖动；列表默认全部收起，展开集合由页面统一持有。
 */
import { ChevronDown, ChevronRight, GripVertical, Plus } from 'lucide-react'
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { HfButton } from '@/features/shared/HfButton'
import { HfTabs } from '@/features/shared/HfTabs'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { isKeyExpanded, type ExpandedKeys } from '@/features/shared/foldState'
import { CategoryIcon } from '@/features/overview/category'
import type { Ledger } from '@/features/overview/model'
import { formatCurrency } from '@/utils/format'
import { minor } from '@domain/index'
import { restrictToVerticalAxis, useVerticalDragSensors, verticalDragStyle } from './drag'
import { RowMenu } from './RowMenu'
import {
  accountGroupBalance,
  accountGroupCount,
  accountGroupDisplayName,
  type AccountGroup,
  type AccountRow,
} from './model'
import type { Editor } from './EditorSheet'
import type { Mover } from './MoverSheet'

interface AccountsSectionProps {
  ledger: Ledger
  assetGroups: AccountGroup[]
  liabilityGroups: AccountGroup[]
  tab: 'asset' | 'liability'
  onTabChange: (tab: 'asset' | 'liability') => void
  showEmptyGroups: boolean
  onShowEmptyGroupsChange: (next: boolean) => void
  expandedKeys: ExpandedKeys
  onToggleExpanded: (key: string) => void
  onSetGroupsExpanded: (keys: readonly string[], expanded: boolean) => void
  onOpenEditor: (editor: Editor) => void
  onOpenMover: (mover: Mover) => void
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onDeleteAccount: (account: AccountRow) => void
  onDeleteGroup: (group: AccountGroup) => void
  onReorderGroupTo: (id: string, targetIndex: number) => void
  onReorderAccountTo: (id: string, targetIndex: number) => void
}

function SortableAccountRow({
  account,
  group,
  ledger,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenAccount,
  onOpenMover,
  onDelete,
}: {
  account: AccountRow
  group: AccountGroup
  ledger: Ledger
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenAccount: (account: AccountRow, group: AccountGroup) => void
  onOpenMover: (mover: Mover) => void
  onDelete: (account: AccountRow) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `a:${account.id}`,
  })
  const name = accountDisplayName(account, ledger.accounts)
  return (
    <div ref={setNodeRef} style={verticalDragStyle(transform, transition, isDragging)}>
      <div className="mb-set-row is-child">
        <span className="mb-set-child-space" aria-hidden="true" />
        <span className="mb-set-drag" {...attributes} {...listeners}>
          <GripVertical size={14} />
        </span>
        <span className="mb-set-name">{name}</span>
        <span className="mb-set-meta">{account.txCount} 笔</span>
        <span className="mb-set-amount">{formatCurrency(minor(account.balance))}</span>
        {/* 行内操作统一走 RowMenu：与收支分类同一套交互与二次确认。 */}
        <RowMenu
          id={`acc-${account.id}`}
          openId={menuOpen}
          onOpen={onMenuOpen}
          confirming={confirming}
          onConfirm={onConfirm}
          items={[
            {
              key: `acc-edit-${account.id}`,
              label: '编辑',
              onSelect: () => onOpenAccount(account, group),
            },
            {
              key: `acc-move-${account.id}`,
              label: '移动到…',
              onSelect: () =>
                onOpenMover({
                  kind: 'account',
                  id: account.id,
                  name,
                  current: group.ungrouped ? null : group.id,
                  type: group.type,
                }),
            },
            {
              key: `acc-del-${account.id}`,
              label: '删除',
              danger: true,
              confirm: account.txCount === 0,
              disabled: account.txCount > 0,
              hint: '有流水，先把流水移到别的账户',
              onSelect: () => onDelete(account),
            },
          ]}
        />
      </div>
    </div>
  )
}

function SortableGroupRow({
  group,
  groups,
  ledger,
  open,
  onToggle,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenGroup,
  onOpenAccount,
  onOpenMover,
  onDeleteGroup,
  onDeleteAccount,
}: {
  group: AccountGroup
  groups: readonly AccountGroup[]
  ledger: Ledger
  open: boolean
  onToggle: () => void
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenGroup: (group: AccountGroup) => void
  onOpenAccount: (account: AccountRow, group: AccountGroup) => void
  onOpenMover: (mover: Mover) => void
  onDeleteGroup: (group: AccountGroup) => void
  onDeleteAccount: (account: AccountRow) => void
}) {
  const draggable = !group.ungrouped && !group.seeded
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g:${group.id}`,
    disabled: !draggable,
  })
  const hasAccounts = accountGroupCount(group) > 0
  return (
    <div ref={setNodeRef} style={verticalDragStyle(transform, transition, isDragging)}>
      <div className="mb-set-row">
        {hasAccounts ? (
          <HfButton
            className="mb-set-fold"
            aria-label={open ? '收起账户' : '展开账户'}
            aria-expanded={open}
            onClick={() => onToggle()}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </HfButton>
        ) : (
          <span className="mb-set-child-space" aria-hidden="true" />
        )}
        <span
          className="mb-set-drag"
          {...(draggable ? attributes : {})}
          {...(draggable ? listeners : {})}
        >
          <GripVertical size={14} />
        </span>
        <span className="mb-set-icon">
          <CategoryIcon
            rootId={group.id}
            iconKey={ledger.accountCategories?.find((item) => item.id === group.id)?.iconKey}
          />
        </span>
        <span className="mb-set-name">{accountGroupDisplayName(group, groups)}</span>
        <span className="mb-set-meta">{accountGroupCount(group)} 个账户</span>
        <span className="mb-set-amount">{formatCurrency(minor(accountGroupBalance(group)))}</span>
        {/* 分组操作同样走 RowMenu：与收支分类一致，不再整行点击进编辑器。 */}
        <RowMenu
          id={`grp-${group.id}`}
          openId={menuOpen}
          onOpen={onMenuOpen}
          confirming={confirming}
          onConfirm={onConfirm}
          items={[
            {
              key: `grp-edit-${group.id}`,
              label: '编辑',
              disabled: !draggable,
              hint: '默认归类与演示分组只读',
              onSelect: () => onOpenGroup(group),
            },
            {
              key: `grp-del-${group.id}`,
              label: '删除',
              danger: true,
              confirm: !hasAccounts && draggable,
              disabled: hasAccounts || !draggable,
              hint: hasAccounts ? '先把账户移到其他分组' : '默认归类与演示分组只读',
              onSelect: () => onDeleteGroup(group),
            },
          ]}
        />
      </div>
      {open && hasAccounts && (
        <SortableContext
          items={group.rows.map((account) => `a:${account.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {group.rows.map((account) => (
            <SortableAccountRow
              key={account.id}
              account={account}
              group={group}
              ledger={ledger}
              menuOpen={menuOpen}
              onMenuOpen={onMenuOpen}
              confirming={confirming}
              onConfirm={onConfirm}
              onOpenAccount={onOpenAccount}
              onOpenMover={onOpenMover}
              onDelete={onDeleteAccount}
            />
          ))}
        </SortableContext>
      )}
    </div>
  )
}

export function AccountsSection({
  ledger,
  assetGroups,
  liabilityGroups,
  tab,
  onTabChange,
  showEmptyGroups,
  onShowEmptyGroupsChange,
  expandedKeys,
  onToggleExpanded,
  onSetGroupsExpanded,
  onOpenEditor,
  onOpenMover,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onDeleteAccount,
  onDeleteGroup,
  onReorderGroupTo,
  onReorderAccountTo,
}: AccountsSectionProps) {
  const groups = tab === 'asset' ? assetGroups : liabilityGroups
  const visibleGroups = showEmptyGroups
    ? groups
    : groups.filter((group) => accountGroupCount(group) > 0)
  const realGroups = visibleGroups.filter((group) => !group.ungrouped && !group.seeded)
  const emptyGroupCount = groups.filter((group) => accountGroupCount(group) === 0).length
  const allExpanded =
    visibleGroups.length > 0 &&
    visibleGroups.every((group) => isKeyExpanded(expandedKeys, `grp-${group.id}`))

  const canManage = (group: AccountGroup) => !group.ungrouped && !group.seeded
  const openGroup = (group: AccountGroup) => {
    if (!canManage(group)) return
    const source = (ledger.accountCategories ?? []).find((item) => item.id === group.id)
    if (!source) return
    onOpenEditor({ kind: 'accountGroup', mode: 'edit', type: group.type, groupId: group.id })
  }
  const openAccount = (account: AccountRow, group: AccountGroup) => {
    const current = ledger.accounts.find((item) => item.id === account.id)
    onOpenEditor({
      kind: 'account',
      mode: 'edit',
      accountId: account.id,
      preset: current?.kind ?? 'deposit',
      groupId: group.ungrouped ? undefined : group.id,
    })
  }

  const sensors = useVerticalDragSensors()

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const activeIsGroup = activeId.startsWith('g:')
    const overIsGroup = overId.startsWith('g:')
    if (activeIsGroup !== overIsGroup) return
    if (activeIsGroup) {
      const aReal = activeId.slice(2)
      const oReal = overId.slice(2)
      const oldIndex = realGroups.findIndex((group) => group.id === aReal)
      const newIndex = realGroups.findIndex((group) => group.id === oReal)
      if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) {
        onReorderGroupTo(aReal, newIndex)
      }
      return
    }
    const aReal = activeId.slice(2)
    const oReal = overId.slice(2)
    for (const group of visibleGroups) {
      const accIds = group.rows.map((account) => account.id)
      if (accIds.includes(aReal) && accIds.includes(oReal)) {
        const newIndex = group.rows.findIndex((account) => account.id === oReal)
        if (newIndex >= 0) onReorderAccountTo(aReal, newIndex)
        return
      }
    }
  }

  return (
    <>
      <div className="mb-set-toolbar">
        <HfTabs
          variant="settings"
          label="账户分组"
          value={tab}
          items={[
            { id: 'asset', label: '资产分组' },
            { id: 'liability', label: '负债分组' },
          ]}
          onChange={onTabChange}
        />
        <div className="mb-set-toolbar-actions">
          <HfButton
            className="mb-set-btn is-ghost is-small"
            disabled={emptyGroupCount === 0}
            onClick={() => onShowEmptyGroupsChange(!showEmptyGroups)}
          >
            {showEmptyGroups ? '隐藏空分组' : `显示空分组（${emptyGroupCount}）`}
          </HfButton>
          <HfButton
            className="mb-set-btn is-ghost is-small"
            disabled={visibleGroups.length === 0}
            onClick={() =>
              onSetGroupsExpanded(
                visibleGroups.map((group) => `grp-${group.id}`),
                !allExpanded,
              )
            }
          >
            {allExpanded ? '全部收起' : '全部展开'}
          </HfButton>
          <HfButton
            className="mb-set-btn is-primary is-small"
            onClick={() => {
              // 新建的分组还没有账户，先切到「显示空分组」，否则保存后会看不见。
              onShowEmptyGroupsChange(true)
              onOpenEditor({ kind: 'accountGroup', mode: 'create', type: tab })
            }}
          >
            <Plus size={15} /> 新增分组
          </HfButton>
          <HfButton
            className="mb-set-btn is-ghost is-small"
            onClick={() =>
              onOpenEditor({
                kind: 'account',
                mode: 'create',
                preset: tab === 'liability' ? 'credit' : 'deposit',
              })
            }
          >
            <Plus size={15} /> 新增账户
          </HfButton>
        </div>
      </div>

      <p className="mb-set-hint">
        分组即后端的账户分类（AccountCategory）：只有「一级分类 → 账户」两层。拖动每行左侧的手柄即可上下调整顺序；账户直接挂在所属一级下，净资产与资产构成合计不变。新增分组默认不带「现金等价 / 投资」标识；把带标识的账户移入无标识的分组会改变现金流与投资占比，保存前会提示。
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={realGroups.map((group) => `g:${group.id}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="mb-set-list">
            {visibleGroups.length === 0 ? (
              <div className="mb-set-list-empty">
                <p>还没有分组</p>
                <HfButton
                  className="mb-set-btn is-primary"
                  onClick={() => {
                    onShowEmptyGroupsChange(true)
                    onOpenEditor({ kind: 'accountGroup', mode: 'create', type: tab })
                  }}
                >
                  <Plus size={16} /> 新增分组
                </HfButton>
              </div>
            ) : (
              visibleGroups.map((group) => (
                <SortableGroupRow
                  key={group.id}
                  group={group}
                  groups={groups}
                  ledger={ledger}
                  open={isKeyExpanded(expandedKeys, `grp-${group.id}`)}
                  onToggle={() => onToggleExpanded(`grp-${group.id}`)}
                  menuOpen={menuOpen}
                  onMenuOpen={onMenuOpen}
                  confirming={confirming}
                  onConfirm={onConfirm}
                  onOpenGroup={openGroup}
                  onOpenAccount={openAccount}
                  onOpenMover={onOpenMover}
                  onDeleteGroup={onDeleteGroup}
                  onDeleteAccount={onDeleteAccount}
                />
              ))
            )}
          </div>
        </SortableContext>
      </DndContext>
    </>
  )
}
