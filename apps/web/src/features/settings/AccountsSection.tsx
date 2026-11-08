/**
 * 设置 · 账户分类分区（资产 / 负债一级 → 账户）。
 *
 * 只渲染与局部展开状态；新增 / 编辑 / 对账仍由页面的编辑器与账本操作承担。
 * 展开集合由页面统一持有，切换分区后保持原展开状态（与原实现一致）。
 */
import { Plus } from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfTabs } from '@/features/shared/HfTabs'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import type { DeviceMode } from '@/features/shared/types'
import { CategoryIcon } from '@/features/overview/category'
import type { Ledger } from '@/features/overview/model'
import { formatCurrency } from '@/utils/format'
import { minor } from '@domain/index'
import { ReportCardList, ReportTable, type CardRow, type ReportRow } from '@/features/reports/ReportTable'
import { ReconcileButton } from './ReconcileSheet'
import {
  accountGroupBalance,
  accountGroupCount,
  accountGroupDisplayName,
  type AccountGroup,
  type AccountRow,
} from './settingsModel'
import type { Editor } from './EditorSheet'

interface AccountsSectionProps {
  device: DeviceMode
  ledger: Ledger
  assetGroups: AccountGroup[]
  liabilityGroups: AccountGroup[]
  tab: 'asset' | 'liability'
  onTabChange: (tab: 'asset' | 'liability') => void
  showEmptyGroups: boolean
  onShowEmptyGroupsChange: (next: boolean) => void
  collapsed: ReadonlySet<string>
  onToggleCollapsed: (key: string) => void
  onSetGroupsCollapsed: (keys: readonly string[], collapse: boolean) => void
  onOpenEditor: (editor: Editor) => void
  onRetry: () => void
}

