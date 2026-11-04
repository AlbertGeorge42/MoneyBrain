import { formatAmount, formatUnsigned } from '../transactions/transaction-utils'
import type { ReportRow, ReportTableData, ReportTone } from './reports-mock'

export type ReportFlatRow = {
  row: ReportRow
  level: number
  hasChildren: boolean
  expanded: boolean
}

export type ReportColumn = {
  key: 'main' | 'share' | 'amount'
  label: string
  align: 'start' | 'end'
  weight: number
}

/** 移动端窄屏权重：压缩占比、放大金额，避免金额被截断。 */
const MOBILE_WEIGHTS: Record<ReportColumn['key'], number> = {
  main: 2,
  share: 0.75,
  amount: 1.35,
}

/** 语义列宽权重：主列、占比、金额；百分比由权重推导，不在各表写死 px。 */
export const REPORT_COLUMNS: ReportColumn[] = [
  { key: 'main', label: '类别', align: 'start', weight: 2.4 },
  { key: 'share', label: '占比', align: 'end', weight: 1.1 },
  { key: 'amount', label: '金额', align: 'end', weight: 1.1 },
]

export function columnWidth(col: ReportColumn, device: 'pc' | 'mobile' = 'pc'): string {
  const weight = device === 'mobile' ? MOBILE_WEIGHTS[col.key] : col.weight
  const total = REPORT_COLUMNS.reduce(
    (sum, item) => sum + (device === 'mobile' ? MOBILE_WEIGHTS[item.key] : item.weight),
    0,
  )
  return `${(weight / total) * 100}%`
}

export function flatRows(
  rows: ReportRow[],
  folded: ReadonlySet<string>,
  tableId: string,
  level = 0,
): ReportFlatRow[] {
  const result: ReportFlatRow[] = []
  for (const row of rows) {
    const hasChildren = Boolean(row.children?.length)
    const expanded = hasChildren && !folded.has(`${tableId}:${row.id}`)
    result.push({ row, level, hasChildren, expanded })
    if (expanded && row.children) {
      result.push(...flatRows(row.children, folded, tableId, level + 1))
    }
  }
  return result
}

export function findRow(rows: ReportRow[], rowId: string): ReportRow | null {
  for (const row of rows) {
    if (row.id === rowId) return row
    if (row.children) {
      const hit = findRow(row.children, rowId)
      if (hit) return hit
    }
  }
  return null
}

export function tableTotal(rows: ReportRow[]): number {
  return Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100
}

export function shareOf(amount: number, total: number): number {
  return total === 0 ? 0 : Math.abs(amount) / Math.abs(total)
}

export function amountText(amount: number, format: ReportTableData['format']): string {
  return format === 'signed' ? formatAmount(amount) : formatUnsigned(amount)
}

export function rowAmount(row: ReportRow, table: Pick<ReportTableData, 'format'>): string {
  return amountText(row.amount, table.format)
}

/** 支出表里退款为正，仍用收入色；金额颜色永远与符号一致。 */
export function rowTone(amount: number, tableTone: ReportTone): ReportTone {
  if (tableTone === 'neutral') return 'neutral'
  if (amount < 0) return 'expense'
  if (amount > 0) return 'income'
  return 'neutral'
}

export function tableTone(table: ReportTableData): ReportTone {
  return rowTone(tableTotal(table.rows), table.tone)
}
