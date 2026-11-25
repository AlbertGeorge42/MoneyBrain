/**
 * 账本配置的唯一内容组件：设置页与报表页「设置」共用同一份分区渲染与 controller 接线。
 *
 * 宿主只决定外壳（设置页的二级页 / 报表页的 Sheet）与标题，不再各写一遍
 * AccountsSection / CategoriesSection / CashflowSection 的 props 映射，避免两边漂移。
 */
import type { ReactNode } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import type { Ledger } from '@/features/overview/model'
import { AccountsSection } from './AccountsSection'
import { CategoriesSection } from './CategoriesSection'
import { CashflowSection } from './CashflowSection'
import type { LedgerConfigController } from './useLedgerConfigController'

export type LedgerConfigTab = 'accounts' | 'categories' | 'cashflow'

export function LedgerConfigSection({
  ledger,
  controller,
  tab,
  device,
  extra,
}: {
  ledger: Ledger
  controller: LedgerConfigController
  /** 由宿主固定：报表页按当前报表决定，设置页按用户点开的分区决定。 */
  tab: LedgerConfigTab
  device: DeviceMode
  /** 报表专有补充项（如收支明细的数据范围），与分类管理同处一层。 */
  extra?: ReactNode
}) {
  return (
    <div className="mb-set-config" data-device={device}>
      {extra}
      {tab === 'accounts' ? (
        <AccountsSection
          ledger={ledger}
          assetGroups={controller.assetGroups}
          liabilityGroups={controller.liabilityGroups}
          tab={controller.accountTab}
          onTabChange={controller.setAccountTab}
          showEmptyGroups={controller.showEmptyGroups}
          onShowEmptyGroupsChange={controller.setShowEmptyGroups}
          expandedKeys={controller.expandedKeys}
          onToggleExpanded={controller.toggleExpanded}
          onSetGroupsExpanded={controller.setGroupsExpanded}
          onOpenEditor={controller.setEditor}
          onOpenMover={controller.setMover}
          menuOpen={controller.menuOpen}
          onMenuOpen={controller.setMenuOpen}
          confirming={controller.confirming}
          onConfirm={controller.setConfirming}
          onDeleteAccount={(account) => void controller.deleteAccount(account)}
          onDeleteGroup={(group) => void controller.deleteGroup(group)}
          onReorderGroupTo={(scope, id, overId, targetIndex) =>
            controller.moveAccountGroupTo(scope, id, overId, targetIndex)
          }
          onReorderAccountTo={(scope, id, overId, targetIndex) =>
            controller.moveAccountTo(scope, id, overId, targetIndex)
          }
        />
      ) : tab === 'categories' ? (
        <CategoriesSection
          ledger={ledger}
          rows={controller.rowsByType[controller.categoryTab]}
          tab={controller.categoryTab}
          onTabChange={controller.setCategoryTab}
          expandedKeys={controller.expandedKeys}
          onToggleExpanded={controller.toggleExpanded}
          menuOpen={controller.menuOpen}
          onMenuOpen={controller.setMenuOpen}
          confirming={controller.confirming}
          onConfirm={controller.setConfirming}
          onOpenEditor={controller.setEditor}
          onOpenMover={controller.setMover}
          onReorder={(scope, id, overId, targetIndex) =>
            controller.moveCategoryTo(scope, id, overId, targetIndex)
          }
          onDelete={(row, type) => void controller.deleteCategory(row, type)}
        />
      ) : (
        <CashflowSection
          ledger={ledger}
          rows={controller.cashTab === 'asset' ? [] : controller.rowsByType[controller.cashTab]}
          tab={controller.cashTab}
          onTabChange={controller.setCashTab}
          expandedKeys={controller.expandedKeys}
          onToggleExpanded={controller.toggleExpanded}
          menuOpen={controller.menuOpen}
          onMenuOpen={controller.setMenuOpen}
          confirming={controller.confirming}
          onConfirm={controller.setConfirming}
          onOpenMover={controller.setMover}
        />
      )}
    </div>
  )
}
