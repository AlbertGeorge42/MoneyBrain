import type { KeyboardEvent } from 'react'
import { UnstyledButton } from '@mantine/core'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight } from 'lucide-react'
import { TruncateCell } from '../../ui/TruncateCell'
import type { DeviceMode } from '../transactions/types'
import type { ReportColumn, ReportRow, ReportTableData } from './reports-mock'
import {
  columnText,
  columnTone,
  columnTotalValue,
  columnValue,
  columnWidth,
  flatRows,
  rowTone,
  tableColumns,
  tableTone,
  tableTotal,
  type ReportSort,
} from './report-utils'

type ReportTableProps = {
  table: ReportTableData
  periodLabel: string
  device: DeviceMode
  folded: ReadonlySet<string>
  padTo?: number
  sort: ReportSort | null
  onSort: (key: ReportColumn['key']) => void
  onToggleFold: (key: string) => void
  onOpenRow: (row: ReportRow) => void
}

function sortMark(col: ReportColumn, sort: ReportSort | null) {
  if (!sort || sort.key !== col.key) return null
  return sort.direction === 'asc' ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />
}

export function ReportTable({
  table,
  periodLabel,
  device,
  folded,
  padTo,
  sort,
  onSort,
  onToggleFold,
  onOpenRow,
}: ReportTableProps) {
  const columns = tableColumns(table)
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
    <section
      className={`rep-table-card${table.kind === 'investment' ? ' rep-table-card--investment' : ''}`}
      aria-label={`${table.title}报表`}
    >
      <div className="rep-table-head">
        <h3 className="mb-title-4">{table.title}</h3>
        <span className="mb-text-0">
          {table.rows.length} {table.kind === 'investment' ? '个分组' : '个类别'}
        </span>
      </div>
      <table className="rep-table" aria-label={`${table.title} · ${periodLabel}`}>
        <caption className="mb-sr-only">{table.title} · {periodLabel}</caption>
        <colgroup>
          {columns.map((col) => (
            <col key={col.key} style={{ width: columnWidth(col, device, columns) }} />
          ))}
        </colgroup>
        <thead>
          <tr className="rep-head-row">
            {columns.map((col) => {
              const ariaSort = sort?.key === col.key
                ? (sort.direction === 'asc' ? 'ascending' : 'descending')
                : 'none'
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? ariaSort : undefined}
                  className={col.align === 'end' ? 'rep-head-num' : 'rep-head-main'}
                >
                  {col.sortable ? (
                    <UnstyledButton
                      className="rep-sort-btn"
                      aria-label={`按${col.label}排序`}
                      onClick={() => onSort(col.key)}
                    >
                      {col.label}
                      {sortMark(col, sort)}
                    </UnstyledButton>
                  ) : col.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ row, level, hasChildren, expanded }) => {
            const tone = rowTone(row.amount, table.tone)
            const cells = columns.filter((col) => col.key !== 'main')
            const summary = cells
              .map((col) => {
                const value = columnValue(row, col.key, total)
                return value === null ? null : `${col.label} ${columnText(value, col)}`
              })
              .filter(Boolean)
              .join('，')
            return (
              <tr
                key={`${table.id}:${row.id}`}
                className="rep-data-row"
                tabIndex={0}
                aria-label={`${row.label}${summary ? `，${summary}` : ''}`}
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
                {cells.map((col) => {
                  const value = columnValue(row, col.key, total)
                  const isAmount = col.key === 'amount'
                  const cellTone = isAmount ? tone : value === null ? 'neutral' : columnTone(col, value)
                  return (
                    <td key={col.key} className="rep-num-cell">
                      {value === null ? (
                        '—'
                      ) : (
                        <span className="mb-num" data-tone={cellTone}>{columnText(value, col)}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {spacerCount > 0 && Array.from({ length: spacerCount }, (_, index) => (
            <tr key={`${table.id}:spacer:${index}`} className="rep-spacer-row" aria-hidden="true">
              {columns.map((col) => <td key={col.key} />)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="rep-total-row">
            {columns.map((col) => {
              if (col.key === 'main') return <td key={col.key}>合计</td>
              const value = columnTotalValue(table.rows, col.key)
              const cellTone = col.key === 'amount' ? totalTone : value === null ? 'neutral' : columnTone(col, value)
              return (
                <td key={col.key} className="rep-num-cell">
                  {value === null ? '—' : (
                    <span className="mb-num" data-tone={cellTone}>{columnText(value, col)}</span>
                  )}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
      {table.kind === 'investment' && (
        <p className="rep-table-note mb-text-0">持仓为预览快照，收益金额与收益率均为示例值。</p>
      )}
    </section>
  )
}
