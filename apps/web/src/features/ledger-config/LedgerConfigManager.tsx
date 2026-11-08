/**
 * 账本配置抽屉：报表页从“报表设置”进入的账户 / 收支分类管理。
 *
 * 内容直接复用设置页的 AccountsSection / CategoriesSection 与同一份 controller，
 * 不另建表格、表单或校验；视觉沿用设置页的 mb-set-* 内胆，只按约定调整抽屉尺寸。
 */
import { X } from 'lucide-react'
import type { DeviceMode } from '@/features/shared/types'
import type { Ledger } from '@/features/overview/model'
import { HfButton } from '@/features/shared/HfButton'
import { HfSheet } from '@/features/shared/HfSheet'
import { HfTabs } from '@/features/shared/HfTabs'
import type { InvestmentTypeRow } from '@/features/settings/settingsModel'
import { AccountsSection } from '@/features/settings/AccountsSection'
import { CategoriesSection } from '@/features/settings/CategoriesSection'
import { LedgerConfigSheets } from './LedgerConfigSheets'
import type { LedgerConfigController } from './useLedgerConfigController'

export type LedgerConfigTab = 'accounts' | 'categories'

export function LedgerConfigManager({
  opened,
  tab,
  onTabChange,
  onClose,
  device,
  ledger,
  controller,
  investRows,
  onRetry,
}: {
  opened: boolean
  tab: LedgerConfigTab
  onTabChange: (next: LedgerConfigTab) => void
  onClose: () => void
  device: DeviceMode
  ledger: Ledger
  controller: LedgerConfigController
  investRows: readonly InvestmentTypeRow[]
  onRetry: () => void
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
          <h2 className="mb-set-sheet-title">账户与分类</h2>
          <HfButton className="mb-set-icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </HfButton>
        </div>
        <div className="mb-set-sheet-body">
          <div className="mb-set-toolbar">
            <HfTabs
              variant="settings"
              label="账本数据"
              value={tab}
              items={[
                { id: 'accounts', label: '账户' },
                { id: 'categories', label: '收支分类' },
              ]}
              onChange={onTabChange}
            />
          </div>

          {tab === 'accounts' ? (
            <AccountsSection
              device={device}
              ledger={ledger}
              assetGroups={controller.assetGroups}
              liabilityGroups={controller.liabilityGroups}
              tab={controller.accountTab}
              onTabChange={controller.setAccountTab}
              showEmptyGroups={controller.showEmptyGroups}
              onShowEmptyGroupsChange={controller.setShowEmptyGroups}
              collapsed={controller.collapsed}
              onToggleCollapsed={controller.toggleCollapsed}
              onSetGroupsCollapsed={controller.setGroupsCollapsed}
              onOpenEditor={controller.setEditor}
              onRetry={onRetry}
            />
          ) : (
            <CategoriesSection
              ledger={ledger}
              rows={controller.rowsByType[controller.categoryTab]}
              tab={controller.categoryTab}
              onTabChange={controller.setCategoryTab}
              collapsed={controller.collapsed}
              onToggleCollapsed={controller.toggleCollapsed}
              menuOpen={controller.menuOpen}
              onMenuOpen={controller.setMenuOpen}
              confirming={controller.confirming}
              onConfirm={controller.setConfirming}
              onOpenEditor={controller.setEditor}
              onOpenMover={controller.setMover}
              onReorder={(id, direction) => void controller.moveCategoryOrder(id, direction)}
              onDelete={(row, type) => void controller.deleteCategory(row, type)}
            />
          )}
        </div>

        <div className="mb-set-sheet-actions">
          <HfButton className="mb-set-btn is-primary" onClick={onClose}>
            完成
          </HfButton>
        </div>
      </HfSheet>

      <LedgerConfigSheets
        controller={controller}
        device={device}
        ledger={ledger}
        investRows={investRows}
      />
    </>
  )
}