export function AccountsSection({
  device,
  ledger,
  assetGroups,
  liabilityGroups,
  tab,
  onTabChange,
  showEmptyGroups,
  onShowEmptyGroupsChange,
  collapsed,
  onToggleCollapsed,
  onSetGroupsCollapsed,
  onOpenEditor,
  onRetry,
}: AccountsSectionProps) {
  const groups = tab === 'asset' ? assetGroups : liabilityGroups
  const emptyGroupCount = groups.filter((group) => accountGroupCount(group) === 0).length
  const visibleGroups = showEmptyGroups
    ? groups
    : groups.filter((group) => accountGroupCount(group) > 0)
  const allCollapsed =
    visibleGroups.length > 0 && visibleGroups.every((group) => collapsed.has(`grp-${group.id}`))
  const groupLabel = (group: AccountGroup) => (
    <span className="mb-set-name-inline">
      <CategoryIcon
        rootId={group.id}
        iconKey={ledger.accountCategories?.find((item) => item.id === group.id)?.iconKey}
      />
      <span className="mb-set-name-inline-text">{accountGroupDisplayName(group, groups)}</span>
    </span>
  )
  const subtotal = (group: AccountGroup) => formatCurrency(minor(accountGroupBalance(group)))
  const accountLabel = (account: AccountRow) => accountDisplayName(account, ledger.accounts)
  const expandedOf = (group: AccountGroup) => !collapsed.has(`grp-${group.id}`)
  const toggleGroup = (group: AccountGroup) => onToggleCollapsed(`grp-${group.id}`)
  const foldKeysOf = (group: AccountGroup) => [`grp-${group.id}`]
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
  const totalBalance = groups.reduce((sum, group) => sum + accountGroupBalance(group), 0)
  const totalAccounts = groups.reduce((sum, group) => sum + accountGroupCount(group), 0)
  const emptyHint =
    groups.length === 0
      ? '还没有分组'
      : emptyGroupCount > 0 && !showEmptyGroups
        ? `已隐藏 ${emptyGroupCount} 个空分组（点「显示空分组」可管理）`
        : undefined

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
              onSetGroupsCollapsed(
                visibleGroups.flatMap(foldKeysOf),
                !allCollapsed,
              )
            }
          >
            {allCollapsed ? '全部展开' : '全部收起'}
          </HfButton>
          <HfButton
            className="mb-set-btn is-primary is-small"
            onClick={() => {
              // 新建的分组还没有账户，先切到「显示空分组」，否则保存后会看不见。
              onShowEmptyGroupsChange(true)
              onOpenEditor({ kind: 'accountGroup', mode: 'create', type: tab })
            }}
          >
            <Plus size={15} /> 新建分组
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
        分组即后端的账户分类（AccountCategory）：只有「一级分类 → 账户」两层，账户直接挂在所属一级下。净资产与资产构成合计不变，但资产构成按分类名分行，分组名会出现在表里。新建分组默认不带「现金等价 / 投资」标识；把带标识的账户移入无标识的分组会改变现金流与投资占比，保存前会提示。默认全部展开，点分组行可改名/排序/删除，点账户行可编辑或移动。
      </p>

      {device === 'desktop' ? (
        <ReportTable
          device={device}
          title={tab === 'asset' ? '资产账户分组' : '负债账户分组'}
          desc={`共 ${totalAccounts} 个账户；${allCollapsed ? '当前全部收起' : '默认全部展开'}`}
          ariaLabel="账户分组表"
          variant="c3"
          columns={[
            { label: '分组 / 账户' },
            { label: '余额', align: 'num' },
            { label: '账户数', align: 'num' },
          ]}
          rows={visibleGroups.flatMap((group) => {
            const groupRow: ReportRow = {
              id: `grp-${group.id}`,
              cells: [groupLabel(group), subtotal(group), `${accountGroupCount(group)} 个`],
              fold: { expanded: expandedOf(group), onToggle: () => toggleGroup(group) },
              onOpen: canManage(group) ? () => openGroup(group) : undefined,
              hint: group.ungrouped ? '默认归类' : group.seeded ? '演示只读' : undefined,
            }
            if (!expandedOf(group)) return [groupRow]
            const accountRows: ReportRow[] = group.rows.map((account) => ({
              id: `acc-${account.id}`,
              level: 1 as const,
              cells: [
                accountLabel(account),
                formatCurrency(minor(account.balance)),
                group.seeded ? '' : (
                  <ReconcileButton
                    account={{ id: account.id, name: accountLabel(account), balance: account.balance }}
                    device="desktop"
                    onDone={onRetry}
                  />
                ),
              ],
              onOpen: () => openAccount(account, group),
            }))
            return [groupRow, ...accountRows]
          })}
          total={['合计', formatCurrency(minor(totalBalance)), `${totalAccounts} 个`]}
          note={emptyHint ? `${emptyHint}，点右上角「新建分组」开始。` : undefined}
        />
      ) : (
        <ReportCardList
          device={device}
          title={tab === 'asset' ? '资产账户分组' : '负债账户分组'}
          desc={`共 ${totalAccounts} 个账户；${allCollapsed ? '当前全部收起' : '默认全部展开'}`}
          rows={visibleGroups.flatMap((group) => {
            const groupRow: CardRow = {
              id: `grp-${group.id}`,
              label: groupLabel(group),
              meta: `${accountGroupCount(group)} 个账户`,
              hint: group.ungrouped ? '默认归类' : group.seeded ? '演示只读' : undefined,
              amount: subtotal(group),
              fold: { expanded: expandedOf(group), onToggle: () => toggleGroup(group) },
              onOpen: canManage(group) ? () => openGroup(group) : undefined,
            }
            if (!expandedOf(group)) return [groupRow]
            const accountRows: CardRow[] = group.rows.map((account) => ({
              id: `acc-${account.id}`,
              level: 1 as const,
              label: accountLabel(account),
              meta: `${account.txCount} 笔`,
              amount: formatCurrency(minor(account.balance)),
              onOpen: () => openAccount(account, group),
              action: group.seeded ? undefined : (
                <ReconcileButton
                  account={{ id: account.id, name: accountLabel(account), balance: account.balance }}
                  device="mobile"
                  onDone={onRetry}
                />
              ),
            }))
            return [groupRow, ...accountRows]
          })}
          total={{ label: '合计', value: formatCurrency(minor(totalBalance)) }}
          emptyText={emptyHint ?? '还没有分组'}
        />
      )}
    </>
  )
}
