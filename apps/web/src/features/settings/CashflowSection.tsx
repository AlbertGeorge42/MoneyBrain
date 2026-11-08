/**
 * 设置 · 现金流分类分区。
 *
 * 资产 Tab 按账户性质标记分组，收入 / 支出 / 转账 Tab 按活动归组；
 * 空组默认折叠且不渲染占位行（与原实现一致）。归组只影响浏览，不改账本合计。
 */
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  GripVertical,
  Landmark,
  Tag,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { HfButton } from '@/features/shared/HfButton'
import { HfTabs } from '@/features/shared/HfTabs'
import { accountDisplayName } from '@/features/shared/accountIdentity'
import type { AccountKind, Ledger } from '@/features/overview/model'
import { formatCurrency } from '@/utils/format'
import { minor } from '@domain/index'
import { RowMenu } from '@/features/ledger-config/RowMenu'
import {
  ACTIVITY_GROUPS,
  ASSET_MARK_GROUPS,
  defaultActivity,
  type ActivityGroupId,
  type CategoryRow,
} from '@/features/ledger-config/model'
import type { Mover } from '@/features/ledger-config/MoverSheet'

export type CashflowTab = 'asset' | 'income' | 'expense' | 'transfer'

const ACCOUNT_ICONS: Record<AccountKind, LucideIcon> = {
  deposit: Landmark,
  cash: Wallet,
  investment: TrendingUp,
  credit: CreditCard,
}

const CASHFLOW_TABS: readonly { id: CashflowTab; label: string }[] = [
  { id: 'asset', label: '资产分类' },
  { id: 'income', label: '收入分类' },
  { id: 'expense', label: '支出分类' },
  { id: 'transfer', label: '转账分类' },
]

interface CashflowSectionProps {
  ledger: Ledger
  rows: CategoryRow[]
  tab: CashflowTab
  onTabChange: (tab: CashflowTab) => void
  activity: Record<string, ActivityGroupId>
  collapsed: ReadonlySet<string>
  onToggleCollapsed: (key: string) => void
  menuOpen: string | null
  onMenuOpen: (next: string | null) => void
  confirming: string | null
  onConfirm: (key: string) => void
  onOpenMover: (mover: Mover) => void
}

