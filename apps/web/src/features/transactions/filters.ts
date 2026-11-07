/**
 * 流水页筛选与分组（纯函数）
 *
 * 搜索覆盖备注 / 账户 / 分类 / 方向（与服务端一致，不搜金额文本——金额有独立区间筛选）；
 * 高级筛选按账户、分类根节点、金额区间、日期区间取交集。列表分组沿用总览的日期标签口径，另补每组合计。
 */
import { minor } from '@domain/index'
import { formatCurrency } from '@/utils/format'
import {
  formatDateLabel,
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
  /** 账户分组 id（后端 AccountCategory）；只收窄账户范围，不参与任何合计。 */
  groupId: string
  categoryId: string
  /** 报表合并「其他」下钻时一次筛多个根分类；普通筛选留空。 */
  categoryIds: string[]
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

/** 账户分组筛选取直接挂在该一级分类下的账户。 */
export function accountIdsInGroup(ledger: Ledger, groupId: string): string[] {
  return ledger.accounts
    .filter((account) => account.categoryId === groupId)
    .map((account) => account.id)
}

export const EMPTY_ADVANCED: AdvancedFilters = {
  accountId: '',
  groupId: '',
  categoryId: '',
  categoryIds: [],
  amountMin: '',
  amountMax: '',
  dateFrom: '',
  dateTo: '',
}

/** 起止反选时自动交换，避免生成「起 11-05 ~ 止 11-01」这种必然返回 0 行的区间。 */
export function normalizeDateRange(advanced: AdvancedFilters): AdvancedFilters {
  const { dateFrom, dateTo } = advanced
  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { ...advanced, dateFrom: dateTo, dateTo: dateFrom }
  }
  return advanced
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
  /** 未来分组按笔数展示（见 groupTransactions）。 */
  future?: boolean
}

export interface TransactionTotals {
  count: number
  income: number
  expense: number
  net: number
}

