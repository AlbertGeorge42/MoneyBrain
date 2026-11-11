/**
 * 账本配置抽屉：报表页点「设置」后直达的单分区管理界面。
 *
 * 内容复用设置页的 AccountsSection / CategoriesSection / CashflowSection
 * 与同一份 controller，不另建表格、表单或校验；视觉沿用设置页的 mb-set-* 内胆。
 * 由调用方按当前报表固定 tab 与标题，这里不提供跨分区切换，避免二级入口。
 */
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import type { Ledger } from '@/features/overview/model'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { AccountsSection } from './AccountsSection'
import { CategoriesSection } from './CategoriesSection'
import { CashflowSection } from './CashflowSection'
import { LedgerConfigSheets } from './LedgerConfigSheets'
import type { LedgerConfigController } from './useLedgerConfigController'

export type LedgerConfigTab = 'accounts' | 'categories' | 'cashflow'

export function LedgerConfigManager({
  opened,
  tab,
  title,
  extra,
  onClose,
  device,
  ledger,
  controller,
}: {
  opened: boolean
  /** 由当前报表决定，抽屉内不提供切换。 */
  tab: LedgerConfigTab
  title: string
  /** 报表专有的补充项（如收支明细的数据范围），与分类管理同处一层。 */
  extra?: ReactNode
  onClose: () => void
  device: DeviceMode
  ledger: Ledger
  controller: LedgerConfigController
}) {
  return (
    <>
      <HfSheet
        variant="settings"
        device={device}
        opened={opened}
        onClose={onClose}
        desktopSize={640}
        mobileSize="100%"
        contentClassName="mb-ledger-sheet"
      >
        <div className="mb-set-sheet-head">
          <h2 className="mb-set-sheet-title">{title}</h2>
          <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </HfButton>
        </div>
        <div className="mb-set-sheet-body">
          {extra && <div className="mb-set-field mb-ledger-sheet-extra">{extra}</div>}
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
              onReorderGroupTo={(id, targetIndex) => void controller.moveAccountGroupTo(id, targetIndex)}
              onReorderAccountTo={(id, targetIndex) => void controller.moveAccountTo(id, targetIndex)}
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
              onReorder={(id, targetIndex) => void controller.moveCategoryTo(id, targetIndex)}
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

        <div className="mb-set-sheet-actions">
          <HfButton className="mb-set-btn is-primary" onClick={onClose}>
            完成
          </HfButton>
        </div>
      </HfSheet>

      <LedgerConfigSheets controller={controller} device={device} ledger={ledger} />
    </>
  )
}
