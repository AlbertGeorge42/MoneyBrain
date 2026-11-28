/**
 * 设置 · 现金流分类分区。
 *
 * 资产 Tab 按一级资产分类的现金等价 / 投资标记分组（子分类继承，不单独列出），
 * 收入 / 支出 Tab 按活动归组；转账五类已内化为系统分类（按账户自动归类），不再提供配置入口。
 * 所有分组默认折叠，空组不渲染占位行。活动归属写入分类的 cashFlowType，现金流报表按同一字段分组。
 */
import type { ReactNode } from 'react'
import {
  Boxes,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  GripVertical,
  Landmark,
  Tag,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/features/shared/Button'
import { Collapse } from '@/features/shared/Collapse'
import { Tabs } from '@/features/shared/Tabs'
import { isKeyExpanded, type ExpandedKeys } from '@/features/shared/foldState'
import type { Ledger } from '@/features/overview/model'
import { RowMenu } from './RowMenu'
import {
  ACTIVITY_GROUPS,
  ASSET_MARK_GROUPS,
  assetMarkOf,
  defaultActivity,
  type ActivityGroupId,
  type AssetMarkId,
  type CategoryRow,
} from './model'
import type { Mover } from './MoverSheet'

export type CashflowTab = 'asset' | 'income' | 'expense'

/** 固定一级分组不像账本分类那样有 iconKey，内置图标按语义固定，全端同一套。 */
const ASSET_MARK_ICONS: Record<AssetMarkId, LucideIcon> = {
  cash: Wallet,
  investment: TrendingUp,
  other: Boxes,
}

const ACTIVITY_ICONS: Record<ActivityGroupId, LucideIcon> = {
  operating: BriefcaseBusiness,
  investing: TrendingUp,
  financing: Landmark,
  unassigned: CircleHelp,
}

const CASHFLOW_TABS: readonly { id: CashflowTab; label: string }[] = [
  { id: 'asset', label: '资产分类' },
  { id: 'income', label: '收入分类' },
  { id: 'expense', label: '支出分类' },
]

/** 固定一级分组行：与可配置一级行同结构（折叠位 + 图标 + 名称 + 行尾手柄），但不提供 ⋯ 菜单。 */
function FixedGroupRow({
  label,
  icon: Icon,
  open,
  empty,
  onToggle,
  children,
}: {
  label: string
  icon: LucideIcon
  open: boolean
  empty: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className="mb-set-group">
      <div className="mb-set-row">
        <Button
          className="mb-set-fold"
          aria-label={empty ? '本组无分类' : open ? '收起分类' : '展开分类'}
          aria-expanded={open}
          disabled={empty}
          onClick={onToggle}
        >
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </Button>
        <span className="mb-set-icon">
          <Icon size={16} />
        </span>
        <span className="mb-set-name">{label}</span>
        <span className="mb-set-drag" aria-hidden="true">
          <GripVertical size={14} />
        </span>
      </div>
      {!empty && (
        <Collapse open={open}>
          <div className="mb-set-children">{children}</div>
        </Collapse>
      )}
    </div>
  )
}

interface CashflowSectionProps {
  ledger: Ledger
  rows: CategoryRow[]
  tab: CashflowTab
  onTabChange: (tab: CashflowTab) => void
  expandedKeys: ExpandedKeys
  onToggleExpanded: (key: string) => void
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
  expandedKeys,
  onToggleExpanded,
  menuOpen,
  onMenuOpen,
  confirming,
  onConfirm,
  onOpenMover,
}: CashflowSectionProps) {
  const activityOf = (categoryId: string): ActivityGroupId => {
    const category = ledger.categories.find((item) => item.id === categoryId)
    return category ? defaultActivity(category, ledger) : 'unassigned'
  }

  // 现金等价 / 投资标志只存在一级资产分类；子分类继承，不单独列出。
  const rootAssetCategories = (ledger.accountCategories ?? []).filter(
    (category) => category.type === 'asset' && !category.parentId,
  )

  if (tab === 'asset') {
    return (
      <>
        <div className="mb-set-toolbar">
          <Tabs
            label="现金流分类"
            value={tab}
            items={CASHFLOW_TABS}
            onChange={onTabChange}
          />
        </div>
        <div className="mb-set-list">
          {ASSET_MARK_GROUPS.map((group) => {
            const groupRows = rootAssetCategories.filter((category) => assetMarkOf(category) === group.id)
            const groupKey = `cf-asset-${group.id}`
            const empty = groupRows.length === 0
            // 空组不渲染占位行，避免像还没加载完；其余组默认折叠。
            const open = !empty && isKeyExpanded(expandedKeys, groupKey)
            return (
              <FixedGroupRow
                key={group.id}
                label={group.label}
                icon={ASSET_MARK_ICONS[group.id]}
                open={open}
                empty={empty}
                onToggle={() => onToggleExpanded(groupKey)}
              >
                {groupRows.map((category) => {
                  const Icon = ASSET_MARK_ICONS[group.id]
                  return (
                  <div key={category.id} className="mb-set-row is-child">
                    <span className="mb-set-child-space" aria-hidden="true" />
                    <span className="mb-set-icon">
                      <Icon size={16} />
                    </span>
                    <span className="mb-set-name">{category.name}</span>
                    <RowMenu
                      id={`cf-mark-${category.id}`}
                      openId={menuOpen}
                      onOpen={onMenuOpen}
                      confirming={confirming}
                      onConfirm={onConfirm}
                      items={[
                        {
                          key: `cf-mark-move-${category.id}`,
                          label: '移动到…',
                          onSelect: () =>
                            onOpenMover({
                              kind: 'asset-mark',
                              id: category.id,
                              name: category.name,
                              current: group.id,
                            }),
                        },
                      ]}
                    />
                    <span className="mb-set-drag" aria-hidden="true">
                      <GripVertical size={14} />
                    </span>
                  </div>
                  )
                })}
              </FixedGroupRow>
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
        <Tabs
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
          // 空组不渲染占位行，避免像还没加载完；其余组默认折叠。
          const open = !empty && isKeyExpanded(expandedKeys, groupKey)
          return (
            <FixedGroupRow
              key={group.id}
              label={group.label}
              icon={ACTIVITY_ICONS[group.id]}
              open={open}
              empty={empty}
              onToggle={() => onToggleExpanded(groupKey)}
            >
              {groupRows.map(({ row }) => (
                <div key={row.id} className="mb-set-row is-child">
                  <span className="mb-set-child-space" aria-hidden="true" />
                  <span className="mb-set-icon">
                    <Tag size={16} />
                  </span>
                  <span className="mb-set-name">{row.name}</span>
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
                  <span className="mb-set-drag" aria-hidden="true">
                    <GripVertical size={14} />
                  </span>
                </div>
              ))}
            </FixedGroupRow>
          )
        })}
      </div>
    </>
  )
}
