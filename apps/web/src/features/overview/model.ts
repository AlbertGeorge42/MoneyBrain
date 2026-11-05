/**
 * 总览页数据模型（HF 预览）
 *
 * 金额一律为整数分（Minor），展示层再经 formatCurrency 转换。
 * 本模块全部为纯函数，便于单测覆盖数字计算与账本联动。
 */

export type TxType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'
export type AccountKind = 'cash' | 'deposit' | 'investment' | 'credit'
export type BudgetPeriod = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface LedgerAccount {
  id: string
  name: string
  kind: AccountKind
  balance: number
}

export interface LedgerCategory {
  id: string
  name: string
  type: TxType
  parentId?: string
}

export interface LedgerBudget {
  id: string
  name: string
  type: TxType
  period: BudgetPeriod
  limit: number
  categoryId?: string
  accountId?: string
}

export interface LedgerTransaction {
  id: string
  date: string
  type: TxType
  categoryId: string
  note: string
  accountId: string
  amount: number
  toAccountId?: string
  fee?: number
}

export interface Ledger {
  accounts: LedgerAccount[]
  categories: LedgerCategory[]
  budgets: LedgerBudget[]
  transactions: LedgerTransaction[]
}

export const TODAY = '2026-10-28'
export const CURRENT_MONTH = '2026-10'
export const CURRENT_MONTH_LABEL = '2026 年 10 月'
export const ELAPSED_DAYS = 28

const PREVIOUS_INCOME = 1_721_700
const PREVIOUS_EXPENSE = 727_850
const PREVIOUS_NET_WORTH = 13_390_000

export interface OverviewSummary {
  netWorth: number
  previousNetWorth: number
  netWorthChangePct: number
  liquidAssets: number
  investmentAssets: number
  income: number
  expense: number
  balance: number
  savingsRate: number
  incomeChangePct: number
  expenseChangePct: number
  elapsedDays: number
}

export interface TrendPoint {
  month: string
  value: number
}

const TREND_BASE: TrendPoint[] = [
  { month: '2025-11', value: 10_850_000 },
  { month: '2025-12', value: 11_120_000 },
  { month: '2026-01', value: 11_480_000 },
  { month: '2026-02', value: 11_230_000 },
  { month: '2026-03', value: 11_690_000 },
  { month: '2026-04', value: 12_050_000 },
  { month: '2026-05', value: 11_880_000 },
  { month: '2026-06', value: 12_340_000 },
  { month: '2026-07', value: 12_710_000 },
  { month: '2026-08', value: 13_090_000 },
  { month: '2026-09', value: PREVIOUS_NET_WORTH },
  { month: CURRENT_MONTH, value: PREVIOUS_NET_WORTH },
]

/** 走势最后一点始终与当前净资产联动；记账后曲线末端随净值变化。 */
export function deriveNetWorthTrend(netWorth: number): TrendPoint[] {
  return TREND_BASE.map((point, index) =>
    index === TREND_BASE.length - 1 ? { ...point, value: netWorth } : { ...point },
  )
}

export interface BudgetRow {
  id: string
  name: string
  used: number
  limit: number
  percent: number
  level: 'normal' | 'warning' | 'over'
}

export interface BudgetSummary {
  rows: BudgetRow[]
  used: number
  limit: number
  percent: number
}

export interface RecentGroup {
  date: string
  label: string
  items: LedgerTransaction[]
}

export interface NewTransactionInput {
  type: TxType
  categoryId: string
  accountId: string
  toAccountId?: string
  amount: number
  note: string
  date?: string
  fee?: number
}

const SEED_ACCOUNTS: LedgerAccount[] = [
  { id: 'cmb', name: '招商储蓄卡', kind: 'deposit', balance: 4_823_055 },
  { id: 'wx', name: '微信零钱', kind: 'cash', balance: 128_620 },
  { id: 'zfb', name: '支付宝', kind: 'cash', balance: 354_000 },
  { id: 'xyk', name: '交行信用卡', kind: 'credit', balance: -211_840 },
  { id: 'brk', name: '长桥证券', kind: 'investment', balance: 8_645_000 },
]

