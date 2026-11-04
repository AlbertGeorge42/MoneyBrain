import type { Account, Category, Transaction, TransactionFilters, TxType, TypeFilter } from './types'

const AMOUNT_FORMAT = new Intl.NumberFormat('zh-CN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export const TYPE_OPTIONS: Array<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
  { value: 'refund', label: '退款' },
  { value: 'adjust', label: '调整' },
]

export const TYPE_LABELS: Record<TxType, string> = {
  expense: '支出',
  income: '收入',
  transfer: '转账',
  refund: '退款',
  adjust: '调整',
}

export function formatAmount(amount: number): string {
  const sign = amount < 0 ? '−' : amount > 0 ? '+' : ''
  return `${sign}¥${AMOUNT_FORMAT.format(Math.abs(amount))}`
}

export function formatUnsigned(amount: number): string {
  return `¥${AMOUNT_FORMAT.format(Math.abs(amount))}`
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

export function categoryName(category: Category | undefined, fallback: string): string {
  return category?.name ?? fallback
}

export function accountName(account: Account | undefined, fallback: string): string {
  return account?.name ?? fallback
}

export function txTitle(tx: Transaction, category: Category | undefined): string {
  return `${categoryName(category, tx.categoryId)} · ${tx.subcategory}`
}

export function txTone(tx: Transaction): 'income' | 'expense' | 'transfer' | 'neutral' {
  if (tx.type === 'income' || tx.type === 'refund') return 'income'
  if (tx.type === 'transfer') return 'transfer'
  if (tx.type === 'adjust') return tx.amount >= 0 ? 'income' : 'expense'
  return 'expense'
}

export function parseDate(date: string): Date {
  return new Date(`${date}T00:00:00`)
}

export function formatFullDate(date: string): string {
  return toIsoDate(parseDate(date))
}

function toIsoDate(parsed: Date): string {
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
}

export function formatShortDate(date: string): string {
  const parsed = parseDate(date)
  return `${parsed.getMonth() + 1}月${parsed.getDate()}日`
}

export function dayLabel(date: string, today: string): string {
  const parsed = parseDate(date)
  const weekday = WEEKDAYS[parsed.getDay()]
  if (date === today) return `今天 · ${formatShortDate(date)} ${weekday}`
  const previous = parseDate(today)
  previous.setDate(previous.getDate() - 1)
  if (date === toIsoDate(previous)) {
    return `昨天 · ${formatShortDate(date)} ${weekday}`
  }
  return `${formatShortDate(date)} ${weekday}`
}

export function filterTransactions(
  items: Transaction[],
  filters: TransactionFilters,
  accounts: Account[],
  categories: Category[],
): Transaction[] {
  const query = filters.query.trim().toLowerCase()

  return items.filter((tx) => {
    if (filters.type !== 'all' && tx.type !== filters.type) return false
    if (filters.accountId && tx.accountId !== filters.accountId && tx.toAccountId !== filters.accountId) return false
    if (filters.categoryId && tx.categoryId !== filters.categoryId) return false
    if (filters.min !== null && Math.abs(tx.amount) < filters.min) return false
    if (filters.max !== null && Math.abs(tx.amount) > filters.max) return false
    if (filters.from && tx.date < filters.from) return false
    if (filters.to && tx.date > filters.to) return false
    if (!query) return true

    const account = accounts.find((item) => item.id === tx.accountId)
    const category = categories.find((item) => item.id === tx.categoryId)
    const haystack = [
      tx.note,
      tx.subcategory,
      category?.name ?? '',
      account?.name ?? '',
      TYPE_LABELS[tx.type],
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
}

export interface DayGroup {
  date: string
  label: string
  subtotal: number
  items: Transaction[]
}

export function groupTransactionsByDay(items: Transaction[], today: string): DayGroup[] {
  const groups = new Map<string, Transaction[]>()
  for (const tx of items) {
    const bucket = groups.get(tx.date) ?? []
    bucket.push(tx)
    groups.set(tx.date, bucket)
  }

  return [...groups.entries()]
    .sort(([left], [right]) => (left < right ? 1 : -1))
    .map(([date, dayItems]) => ({
      date,
      label: dayLabel(date, today),
      subtotal: dayItems
        .filter((tx) => tx.type !== 'transfer')
        .reduce((sum, tx) => sum + tx.amount, 0),
      items: dayItems,
    }))
}

export interface TransactionSummary {
  count: number
  income: number
  expense: number
  net: number
}

export function summarize(items: Transaction[]): TransactionSummary {
  let income = 0
  let expense = 0

  for (const tx of items) {
    if (tx.type === 'transfer') continue
    if (tx.amount >= 0) income += tx.amount
    else expense += Math.abs(tx.amount)
  }

  return { count: items.length, income, expense, net: income - expense }
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Boolean(
    filters.query.trim() ||
      filters.type !== 'all' ||
      filters.accountId ||
      filters.categoryId ||
      filters.min !== null ||
      filters.max !== null ||
      filters.from ||
      filters.to,
  )
}
