import { formatAmount, formatPercent, formatUnsigned } from '../transactions/transaction-utils'
import type { TransactionFilters } from '../transactions/types'
import type {
  ReportColumn,
  ReportColumnKey,
  ReportPeriod,
  ReportRow,
  ReportTableData,
  ReportTone,
} from './reports-mock'

export type ReportFlatRow = {
  row: ReportRow
  level: number
  hasChildren: boolean
  expanded: boolean
}

export type ReportSort = {
  key: ReportColumnKey
  direction: 'asc' | 'desc'
}

/** 移动端窄屏权重：压缩占比、放大金额，避免金额被截断。 */
const MOBILE_WEIGHTS: Record<ReportColumnKey, number> = {
  main: 2,
  share: 0.75,
  amount: 1.35,
  marketValue: 1.2,
  cost: 1.05,
  gain: 0.95,
  gainRate: 0.9,
}

/** 语义列宽权重：主列、占比、金额；百分比由权重推导，不在各表写死 px。 */
export const REPORT_COLUMNS: ReportColumn[] = [
  { key: 'main', label: '类别', align: 'start', weight: 2.4, format: 'text', tone: 'neutral' },
  { key: 'share', label: '占比', align: 'end', weight: 1.1, format: 'percent', tone: 'neutral' },
  { key: 'amount', label: '金额', align: 'end', weight: 1.1, format: 'text', tone: 'auto' },
]

export function tableColumns(table: Pick<ReportTableData, 'columns'>): ReportColumn[] {
  return table.columns ?? REPORT_COLUMNS
}

export function columnWidth(
  col: ReportColumn,
  device: 'pc' | 'mobile' = 'pc',
  columns: ReportColumn[] = REPORT_COLUMNS,
): string {
  const weight = device === 'mobile' ? MOBILE_WEIGHTS[col.key] : col.weight
  const total = columns.reduce(
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

/** 投资列等额外数值列；没有值返回 null，由表格渲染占位。 */
export function columnValue(row: ReportRow, key: ReportColumnKey, total: number): number | null {
  if (key === 'main') return null
  if (key === 'share') return shareOf(row.amount, total)
  if (key === 'amount') return row.amount
  if (key === 'marketValue' || key === 'cost' || key === 'gain' || key === 'gainRate') {
    return row.values?.[key] ?? null
  }
  return null
}

function sumValue(rows: ReportRow[], key: 'marketValue' | 'cost' | 'gain'): number {
  const value = rows.reduce((sum, row) => sum + (row.values?.[key] ?? 0), 0)
  return Math.round(value * 100) / 100
}

/** 合计行：占比 100%，投资收益类按总量重算收益率。 */
export function columnTotalValue(rows: ReportRow[], key: ReportColumnKey): number | null {
  if (key === 'main') return null
  if (key === 'share') return 1
  if (key === 'amount') return tableTotal(rows)
  if (key === 'marketValue' || key === 'cost' || key === 'gain') return sumValue(rows, key)
  if (key === 'gainRate') {
    const cost = sumValue(rows, 'cost')
    return cost === 0 ? 0 : sumValue(rows, 'gain') / cost
  }
  return null
}

export function formatRate(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${(value * 100).toFixed(1)}%`
}

export function columnText(value: number, col: ReportColumn): string {
  if (col.format === 'percent') {
    return col.key === 'share' ? formatPercent(value) : formatRate(value)
  }
  if (col.format === 'signed') return formatAmount(value)
  if (col.format === 'unsigned') return formatUnsigned(value)
  return String(value)
}

export function columnTone(col: ReportColumn, value: number): ReportTone {
  if (col.tone === 'neutral') return 'neutral'
  if (value < 0) return 'expense'
  if (value > 0) return 'income'
  return 'neutral'
}

export function sortRows(rows: ReportRow[], sort: ReportSort | null): ReportRow[] {
  if (!sort) return rows
  const valueOf = (row: ReportRow) => {
    if (sort.key === 'main') return row.label
    if (sort.key === 'amount') return row.amount
    if (sort.key === 'share') return row.amount
    return row.values?.[sort.key] ?? row.amount
  }
  return [...rows].sort((left, right) => {
    const a = valueOf(left)
    const b = valueOf(right)
    const result = typeof a === 'string' ? a.localeCompare(String(b), 'zh-Hans-CN') : a - Number(b)
    return sort.direction === 'asc' ? result : -result
  })
}

/** 行下钻筛选：余额快照只按账户，收支 / 现金流再叠加本期日期。 */
export function drillFilters(
  row: ReportRow,
  table: ReportTableData,
  period: ReportPeriod,
): Partial<TransactionFilters> | null {
  if (table.kind === 'investment' || !row.match) return null
  const filters: Partial<TransactionFilters> = { ...row.match }
  if (table.kind === 'flows' || table.kind === 'cash') {
    filters.from = period.from
    filters.to = period.to
  }
  return filters
}
