/**
 * 设置 · 账户分组分区（资产 / 负债一级 → 账户）。
 *
 * 与收支分类一致：用 mb-set-* 列表 + dnd-kit 拖拽排序（分组可拖、账户在组内可拖），
 * 只允许竖直拖动；列表默认全部收起，展开集合由页面统一持有。
 */
import { useCallback, useMemo, useRef } from 'react'
import { ChevronDown, ChevronRight, GripVertical, Plus, Wallet } from 'lucide-react'
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
import { accountDisplayName } from '@/features/shared/accountIdentity'
import { isKeyExpanded, type ExpandedKeys } from '@/features/shared/foldState'
import { CategoryIcon } from '@/features/overview/category'
import type { Ledger } from '@/features/overview/model'
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
  accountGroupCount,
  accountGroupDisplayName,
  type AccountGroup,
  type AccountRow,
} from './model'
import type { Editor } from './EditorSheet'
import type { Mover } from './MoverSheet'
import type { ConfigOrderScope } from './useLedgerConfigController'

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
  onReorderGroupTo: (
    scope: ConfigOrderScope,
    id: string,
    overId: string,
    targetIndex: number,
  ) => void
  onReorderAccountTo: (
    scope: ConfigOrderScope,
    id: string,
    overId: string,
    targetIndex: number,
  ) => void
}

/** 分组与账户共用一个 SortableContext，靠 scope 区分一级 / 二级的兄弟集合。 */
type FlatAccountRow =
  | {
      kind: 'group'
      id: string
      group: AccountGroup
      scope: string
      siblings: readonly string[]
    }
  | {
      kind: 'account'
      id: string
      account: AccountRow
      group: AccountGroup
      scope: string
      siblings: readonly string[]
    }

function SortableAccountRow({
  account,
  group,
  scope,
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
  scope: string
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
    data: { sortScope: scope },
  })
  const name = accountDisplayName(account, ledger.accounts)
  return (
    <div className="mb-set-node">
      <div
        ref={setNodeRef}
        style={verticalDragStyle(transform, transition, isDragging)}
        className="mb-set-row is-child"
      >
        <span className="mb-set-child-space" aria-hidden="true" />
        <span className="mb-set-icon">
          <Wallet size={16} />
        </span>
        <span className="mb-set-name">{name}</span>
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
              onSelect: () => onDelete(account),
            },
          ]}
        />
        <span className="mb-set-drag" {...attributes} {...listeners}>
          <GripVertical size={14} />
        </span>
      </div>
    </div>
  )
}