const SEED_CATEGORIES: LedgerCategory[] = [
  { id: 'food', name: '餐饮', type: 'expense' },
  { id: 'food_lunch', name: '午餐', type: 'expense', parentId: 'food' },
  { id: 'food_takeout', name: '外食', type: 'expense', parentId: 'food' },
  { id: 'traffic', name: '交通', type: 'expense' },
  { id: 'home', name: '居住', type: 'expense' },
  { id: 'shop', name: '购物', type: 'expense' },
  { id: 'shop_daily', name: '日用', type: 'expense', parentId: 'shop' },
  { id: 'shop_cloth', name: '服饰', type: 'expense', parentId: 'shop' },
  { id: 'fun', name: '娱乐', type: 'expense' },
  { id: 'health', name: '医疗', type: 'expense' },
  { id: 'edu', name: '教育', type: 'expense' },
  { id: 'other', name: '其他', type: 'expense' },
  { id: 'salary', name: '工资', type: 'income' },
  { id: 'inv', name: '理财收益', type: 'income' },
  { id: 'gift', name: '红包', type: 'income' },
  { id: 'refund', name: '退款', type: 'refund' },
  { id: 'move', name: '账户互转', type: 'transfer' },
]

const SEED_BUDGETS: LedgerBudget[] = [
  { id: 'b_food', name: '餐饮', type: 'expense', period: 'monthly', limit: 150_000, categoryId: 'food', accountId: 'cmb' },
  { id: 'b_home', name: '居住', type: 'expense', period: 'monthly', limit: 560_000, categoryId: 'home', accountId: 'cmb' },
  { id: 'b_shop', name: '购物', type: 'expense', period: 'monthly', limit: 80_000, categoryId: 'shop', accountId: 'cmb' },
  { id: 'b_fun', name: '娱乐', type: 'expense', period: 'monthly', limit: 30_000, categoryId: 'fun', accountId: 'zfb' },
  { id: 'b_traffic', name: '交通', type: 'expense', period: 'weekly', limit: 10_000, categoryId: 'traffic', accountId: 'wx' },
  { id: 'b_edu', name: '教育', type: 'expense', period: 'yearly', limit: 200_000, categoryId: 'edu', accountId: 'zfb' },
]

const SEED_TRANSACTIONS: LedgerTransaction[] = [
  {
    id: 't1', date: '2026-10-28', type: 'expense', categoryId: 'food_lunch',
    note: '公司食堂', accountId: 'wx', amount: 2_800,
  },
  {
    id: 't2', date: '2026-10-28', type: 'expense', categoryId: 'traffic',
    note: '地铁通勤', accountId: 'wx', amount: 600,
  },
  {
    id: 't3', date: '2026-10-27', type: 'expense', categoryId: 'shop_daily',
    note: '山姆会员商店', accountId: 'cmb', amount: 32_860,
  },
  {
    id: 't4', date: '2026-10-27', type: 'transfer', categoryId: 'move',
    note: '转入证券账户', accountId: 'cmb', toAccountId: 'brk', amount: 500_000, fee: 200,
  },
  {
    id: 't5', date: '2026-10-26', type: 'income', categoryId: 'salary',
    note: '十月工资', accountId: 'cmb', amount: 1_850_000,
  },
  {
    id: 't6', date: '2026-10-25', type: 'expense', categoryId: 'fun',
    note: '电影《沙丘 3》', accountId: 'zfb', amount: 7_900,
  },
  {
    id: 't7', date: '2026-10-24', type: 'refund', categoryId: 'refund',
    note: '退货·保温杯', accountId: 'wx', amount: 12_900,
  },
  {
    id: 't8', date: '2026-10-23', type: 'expense', categoryId: 'home',
    note: '十月房租', accountId: 'cmb', amount: 560_000,
  },
  {
    id: 't9', date: '2026-10-22', type: 'expense', categoryId: 'health',
    note: '药店·感冒药', accountId: 'zfb', amount: 4_650,
  },
  {
    id: 't10', date: '2026-10-20', type: 'adjustment', categoryId: 'other',
    note: '对账修正', accountId: 'wx', amount: -240,
  },
  {
    id: 't11', date: '2026-10-18', type: 'expense', categoryId: 'food_takeout',
    note: '周末火锅', accountId: 'cmb', amount: 28_600,
  },
  {
    id: 't12', date: '2026-10-15', type: 'expense', categoryId: 'edu',
    note: '得到年度课程', accountId: 'zfb', amount: 19_900,
  },
  {
    id: 't13', date: '2026-10-05', type: 'expense', categoryId: 'shop_daily',
    note: '山姆月度采购', accountId: 'cmb', amount: 92_860,
  },
]

