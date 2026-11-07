/**
 * 报表页共用外壳：视图页签与空态。
 *
 * 只承载布局与文案，不参与任何数据派生；页面与四张报表都从这里取同一份结构。
 */
import { FolderInput, ScanLine } from 'lucide-react'
import { Card } from '@/features/shared/Card'
import { HfButton } from '@/features/shared/HfButton'
import { HfTabs } from '@/features/shared/HfTabs'
import type { DeviceMode } from '@/features/shared/types'
import type { ReportTab } from './reportsTime'
import { REPORT_TABS } from './reportsShared'

export function PageHead({
  device,
  tab,
  onTab,
}: {
  device: DeviceMode
  tab: ReportTab
  onTab: (next: ReportTab) => void
}) {
  if (device === 'mobile') {
    return (
      <div className="mb-rp-mobile-head">
        <HfTabs
          variant="report"
          label="报表视图"
          className="is-mobile"
          value={tab}
          items={REPORT_TABS}
          onChange={onTab}
        />
      </div>
    )
  }

  return (
    <div className="mb-rp-page-head">
      <div className="mb-rp-page-copy">
        <h1 className="mb-rp-page-title">报表</h1>
      </div>
      <HfTabs
        variant="report"
        label="报表视图"
        value={tab}
        items={REPORT_TABS}
        onChange={onTab}
      />
    </div>
  )
}

export function ReportsEmpty({ onImport }: { onImport: () => void }) {
  return (
    <Card variant="report" className="mb-rp-empty">
      <div className="mb-rp-empty-mark" aria-hidden="true">
        <ScanLine size={28} strokeWidth={1.8} />
      </div>
      <h2 className="mb-rp-empty-title">还没有可分析的流水</h2>
      <p className="mb-rp-empty-desc">
        报表从账本里取数：先记一笔收支，或导入银行 / 支付宝账单，四张报表会自动生成。
      </p>
      <HfButton className="mb-rp-btn is-primary" onClick={onImport}>
        <FolderInput size={16} />
        导入账单
      </HfButton>
    </Card>
  )
}
