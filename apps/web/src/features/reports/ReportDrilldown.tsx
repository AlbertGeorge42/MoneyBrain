import { Button, Drawer } from '@mantine/core'
import type { DeviceMode } from '../transactions/types'
import { formatPercent } from '../transactions/transaction-utils'
import type { ReportPeriod, ReportRow, ReportTableData } from './reports-mock'
import { rowAmount, rowTone, shareOf, tableTotal } from './report-utils'

type ReportDrilldownProps = {
  open: boolean
  device: DeviceMode
  period: ReportPeriod
  table: ReportTableData | null
  row: ReportRow | null
  onClose: () => void
}

export function ReportDrilldown({ open, device, period, table, row, onClose }: ReportDrilldownProps) {
  if (!table || !row) {
    return (
      <Drawer
        opened={open}
        onClose={onClose}
        position={device === 'mobile' ? 'bottom' : 'right'}
        size={device === 'mobile' ? '86%' : 'var(--mb-panel-w)'}
        title="报表详情"
      >
        <div />
      </Drawer>
    )
  }

  const total = tableTotal(table.rows)
  const tone = rowTone(row.amount, table.tone)
  const share = formatPercent(shareOf(row.amount, total))

  return (
    <Drawer
      opened={open}
      onClose={onClose}
      position={device === 'mobile' ? 'bottom' : 'right'}
      size={device === 'mobile' ? '86%' : 'var(--mb-panel-w)'}
      title={`${table.title} · 详情`}
      classNames={{ body: 'hf-drawer-body' }}
    >
      <div className="rep-detail">
        <div className="rep-detail-hero">
          <div className="mb-text-1">{period.label} · {period.asOf}</div>
          <div className="rep-detail-amount mb-num" data-tone={tone}>{rowAmount(row, table)}</div>
          <div className="mb-text-1">{row.label}</div>
          <div className="mb-text-0">占本表合计 {share}</div>
        </div>

        {row.children && row.children.length > 0 && (
          <section className="rep-detail-section" aria-label="构成">
            <h3 className="mb-title-4">构成</h3>
            <ul className="rep-detail-list">
              {row.children.map((child) => (
                <li key={child.id} className="rep-detail-item">
                  <span className="rep-detail-name">{child.label}</span>
                  <span className="rep-detail-share mb-num">{formatPercent(shareOf(child.amount, total))}</span>
                  <span className="mb-num" data-tone={rowTone(child.amount, table.tone)}>
                    {rowAmount(child, table)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mb-text-0 rep-detail-note">
          报表按类别汇总；行内不展开明细，点开只看到本期汇总与构成。折叠父项不改变合计。
        </p>
        <Button variant="default" fullWidth onClick={onClose}>关闭</Button>
      </div>
    </Drawer>
  )
}