export function createSeedLedger(): Ledger {
  return {
    accounts: SEED_ACCOUNTS.map((account) => ({ ...account })),
    categories: SEED_CATEGORIES.map((category) => ({ ...category })),
    budgets: SEED_BUDGETS.map((budget) => ({ ...budget })),
    transactions: SEED_TRANSACTIONS.map((transaction) => ({ ...transaction })),
  }
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

function sumMonthFlow(transactions: LedgerTransaction[]) {
  let income = 0
  let expense = 0
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(CURRENT_MONTH)) continue
    if (transaction.type === 'income' || transaction.type === 'refund') income += transaction.amount
    if (transaction.type === 'expense') expense += transaction.amount
    if (transaction.type === 'adjustment' && transaction.amount < 0) expense += -transaction.amount
  }
  return { income, expense }
}

export function deriveOverview(ledger: Ledger): OverviewSummary {
  const netWorth = ledger.accounts.reduce((total, account) => total + account.balance, 0)
  const liquidAssets = ledger.accounts
    .filter((account) => account.kind === 'cash')
    .reduce((total, account) => total + account.balance, 0)
  const investmentAssets = ledger.accounts
    .filter((account) => account.kind === 'investment')
    .reduce((total, account) => total + account.balance, 0)
  const { income, expense } = sumMonthFlow(ledger.transactions)
  const balance = income - expense

  return {
    netWorth,
    previousNetWorth: PREVIOUS_NET_WORTH,
    netWorthChangePct: percentChange(netWorth, PREVIOUS_NET_WORTH),
    liquidAssets,
    investmentAssets,
    income,
    expense,
    balance,
    savingsRate: income === 0 ? 0 : (balance / income) * 100,
    incomeChangePct: percentChange(income, PREVIOUS_INCOME),
    expenseChangePct: percentChange(expense, PREVIOUS_EXPENSE),
    elapsedDays: ELAPSED_DAYS,
  }
}

function parseDay(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function budgetRange(period: BudgetPeriod, today: string): { start: string; end: string } {
  const anchor = parseDay(today)
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()

  switch (period) {
    case 'weekly': {
      const start = new Date(anchor)
      start.setUTCDate(start.getUTCDate() - 6)
      return { start: formatDay(start), end: today }
    }
    case 'monthly':
      return {
        start: formatDay(new Date(Date.UTC(year, month, 1))),
        end: formatDay(new Date(Date.UTC(year, month + 1, 0))),
      }
    case 'quarterly': {
      const quarterStart = Math.floor(month / 3) * 3
      return {
        start: formatDay(new Date(Date.UTC(year, quarterStart, 1))),
        end: formatDay(new Date(Date.UTC(year, quarterStart + 3, 0))),
      }
    }
    case 'yearly':
      return {
        start: formatDay(new Date(Date.UTC(year, 0, 1))),
        end: formatDay(new Date(Date.UTC(year, 11, 31))),
      }
  }
}

function categorySubtree(categories: LedgerCategory[], rootId: string): Set<string> {
  const ids = new Set<string>([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const category of categories) {
      if (category.parentId && ids.has(category.parentId) && !ids.has(category.id)) {
        ids.add(category.id)
        changed = true
      }
    }
  }
  return ids
}

function budgetLevel(percent: number): BudgetRow['level'] {
  if (percent > 100) return 'over'
  if (percent >= 80) return 'warning'
  return 'normal'
}

export function deriveBudgets(ledger: Ledger, today = TODAY): BudgetSummary {
  const expenseBudgets = ledger.budgets.filter((budget) => budget.type === 'expense')

  const rows = expenseBudgets.map((budget) => {
    const range = budgetRange(budget.period, today)
    const categoryIds = budget.categoryId
      ? categorySubtree(ledger.categories, budget.categoryId)
      : undefined
    const used = ledger.transactions
      .filter((transaction) => {
        if (transaction.type !== 'expense') return false
        if (transaction.date < range.start || transaction.date > range.end) return false
        if (categoryIds && !categoryIds.has(transaction.categoryId)) return false
        if (budget.accountId && transaction.accountId !== budget.accountId) return false
        return true
      })
      .reduce((total, transaction) => total + transaction.amount, 0)
    const percent = budget.limit === 0 ? 0 : (used / budget.limit) * 100
    return {
      id: budget.id,
      name: budget.name,
      used,
      limit: budget.limit,
      percent,
      level: budgetLevel(percent),
    }
  })

  const used = rows.reduce((total, row) => total + row.used, 0)
  const limit = rows.reduce((total, row) => total + row.limit, 0)

  return {
    rows,
    used,
    limit,
    percent: limit === 0 ? 0 : (used / limit) * 100,
  }
}

const WEEK_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function recentDateLabel(date: string, today: string): string {
  const parsed = parseDay(date)
  const month = parsed.getUTCMonth() + 1
  const day = parsed.getUTCDate()
  const weekday = WEEK_LABELS[parsed.getUTCDay()]
  const prefix = date === today ? '今天 · ' : ''
  return `${prefix}${month}月${day}日 ${weekday}`
}

export function formatDateLabel(date: string): string {
  return recentDateLabel(date, '')
}

export function groupRecentTransactions(
  transactions: LedgerTransaction[],
  limit: number,
  today = TODAY,
): RecentGroup[] {
  const sorted = [...transactions].sort((left, right) => right.date.localeCompare(left.date)).slice(0, limit)
  const groups: RecentGroup[] = []
  for (const transaction of sorted) {
    const last = groups[groups.length - 1]
    if (last && last.date === transaction.date) {
      last.items.push(transaction)
      continue
    }
    groups.push({
      date: transaction.date,
      label: recentDateLabel(transaction.date, today),
      items: [transaction],
    })
  }
  return groups
}

export function getAccount(ledger: Ledger, accountId: string): LedgerAccount | undefined {
  return ledger.accounts.find((account) => account.id === accountId)
}

export function getCategory(ledger: Ledger, categoryId: string): LedgerCategory | undefined {
  return ledger.categories.find((category) => category.id === categoryId)
}

export function getCategoryName(ledger: Ledger, categoryId: string): string {
  return getCategory(ledger, categoryId)?.name ?? '未分类'
}

export function getCategoryRootId(ledger: Ledger, categoryId: string): string {
  let current = getCategory(ledger, categoryId)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id)
    current = getCategory(ledger, current.parentId)
  }
  return current?.id ?? categoryId
}