function SortableGroupRow({
  group,
  groups,
  scope,
  ledger,
  open,
  dragging,
  timing,
  onCollapseSettled,
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
  scope: string
  ledger: Ledger
  open: boolean
  /** 列表正在拖拽：临时禁用折叠按钮，避免并发改写展开状态。 */
  dragging: boolean
  timing: CollapseTiming
  onCollapseSettled: () => void
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
  const draggable = !group.ungrouped
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `g:${group.id}`,
    data: { sortScope: scope },
    disabled: !draggable,
  })
  const hasAccounts = accountGroupCount(group) > 0
  return (
    <div className="mb-set-node">
      <div
        ref={setNodeRef}
        style={verticalDragStyle(transform, transition, isDragging)}
        className="mb-set-row"
      >
        {hasAccounts ? (
          <Button
            className="mb-set-fold"
            aria-label={open ? '收起账户' : '展开账户'}
            aria-expanded={open}
            disabled={dragging}
            onClick={() => onToggle()}
          >
            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </Button>
        ) : (
          <span className="mb-set-child-space" aria-hidden="true" />
        )}
        <span className="mb-set-icon">
          <CategoryIcon
            iconKey={ledger.accountCategories?.find((item) => item.id === group.id)?.iconKey}
          />
        </span>
        <span className="mb-set-name">{accountGroupDisplayName(group, groups)}</span>
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
              onSelect: () => onOpenGroup(group),
            },
            {
              key: `grp-del-${group.id}`,
              label: '删除',
              danger: true,
              confirm: !hasAccounts && draggable,
              disabled: hasAccounts || !draggable,
              onSelect: () => onDeleteGroup(group),
            },
          ]}
        />
        <span
          className="mb-set-drag"
          {...(draggable ? attributes : {})}
          {...(draggable ? listeners : {})}
        >
          <GripVertical size={14} />
        </span>
      </div>
      {hasAccounts && (
        <Collapse open={open} timing={timing} onSettled={onCollapseSettled}>
          <div className="mb-set-children">
            {group.rows.map((account) => (
            <SortableAccountRow
              key={account.id}
              account={account}
              group={group}
              scope={`acc:${group.id}`}
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
          </div>
        </Collapse>
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
  const emptyGroupCount = groups.filter((group) => accountGroupCount(group) === 0).length
  const allExpanded =
    visibleGroups.length > 0 &&
    visibleGroups.every((group) => isKeyExpanded(expandedKeys, `grp-${group.id}`))

  const canManage = (group: AccountGroup) => !group.ungrouped
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
  const { begin, finish, draggingKey, restoringKey } = useTemporaryDragCollapse(onSetGroupsExpanded)
  const remeasureRef = useRef<() => void>(() => {})
  const registerRemeasure = useCallback((remeasure: () => void) => {
    remeasureRef.current = remeasure
  }, [])
  const remeasure = useCallback(() => remeasureRef.current(), [])
  const collapseTiming = (id: string): CollapseTiming =>
    draggingKey === `grp-${id}` ? 'quick' : restoringKey === `grp-${id}` ? 'restore' : 'normal'

  // 分组与账户共用一份扁平 items：两者都是单行，一级 / 二级位移与碰撞口径完全一致。
  const flatRows = useMemo(() => {
    const result: FlatAccountRow[] = []
    const groupScope = `grp:${tab}`
    const groupIds = visibleGroups
      .filter((group) => !group.ungrouped)
      .map((group) => `g:${group.id}`)
    visibleGroups.forEach((group) => {
      result.push({
        kind: 'group',
        id: `g:${group.id}`,
        group,
        scope: groupScope,
        siblings: groupIds,
      })
      if (isKeyExpanded(expandedKeys, `grp-${group.id}`) && accountGroupCount(group) > 0) {
        const accountIds = group.rows.map((account) => `a:${account.id}`)
        group.rows.forEach((account) =>
          result.push({
            kind: 'account',
            id: `a:${account.id}`,
            account,
            group,
            scope: `acc:${group.id}`,
            siblings: accountIds,
          }),
        )
      }
    })
    return result
  }, [visibleGroups, tab, expandedKeys])

  const handleDragStart = (event: DragStartEvent) => {
    const activeMeta = flatRows.find((meta) => meta.id === String(event.active.id))
    // 只有一级分组从专用手柄拖起时才临时折叠；账户拖拽不碰展开状态。
    if (activeMeta?.kind !== 'group') return
    const key = `grp-${activeMeta.group.id}`
    begin(key, isKeyExpanded(expandedKeys, key))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    try {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const byId = new Map(flatRows.map((meta) => [meta.id, meta]))
      const activeMeta = byId.get(String(active.id))
      const overMeta = byId.get(String(over.id))
      if (!activeMeta || !overMeta || activeMeta.scope !== overMeta.scope) return
      if (
        activeMeta.kind === 'group' &&
        overMeta.kind === 'group' &&
        (activeMeta.group.ungrouped || overMeta.group.ungrouped)
      ) {
        return
      }
      const newIndex = activeMeta.siblings.indexOf(overMeta.id)
      if (newIndex < 0) return
      if (activeMeta.kind === 'group' && overMeta.kind === 'group') {
        const scope: ConfigOrderScope = { kind: 'group', type: tab }
        onReorderGroupTo(scope, activeMeta.id.slice(2), overMeta.id.slice(2), newIndex)
      } else if (activeMeta.kind === 'account' && overMeta.kind === 'account') {
        const scope: ConfigOrderScope = { kind: 'account', groupId: activeMeta.group.id }
        onReorderAccountTo(scope, activeMeta.id.slice(2), overMeta.id.slice(2), newIndex)
      }
    } finally {
      finish()
    }
  }

  return (
    <>
      <div className="mb-set-toolbar">
        <Tabs
          label="账户分组"
          value={tab}
          items={[
            { id: 'asset', label: '资产分组' },
            { id: 'liability', label: '负债分组' },
          ]}
          onChange={onTabChange}
        />
        <div className="mb-set-toolbar-actions">
          <Button
            variant="ghost" size="sm"
            disabled={emptyGroupCount === 0}
            onClick={() => onShowEmptyGroupsChange(!showEmptyGroups)}
          >
            {showEmptyGroups ? '隐藏空分组' : `显示空分组（${emptyGroupCount}）`}
          </Button>
          <Button
            variant="ghost" size="sm"
            disabled={visibleGroups.length === 0}
            onClick={() =>
              onSetGroupsExpanded(
                visibleGroups.map((group) => `grp-${group.id}`),
                !allExpanded,
              )
            }
          >
            {allExpanded ? '全部收起' : '全部展开'}
          </Button>
          <Button
            variant="primary" size="sm"
            onClick={() => {
              // 新建的分组还没有账户，先切到「显示空分组」，否则保存后会看不见。
              onShowEmptyGroupsChange(true)
              onOpenEditor({ kind: 'accountGroup', mode: 'create', type: tab })
            }}
          >
            <Plus size={15} /> 新增分组
          </Button>
          <Button
            variant="ghost" size="sm"
            onClick={() =>
              onOpenEditor({
                kind: 'account',
                mode: 'create',
                preset: tab === 'liability' ? 'credit' : 'deposit',
              })
            }
          >
            <Plus size={15} /> 新增账户
          </Button>
        </div>
      </div>

      <p className="mb-set-hint">
        分组即后端的账户分类（AccountCategory）：只有「一级分类 → 账户」两层。拖动每行左侧的手柄即可上下调整顺序；账户直接挂在所属一级下，净资产与资产构成合计不变。新增分组默认不带「现金等价 / 投资」标识；把带标识的账户移入无标识的分组会改变现金流与投资占比，保存前会提示。
      </p>

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
          items={flatRows.map((meta) => meta.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className={draggingKey ? 'mb-set-list is-dragging' : 'mb-set-list'}>
            {visibleGroups.length === 0 ? (
              <div className="mb-set-list-empty">
                <p>还没有分组</p>
                <Button
                  variant="primary"
                  onClick={() => {
                    onShowEmptyGroupsChange(true)
                    onOpenEditor({ kind: 'accountGroup', mode: 'create', type: tab })
                  }}
                >
                  <Plus size={16} /> 新增分组
                </Button>
              </div>
            ) : (
              visibleGroups.map((group) => (
                <SortableGroupRow
                  key={group.id}
                  group={group}
                  groups={groups}
                  scope={`grp:${tab}`}
                  ledger={ledger}
                  open={isKeyExpanded(expandedKeys, `grp-${group.id}`)}
                  dragging={draggingKey !== null}
                  timing={collapseTiming(group.id)}
                  onCollapseSettled={remeasure}
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
