import type { KeyboardEvent } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { TruncateCell } from '../../ui/TruncateCell'
import { formatPercent } from '../transactions/transaction-utils'
import type { DeviceMode } from '../transactions/types'
import type { ReportRow, ReportTableData } from './reports-mock'
import {
  REPORT_COLUMNS,
  amountText,
  columnWidth,
  flatRows,
  rowAmount,
  rowTone,
  shareOf,
  tableTone,
  tableTotal,
} from './report-utils'

type ReportTableProps = {
  table: ReportTableData
  periodLabel: string
  device: DeviceMode
  folded: ReadonlySet<string>
  padTo?: number
  onToggleFold: (key: string) => void
  onOpenRow: (row: ReportRow) => void
}

export function ReportTable({
  table,
  periodLabel,
  device,
  folded,
  padTo,
  onToggleFold,
  onOpenRow,
}: ReportTableProps) {
  const rows = flatRows(table.rows, folded, table.id)
  const total = tableTotal(table.rows)
  const totalTone = tableTone(table)
  const spacerCount = Math.max(0, (padTo ?? rows.length) - rows.length)
  const foldKey = (rowId: string) => `${table.id}:${rowId}`

  const openRowOnKey = (event: KeyboardEvent<HTMLTableRowElement>, row: ReportRow) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpenRow(row)
  }

  return (
    <section className="rep-table-card" aria-label={`${table.title}报表`}>
      <div className="rep-table-head">
        <h3 className="mb-title-4">{table.title}</h3>
        <span className="mb-text-0">{table.rows.length} 个类别</span>
      </div>
      <table className="rep-table" aria-label={`${table.title} · ${periodLabel}`}>
        <caption className="mb-sr-only">{table.title} · {periodLabel}</caption>
        <colgroup>
          {REPORT_COLUMNS.map((col) => (
            <col key={col.key} style={{ width: columnWidth(col, device) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="rep-head-row">
            {REPORT_COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={col.align === 'end' ? 'rep-head-num' : 'rep-head-main'}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, level, hasChildren, expanded }) => {
            const share = formatPercent(shareOf(row.amount, total))
            const tone = rowTone(row.amount, table.tone)
            return (
              <tr
                key={`${table.id}:${row.id}`}
                className="rep-data-row"
                tabIndex={0}
                aria-label={`${row.label}，${rowAmount(row, table)}，占比 ${share}`}
                onClick={() => onOpenRow(row)}
                onKeyDown={(event) => openRowOnKey(event, row)}
              >
                <td className="rep-main-cell" data-level={level}>
                  <span className="rep-main-inner">
                    <span className="rep-fold-slot">
                      {hasChildren && (
                        <UnstyledButton
                          className="rep-fold"
                          aria-expanded={expanded}
                          aria-label={`${expanded ? '折叠' : '展开'} ${row.label}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            onToggleFold(foldKey(row.id))
                          }}
                          onKeyDown={(event) => event.stopPropagation()}
                        >
                          {expanded ? <ChevronDown aria-hidden /> : <ChevronRight aria-hidden />}
                        </UnstyledButton>
                      )}
                    </span>
                    <TruncateCell className="rep-label" text={row.label} />
                  </span>
                </td>
                <td className="rep-num-cell mb-num">{share}</td>
                <td className="rep-num-cell">
                  <span className="mb-num" data-tone={tone}>{rowAmount(row, table)}</span>
                </td>
              </tr>
            )
          })}
          {spacerCount > 0 && Array.from({ length: spacerCount }, (_, index) => (
            <tr key={`${table.id}:spacer:${index}`} className="rep-spacer-row" aria-hidden="true">
              <td /><td /><td />
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rep-total-row">
            <td>合计</td>
            <td className="rep-num-cell mb-num">{formatPercent(1)}</td>
            <td className="rep-num-cell">
              <span className="mb-num" data-tone={totalTone}>{amountText(total, table.format)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  )
}