export interface FilterChip {
  key: 'type' | 'account' | 'group' | 'category' | 'amount' | 'date'
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
  // 与服务端口径一致：关键词只搜文本（备注 / 账户 / 分类 / 方向），不搜金额。
  // 金额有独立区间筛选（amountMin/amountMax），若在这里额外匹配金额文本，
  // 同一关键词在种子版与 API 版会返回不同结果。
  const haystack = normalize(
    [
      transaction.note,
      account?.name ?? '',
      category,
      transactionDirection(transaction),
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
  const rootCategoryIds = filters.advanced.categoryIds
  // 分组筛选：把分组翻译成账户集合，再按账户收窄；不改变任何金额口径。
  const groupAccountIds = filters.advanced.groupId
    ? new Set(accountIdsInGroup(ledger, filters.advanced.groupId))
    : null

  return ledger.transactions.filter((transaction) => {
    if (filters.type !== 'all' && transaction.type !== filters.type) return false
    if (filters.advanced.accountId && transaction.accountId !== filters.advanced.accountId) return false
    if (groupAccountIds && !groupAccountIds.has(transaction.accountId)) return false
    const rootId = getCategoryRootId(ledger, transaction.categoryId)
    if (rootCategoryIds.length > 0) {
      if (!rootCategoryIds.includes(rootId)) return false
    } else if (rootCategoryId && rootId !== rootCategoryId) {
      return false
    }
    if (filters.advanced.dateFrom && transaction.date < filters.advanced.dateFrom) return false
    if (filters.advanced.dateTo && transaction.date > filters.advanced.dateTo) return false
    if (!inAmountRange(transaction, min, max)) return false
    return matchesQuery(ledger, transaction, filters.query)
  })
}

export interface SummarizeOptions {
  /** 默认排除标了「不计收支」的交易；true = 全貌口径（含它们）。 */
  includeExcluded?: boolean
}

export function summarizeTransactions(
  transactions: readonly LedgerTransaction[],
  options: SummarizeOptions = {},
): TransactionTotals {
  let income = 0
  let expense = 0
  for (const transaction of transactions) {
    if (!options.includeExcluded && transaction.excludeFromIncomeExpense) continue
    if (transaction.type === 'income' || transaction.type === 'refund') income += Math.abs(transaction.amount)
    if (transaction.type === 'expense') expense += Math.abs(transaction.amount)
    // 平账（adjustment）只修正账户余额，不属于收入/支出，绝不进流水页合计。
  }
  // 笔数始终是当前筛选结果的完整条数；开关只改金额口径，不改列表内容。
  return { count: transactions.length, income, expense, net: income - expense }
}

/**
 * 未来记录（date > 今天）不计入任何「本月」合计：
 * 当前期间单独汇总；未来记录在列表内以「未来」分组呈现。
 */
export function splitTotalsByToday(
  transactions: readonly LedgerTransaction[],
  today = TODAY,
  options: SummarizeOptions = {},
): { current: TransactionTotals; future: TransactionTotals } {
  const current: LedgerTransaction[] = []
  const future: LedgerTransaction[] = []
  for (const transaction of transactions) {
    if (transaction.date > today) future.push(transaction)
    else current.push(transaction)
  }
  return {
    current: summarizeTransactions(current, options),
    future: summarizeTransactions(future, options),
  }
}

export function groupTransactions(
  transactions: readonly LedgerTransaction[],
  today = TODAY,
): GroupedTransactions[] {
  const base = groupRecentTransactions([...transactions], transactions.length, today)
  const groups: GroupedTransactions[] = []

  for (const group of base) {
    // 分组小计是「当天资金变动」：含不计收支标记，保证与列表金额自洽。
    const totals = summarizeTransactions(group.items, { includeExcluded: true })
    const summary = { net: totals.net, income: totals.income, expense: totals.expense }
    // 未来记录合并成一个组时，组头只标第一笔的日期，跨天/跨年会误读成同一天。
    // 按各笔自己的日期拆组，组头带年份与星期。
    if (group.date === 'future') {
      const byDate = new Map<string, LedgerTransaction[]>()
      for (const transaction of group.items) {
        const items = byDate.get(transaction.date) ?? []
        items.push(transaction)
        byDate.set(transaction.date, items)
      }
      for (const [date, items] of byDate) {
        const dayTotals = summarizeTransactions(items, { includeExcluded: true })
        groups.push({
          date,
          label: `未来 · ${formatDateLabel(date)}`,
          items,
          net: dayTotals.net,
          income: dayTotals.income,
          expense: dayTotals.expense,
          future: true,
        })
      }
      continue
    }
    groups.push({ ...group, ...summary })
  }

  return groups
}

export function signedMinorText(value: number): string {
  if (value === 0) return formatCurrency(minor(0))
  const sign = value > 0 ? '+' : '−'
  return `${sign}${formatCurrency(minor(Math.abs(value)))}`
}

/** 流水筛选写入 URL 的键名；返回列表或深链跳转都靠这组键还原上下文。 */
export const FILTER_QUERY_KEYS = [
  'txQ',
  'txType',
  'txAccount',
  'txGroup',
  'txCategory',
  'txRoots',
  'txFrom',
  'txTo',
  'txAmin',
  'txAmax',
] as const

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const AMOUNT_INPUT = /^\d+(\.\d{0,2})?$/

export interface FilterUrlRestore {
  filters: TransactionFilters
  /** 未能还原的条件，用于页面显式提示，而不是静默清空。 */
  dropped: string[]
}

export function readFiltersFromSearch(search: string, ledger: Ledger): FilterUrlRestore {
  const params = new URLSearchParams(search)
  const dropped: string[] = []
  const advanced: AdvancedFilters = { ...EMPTY_ADVANCED, categoryIds: [] }

  const rawType = params.get('txType')
  let type: TypeFilter = 'all'
  if (rawType) {
    if (TYPE_OPTIONS.some((option) => option.value === rawType)) type = rawType as TypeFilter
    else dropped.push('类型')
  }

  const accountId = params.get('txAccount') ?? ''
  if (accountId) {
    if (ledger.accounts.some((account) => account.id === accountId)) advanced.accountId = accountId
    else dropped.push('账户')
  }

  const groupId = params.get('txGroup') ?? ''
  if (groupId) {
    if ((ledger.accountCategories ?? []).some((group) => group.id === groupId)) {
      advanced.groupId = groupId
    } else dropped.push('账户分组')
  }

  const categoryId = params.get('txCategory') ?? ''
  if (categoryId) {
    if (ledger.categories.some((category) => category.id === categoryId)) advanced.categoryId = categoryId
    else dropped.push('分类')
  }

  const roots = params.get('txRoots') ?? ''
  if (roots) {
    const ids = roots.split(',').filter(Boolean)
    const valid = ids.filter((id) => ledger.categories.some((category) => category.id === id))
    if (valid.length > 0) advanced.categoryIds = valid
    if (valid.length !== ids.length) dropped.push('合并分类')
  }

  for (const [key, field, label] of [
    ['txFrom', 'dateFrom', '起始日期'],
    ['txTo', 'dateTo', '结束日期'],
  ] as const) {
    const value = params.get(key) ?? ''
    if (!value) continue
    if (ISO_DATE.test(value)) advanced[field] = value
    else dropped.push(label)
  }

  for (const [key, field, label] of [
    ['txAmin', 'amountMin', '最小金额'],
    ['txAmax', 'amountMax', '最大金额'],
  ] as const) {
    const value = params.get(key) ?? ''
    if (!value) continue
    if (AMOUNT_INPUT.test(value)) advanced[field] = value
    else dropped.push(label)
  }

  return {
    filters: { query: params.get('txQ') ?? '', type, advanced: normalizeDateRange(advanced) },
    dropped,
  }
}

/** 只覆盖本页键，保留预览壳的 page/device/state 等无关参数。 */
export function writeFiltersToSearch(search: string, filters: TransactionFilters): string {
  const params = new URLSearchParams(search)
  FILTER_QUERY_KEYS.forEach((key) => params.delete(key))

  if (filters.query.trim()) params.set('txQ', filters.query)
  if (filters.type !== 'all') params.set('txType', filters.type)
  if (filters.advanced.accountId) params.set('txAccount', filters.advanced.accountId)
  if (filters.advanced.groupId) params.set('txGroup', filters.advanced.groupId)
  if (filters.advanced.categoryId) params.set('txCategory', filters.advanced.categoryId)
  if (filters.advanced.categoryIds.length > 0) {
    params.set('txRoots', filters.advanced.categoryIds.join(','))
  }
  if (filters.advanced.dateFrom) params.set('txFrom', filters.advanced.dateFrom)
  if (filters.advanced.dateTo) params.set('txTo', filters.advanced.dateTo)
  if (filters.advanced.amountMin.trim()) params.set('txAmin', filters.advanced.amountMin.trim())
  if (filters.advanced.amountMax.trim()) params.set('txAmax', filters.advanced.amountMax.trim())

  const serialized = params.toString()
  return serialized ? `?${serialized}` : ''
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return (
    filters.query.trim() !== '' ||
    filters.type !== 'all' ||
    (filters.advanced.accountId !== '' ||
      filters.advanced.groupId !== '' ||
      filters.advanced.categoryId !== '' ||
      filters.advanced.categoryIds.length > 0 ||
      filters.advanced.amountMin !== '' ||
      filters.advanced.amountMax !== '' ||
      filters.advanced.dateFrom !== '' ||
      filters.advanced.dateTo !== '')
  )
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
  if (filters.advanced.groupId) {
    const groups = ledger.accountCategories ?? []
    const group = groups.find((item) => item.id === filters.advanced.groupId)
    const duplicated = group
      ? groups.filter((item) => item.name === group.name).length > 1
      : false
    chips.push({
      key: 'group',
      label: `分组：${group?.name ?? '未知分组'}${
        group && duplicated ? ` · #${group.id.slice(-4)}` : ''
      }`,
    })
  }
  if (filters.advanced.categoryIds.length > 0) {
    const names = filters.advanced.categoryIds
      .map((id) => getCategoryName(ledger, id))
      .filter(Boolean)
      .join(' / ')
    chips.push({ key: 'category', label: `分类：其他（含${names}）` })
  } else if (filters.advanced.categoryId) {
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
    // 与控件、URL、请求参数同一口径：YYYY-MM-DD，不再出现 yyyy/mm/dd 混用。
    chips.push({ key: 'date', label: `日期：${from || '不限'}–${to || '不限'}` })
  }
  return chips
}

