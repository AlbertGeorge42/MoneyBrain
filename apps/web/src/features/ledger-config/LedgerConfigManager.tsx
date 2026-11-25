/**
 * 账本配置抽屉：报表页点「设置」后直达的单分区管理界面。
 *
 * 内容走共享的 LedgerConfigSection，与设置页同一份分区渲染、controller 与触控口径；
 * 这里只提供 Sheet 外壳、标题与「完成」，不另建表格、表单或校验。
 * 由调用方按当前报表固定 tab 与标题，这里不提供跨分区切换，避免二级入口。
 */
import type { ReactNode } from 'react'
import type { DeviceMode } from '@/features/shared/types'
import type { Ledger } from '@/features/overview/model'
import { Button } from '@/features/shared/Button'
import { SettingsSheetHead } from '@/features/shared/SettingsSheetHead'
import { Sheet } from '@/features/shared/Sheet'
import { LedgerConfigSection, type LedgerConfigTab } from './LedgerConfigSection'
import { LedgerConfigSheets } from './LedgerConfigSheets'
import type { LedgerConfigController } from './useLedgerConfigController'

export type { LedgerConfigTab } from './LedgerConfigSection'

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
      <Sheet
        variant="settings"
        device={device}
        opened={opened}
        onClose={onClose}
        size="lg"
        mobileSize="100%"
        contentClassName="mb-set-ledger-sheet"
        header={<SettingsSheetHead title={title} onClose={onClose} />}
        actions={
          <Button variant="primary" onClick={onClose}>
            完成
          </Button>
        }
      >
        <div className="mb-set-sheet-body">
          <LedgerConfigSection
            ledger={ledger}
            controller={controller}
            tab={tab}
            device={device}
            extra={extra && <div className="mb-set-field mb-set-ledger-sheet-extra">{extra}</div>}
          />
        </div>
      </Sheet>

      <LedgerConfigSheets controller={controller} device={device} ledger={ledger} />
    </>
  )
}
