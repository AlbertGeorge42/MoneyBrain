import { Button, Drawer } from '@mantine/core'
import {
  filterTransactions,
  formatAmount,
  formatPercent,
  formatShortDate,
} from '../transactions/transaction-utils'
import { ACCOUNTS, CATEGORIES } from '../transactions/mock'
import { EMPTY_FILTERS } from '../transactions/types'
import type { DeviceMode, Transaction, TransactionFilters, TxType } from '../transactions/types'
import type { ReportPeriod, ReportRow, ReportTableData } from './reports-mock'
import { drillFilters, rowAmount, rowTone, shareOf, tableTotal } from './report-utils'

type ReportDrilldownProps = {
  open: boolean
  device: DeviceMode
  period: ReportPeriod
  table: ReportTableData | null
  row: ReportRow | null
  items: Transaction[]
  onClose: () => void
  onOpenTransactions: (filters: Partial<TransactionFilters>) => void
}

function txTone(type: TxType): string {
  if (type === 'income' || type === 'refund') return 'income'
  if (type === 'expense') return 'expense'
  return 'neutral'
}

export function ReportDrilldown({
  open,
  device,
  period,
  table,
  row,
  items,
  onClose,
  onOpenTransactions,
}: ReportDrilldownProps) {
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
  const filters = drillFilters(row, table, period)
  const related = filters
    ? filterTransactions(items, { ...EMPTY_FILTERS, ...filters }, ACCOUNTS, CATEGORIES)
      .sort((left, right) => right.date.localeCompare(left.date))
      .slice(0, 2)
    : []

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

        <section className="rep-detail-section" aria-label="相关流水">
          <h3 className="mb-title-4">相关流水 · 近 2 笔</h3>
          {related.length > 0 ? (
            <ul className="rep-related-list">
              {related.map((tx) => (
                <li key={tx.id} className="rep-related-item">
                  <div className="rep-related-main">
                    <span className="rep-related-date mb-num">{formatShortDate(tx.date)}</span>
                    <span className="rep-related-note">{tx.note || tx.subcategory}</span>
                  </div>
                  <span className="mb-num" data-tone={txTone(tx.type)}>{formatAmount(tx.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-text-0 rep-detail-note">
              {table.kind === 'investment'
                ? '持仓来自净值快照，与收支流水不是同一口径。'
                : filters
                  ? '本期账本里没有匹配的流水；报表金额为示例汇总。'
                  : '这一行是汇总行，没有可直接定位的单笔流水。'}
            </p>
          )}
        </section>

        <p className="mb-text-0 rep-detail-note">
          报表按类别汇总；相关流水取自当前预览账本，报表金额为示例数据。
        </p>
        <div className="rep-detail-actions">
          <Button variant="default" onClick={onClose}>关闭</Button>
          {filters && related.length > 0 && (
            <Button
              onClick={() => {
                onOpenTransactions(filters)
                onClose()
              }}
            >
              在流水中查看
            </Button>
          )}
        </div>
      </div>
    </Drawer>
  )
}
