/**
 * 报表页共用外壳：视图页签与空态。
 *
 * 只承载布局与文案，不参与任何数据派生；页面与四张报表都从这里取同一份结构。
 */
import { FolderInput, ScanLine, Settings } from 'lucide-react'
import { EmptyState } from '@/features/shared/EmptyState'
import { Button } from '@/features/shared/Button'
import { Tabs } from '@/features/shared/Tabs'
import type { DeviceMode } from '@/features/shared/types'
import type { ReportTab } from './reportsTime'
import { REPORT_TABS } from './reportsShared'

export function PageHead({
  device,
  tab,
  sub,
  onTab,
  onOpenSettings,
}: {
  device: DeviceMode
  tab: ReportTab
  sub: string
  onTab: (next: ReportTab) => void
  onOpenSettings: () => void
}) {
  if (device === 'mobile') {
    return (
      <div className="mb-rp-mobile-head">
        <div className="mb-rp-mobile-head-row">
          <Tabs
            bordered
            label="报表视图"
            className="is-mobile"
            value={tab}
            items={REPORT_TABS}
            onChange={onTab}
          />
          {/* 报表页自己带设置入口：应用级设置在底部导航里，不在页头重复。 */}
          <Button
            className="mb-rp-settings-btn mb-rp-settings-btn--icon"
            aria-label="报表设置"
            onClick={onOpenSettings}
          >
            <Settings size={16} />
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-rp-page-head">
      <div className="mb-rp-page-copy">
        <h1 className="mb-rp-page-title">报表</h1>
        <p className="mb-shell-sub">{sub}</p>
      </div>
      <div className="mb-rp-head-actions">
        <Tabs
          bordered
          label="报表视图"
          value={tab}
          items={REPORT_TABS}
          onChange={onTab}
        />
        <Button className="mb-rp-settings-btn" onClick={onOpenSettings}>
          <Settings size={15} />
          设置
        </Button>
      </div>
    </div>
  )
}

export function ReportsSeedNotice() {
  return (
    <EmptyState
      variant="report"
      icon={<ScanLine size={28} strokeWidth={1.8} />}
      title="演示数据不提供报表"
      description="报表数字只由后端账本计算。当前是演示模式，切换到真实账本后四张报表才会出数。"
    />
  )
}

export function ReportsEmpty({ onImport }: { onImport: () => void }) {
  return (
    <EmptyState
      variant="report"
      icon={<ScanLine size={28} strokeWidth={1.8} />}
      title="还没有可分析的流水"
      description="报表从账本里取数：先记一笔收支，或导入银行 / 支付宝账单，四张报表会自动生成。"
      action={
        <Button variant="primary" onClick={onImport}>
          <FolderInput size={16} />
          导入账单
        </Button>
      }
    />
  )
}