export function CashflowSection({
  ledger,
  rows,
  tab,
  onTabChange,
  activity,
  collapsed,
  onToggleCollapsed,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenMover,
}: CashflowSectionProps) {
  const activityOf = (categoryId: string): ActivityGroupId => {
    if (activity[categoryId]) return activity[categoryId]
    const category = ledger.categories.find((item) => item.id === categoryId)
    return category ? defaultActivity(category) : 'operating'
  }

  if (tab === 'asset') {
    return (
      <>
        <div className="mb-set-toolbar">
          <HfTabs
            variant="settings"
            label="现金流分类"
            value={tab}
            items={CASHFLOW_TABS}
            onChange={onTabChange}
          />
        </div>
        <div className="mb-set-list">
          {ASSET_MARK_GROUPS.map((group) => {
            const groupRows = ledger.accounts.filter((account) => group.kinds.includes(account.kind))
            const groupKey = `cf-asset-${group.id}`
            const empty = groupRows.length === 0
            // 空组默认折叠，不再渲染「没有账户」占位行，避免像还没加载完。
            const open = !empty && !collapsed.has(groupKey)
            return (
              <div key={group.id} className="mb-set-group">
                <div className="mb-set-row is-group">
                  <HfButton
                    className="mb-set-fold"
                    aria-label={empty ? '本组无分类' : open ? '收起分类' : '展开分类'}
                    aria-expanded={open}
                    disabled={empty}
                    onClick={() => onToggleCollapsed(groupKey)}
                  >
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </HfButton>
                  <span className="mb-set-drag" aria-hidden="true">
                    <GripVertical size={14} />
                  </span>
                  <span className="mb-set-name">{group.label}</span>
                  <span className="mb-set-meta">({groupRows.length} 个分类)</span>
                </div>
                {open &&
                  groupRows.map((account) => {
                    const Icon = ACCOUNT_ICONS[account.kind]
                    return (
                      <div key={account.id} className="mb-set-row is-child">
                        <span className="mb-set-child-space" aria-hidden="true" />
                        <span className="mb-set-drag" aria-hidden="true">
                          <GripVertical size={14} />
                        </span>
                        <span className="mb-set-icon">
                          <Icon size={16} />
                        </span>
                        <span className="mb-set-name">
                          {accountDisplayName(account, ledger.accounts)}
                        </span>
                        <span className="mb-set-meta">
                          {formatCurrency(minor(account.balance))}
                        </span>
                        <RowMenu
                          id={`cf-${account.id}`}
                          openId={menuOpen}
                          onOpen={onMenuOpen}
                          confirming={confirming}
                          onConfirm={onConfirm}
                          items={[
                            {
                              key: `cf-move-${account.id}`,
                              label: '移动到…',
                              onSelect: () =>
                                onOpenMover({
                                  kind: 'account',
                                  id: account.id,
                                  name: account.name,
                                  current: account.categoryId ?? null,
                                  type: account.kind === 'credit' ? 'liability' : 'asset',
                                }),
                            },
                          ]}
                        />
                      </div>
                    )
                  })}
              </div>
            )
          })}
        </div>
      </>
    )
  }

  const type = tab
  const flat = rows.map((row) => ({ row, group: activityOf(row.id) }))
  return (
    <>
      <div className="mb-set-toolbar">
        <HfTabs
          variant="settings"
          label="现金流分类"
          value={tab}
          items={CASHFLOW_TABS}
          onChange={onTabChange}
        />
      </div>
      <div className="mb-set-list">
        {ACTIVITY_GROUPS.map((group) => {
          const groupRows = flat.filter((item) => item.group === group.id)
          const groupKey = `cf-${type}-${group.id}`
          const empty = groupRows.length === 0
          // 空组默认折叠，不再渲染「未分配」占位行，避免像还没加载完。
          const open = !empty && !collapsed.has(groupKey)
          return (
            <div key={group.id} className="mb-set-group">
              <div className="mb-set-row is-group">
                <HfButton
                  className="mb-set-fold"
                  aria-label={empty ? '本组无分类' : open ? '收起分类' : '展开分类'}
                  aria-expanded={open}
                  disabled={empty}
                  onClick={() => onToggleCollapsed(groupKey)}
                >
                  {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </HfButton>
                <span className="mb-set-drag" aria-hidden="true">
                  <GripVertical size={14} />
                </span>
                <span className="mb-set-name">{group.label}</span>
                <span className="mb-set-meta">({groupRows.length} 个分类)</span>
              </div>
              {open &&
                groupRows.map(({ row }) => (
                  <div key={row.id} className="mb-set-row is-child">
                    <span className="mb-set-child-space" aria-hidden="true" />
                    <span className="mb-set-drag" aria-hidden="true">
                      <GripVertical size={14} />
                    </span>
                    <span className="mb-set-icon">
                      <Tag size={16} />
                    </span>
                    <span className="mb-set-name">{row.name}</span>
                    <span className="mb-set-meta">{row.txCount} 笔</span>
                    <RowMenu
                      id={`cf-cat-${row.id}`}
                      openId={menuOpen}
                      onOpen={onMenuOpen}
                      confirming={confirming}
                      onConfirm={onConfirm}
                      items={[
                        {
                          key: `cf-group-${row.id}`,
                          label: '移动到…',
                          onSelect: () =>
                            onOpenMover({
                              kind: 'activity',
                              id: row.id,
                              name: row.name,
                              current: activityOf(row.id),
                            }),
                        },
                      ]}
                    />
                  </div>
                ))}
            </div>
          )
        })}
      </div>
    </>
  )
}