export function accountKindLabel(kind: AccountKind): string {
  switch (kind) {
    case 'cash':
      return '现金等价'
    case 'deposit':
      return '储蓄'
    case 'investment':
      return '投资'
    case 'credit':
      return '信用'
  }
}

export function transactionTone(transaction: LedgerTransaction): 'income' | 'expense' | 'transfer' {
  if (transaction.type === 'income' || transaction.type === 'refund') return 'income'
  if (transaction.type === 'expense') return 'expense'
  if (transaction.type === 'adjustment') return transaction.amount < 0 ? 'expense' : 'income'
  return 'transfer'
}

export function transactionDirection(transaction: LedgerTransaction): string {
  switch (transaction.type) {
    case 'income':
      return '收入'
    case 'refund':
      return '退款'
    case 'expense':
      return '支出'
    case 'transfer':
      return '转账'
    case 'adjustment':
      return transaction.amount < 0 ? '调减' : '调增'
  }
}

export function addTransaction(ledger: Ledger, input: NewTransactionInput): Ledger {
  const magnitude = Math.round(Math.abs(input.amount))
  if (magnitude <= 0) return ledger

  const signed = input.type === 'adjustment' ? Math.round(input.amount) : magnitude
  const fee = input.fee && input.fee > 0 ? Math.round(input.fee) : 0

  const accounts = ledger.accounts.map((account) => {
    if (input.type === 'transfer') {
      if (account.id === input.accountId) return { ...account, balance: account.balance - magnitude - fee }
      if (account.id === input.toAccountId) return { ...account, balance: account.balance + magnitude }
      return account
    }
    if (account.id !== input.accountId) return account
    const delta =
      input.type === 'expense' ? -magnitude : input.type === 'adjustment' ? signed : magnitude
    return { ...account, balance: account.balance + delta }
  })

  const nextNumber = ledger.transactions.reduce((max, transaction) => {
    const numeric = Number(transaction.id.replace(/\D/g, ''))
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max
  }, 0)

  const transaction: LedgerTransaction = {
    id: `t${nextNumber + 1}`,
    date: input.date || TODAY,
    type: input.type,
    categoryId: input.categoryId,
    note: input.note.trim() || '未填写备注',
    accountId: input.accountId,
    amount: signed,
    ...(input.type === 'transfer'
      ? {
          toAccountId:
            input.toAccountId ||
            ledger.accounts.find((account) => account.id !== input.accountId)?.id,
          fee,
        }
      : {}),
  }

  return {
    ...ledger,
    accounts,
    transactions: [transaction, ...ledger.transactions],
  }
}
