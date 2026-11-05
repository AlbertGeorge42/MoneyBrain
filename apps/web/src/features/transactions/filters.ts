/**
 * 流水页筛选与分组（纯函数）
 *
 * 搜索覆盖备注 / 账户 / 分类 / 方向 / 金额；高级筛选按账户、分类根节点、金额区间、
 * 日期区间取交集。列表分组沿用总览的日期标签口径，另补每组合计。
 */
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import {
  getAccount,
  getCategoryName,
  getCategoryRootId,
  groupRecentTransactions,
  TODAY,
  transactionDirection,
  type Ledger,
  type LedgerTransaction,
  type TxType,
} from '@/features/overview/model'

export type TypeFilter = 'all' | TxType

export interface AdvancedFilters {
  accountId: string
  categoryId: string
  amountMin: string
  amountMax: string
  dateFrom: string
  dateTo: string
}

export interface TransactionFilters {
  query: string
  type: TypeFilter
  advanced: AdvancedFilters
}

export const EMPTY_ADVANCED: AdvancedFilters = {
  accountId: '',
  categoryId: '',
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
}

export const TYPE_OPTIONS: readonly { value: TypeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
  { value: 'refund', label: '退款' },
  { value: 'adjustment', label: '调整' },
]

export interface GroupedTransactions {
  date: string
  label: string
  items: LedgerTransaction[]
  net: number
  income: number
  expense: number
}

export interface TransactionTotals {
  count: number
  income: number
  expense: number
  net: number
}

export interface FilterChip {
  key: 'type' | 'account' | 'category' | 'amount' | 'date'
  label: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s,]/g, '')
}

function matchesQuery(ledger: Ledger, transaction: LedgerTransaction, query: string): boolean {
  if (!query) return true
  const needle = normalize(query)
  const account = getAccount(ledger, transaction.accountId)
  const category = getCategoryName(ledger, transaction.categoryId)
  const haystack = normalize(
    [
      transaction.note,
      account?.name ?? '',
      category,
      transactionDirection(transaction),
      formatCurrency(minor(transaction.amount), { showSymbol: false }),
      String(transaction.amount / 100),
    ].join(' '),
  )
  return haystack.includes(needle)
}

function parseAmount(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function inAmountRange(transaction: LedgerTransaction, min: number | null, max: number | null): boolean {
  const yuan = Math.abs(transaction.amount) / 100
  if (min !== null && yuan < min) return false
  if (max !== null && yuan > max) return false
  return true
}

export function filterTransactions(ledger: Ledger, filters: TransactionFilters): LedgerTransaction[] {
  const min = parseAmount(filters.advanced.amountMin)
  const max = parseAmount(filters.advanced.amountMax)
  const rootCategoryId = filters.advanced.categoryId

  return ledger.transactions.filter((transaction) => {
    if (filters.type !== 'all' && transaction.type !== filters.type) return false
    if (filters.advanced.accountId && transaction.accountId !== filters.advanced.accountId) return false
    if (rootCategoryId && getCategoryRootId(ledger, transaction.categoryId) !== rootCategoryId) return false
    if (filters.advanced.dateFrom && transaction.date < filters.advanced.dateFrom) return false
    if (filters.advanced.dateTo && transaction.date > filters.advanced.dateTo) return false
    if (!inAmountRange(transaction, min, max)) return false
    return matchesQuery(ledger, transaction, filters.query)
  })
}

export function transactionNet(transaction: LedgerTransaction): number {
  if (transaction.type === 'income' || transaction.type === 'refund') return Math.abs(transaction.amount)
  if (transaction.type === 'expense') return -Math.abs(transaction.amount)
  if (transaction.type === 'adjustment') return transaction.amount
  return 0
}

export function summarizeTransactions(transactions: readonly LedgerTransaction[]): TransactionTotals {
  let income = 0
  let expense = 0
  for (const transaction of transactions) {
    if (transaction.type === 'income' || transaction.type === 'refund') income += Math.abs(transaction.amount)
    if (transaction.type === 'expense') expense += Math.abs(transaction.amount)
    if (transaction.type === 'adjustment' && transaction.amount > 0) income += transaction.amount
    if (transaction.type === 'adjustment' && transaction.amount < 0) expense += -transaction.amount
  }
  return { count: transactions.length, income, expense, net: income - expense }
}

export function groupTransactions(
  transactions: readonly LedgerTransaction[],
  today = TODAY,
): GroupedTransactions[] {
  const base = groupRecentTransactions([...transactions], transactions.length, today)
  return base.map((group) => {
    const totals = summarizeTransactions(group.items)
    return { ...group, net: totals.net, income: totals.income, expense: totals.expense }
  })
}

export function signedMinorText(value: number): string {
  if (value === 0) return formatCurrency(minor(0))
  const sign = value > 0 ? '+' : '−'
  return `${sign}${formatCurrency(minor(Math.abs(value)))}`
}

export function filterChips(ledger: Ledger, filters: TransactionFilters): FilterChip[] {
  const chips: FilterChip[] = []
  if (filters.type !== 'all') {
    const option = TYPE_OPTIONS.find((item) => item.value === filters.type)
    chips.push({ key: 'type', label: `类型：${option?.label ?? filters.type}` })
  }
  if (filters.advanced.accountId) {
    const account = getAccount(ledger, filters.advanced.accountId)
    chips.push({ key: 'account', label: `账户：${account?.name ?? '未知账户'}` })
  }
  if (filters.advanced.categoryId) {
    const category = getCategoryName(ledger, filters.advanced.categoryId)
    chips.push({ key: 'category', label: `分类：${category}` })
  }
  const min = filters.advanced.amountMin.trim()
  const max = filters.advanced.amountMax.trim()
  if (min || max) {
    chips.push({ key: 'amount', label: `金额：${min ? `¥${min}` : '不限'}–${max ? `¥${max}` : '不限'}` })
  }
  const from = filters.advanced.dateFrom
  const to = filters.advanced.dateTo
  if (from || to) {
    chips.push({ key: 'date', label: `日期：${from || '不限'}–${to || '不限'}` })
  }
  return chips
}

