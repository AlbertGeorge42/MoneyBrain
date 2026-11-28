/**
 * 总览页数据模型（HF 预览）
 *
 * 金额一律为整数分（Minor），展示层再经 formatCurrency 转换。
 * 本模块全部为纯函数，便于单测覆盖数字计算与账本联动。
 */

import {
  minor, refundOffsetKind, transferInflow, transferOutflow,
  type CashFlowActivityKey, type Minor,
} from '@domain/index'
import { formatDay, parseDay } from '@/utils/date'

export type TxType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'
export type AccountKind = 'cash' | 'deposit' | 'investment' | 'credit'
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export interface LedgerAccount {
  id: string
  name: string
  kind: AccountKind
  balance: number
  /** 期初余额（分）。 */
  initialBalance?: number
  /** 期初余额的生效日期；晚于报表期间起点时，该账户期初在期中才生效。 */
  initialBalanceDate?: string | null
  /** 所属账户分组（后端 AccountCategory 的真实 id）；null = 未分组。 */
  categoryId?: string | null
  /** 用户设置的受控图标 key；null / 缺省 = 回退到所属分组图标。 */
  iconKey?: string | null
}

/**
 * 账户分组（后端 AccountCategory 的只读投影）。
 *
 * 只用于组织与浏览账户：名称、资产/负债归属、排序。计算口径（现金等价 / 投资）
 * 仍由后端分类标记决定，本投影不参与任何合计。
 */
export interface LedgerAccountCategory {
  id: string
  name: string
  type: 'asset' | 'liability'
  parentId?: string | null
  sort: number
  /** 仅根分类有值的原始配置（子分类为 null）；只供配置展示与迁移提示。 */
  isCashEquivalent?: boolean | null
  isInvestment?: boolean | null
  /** 根继承解析后的有效计算属性；财务计算与账户性质展示一律用这两个字段。 */
  effectiveIsCashEquivalent?: boolean
  effectiveIsInvestment?: boolean
  /** 用户设置的受控图标 key；null / 缺省 = 前端默认图标。 */
  iconKey?: string | null
}

export interface LedgerCategory {
  id: string
  name: string
  type: TxType
  parentId?: string
  /** 仅根分类有值的原始配置（子分类为 null）；只供配置展示。 */
  cashFlowType?: CashFlowActivityKey | null
  /** 根继承解析后的有效活动归属；财务计算一律用这个字段。 */
  effectiveCashFlowType?: CashFlowActivityKey | null
  /** 用户设置的受控图标 key；null / 缺省 = 回退到按名称映射。 */
  iconKey?: string | null
}

export interface LedgerBudget {
  id: string
  name: string
  type: TxType
  period: BudgetPeriod
  limit: number
  categoryId?: string
  accountId?: string
  /** 转账预算的转入账户；后端按「转出 + 转入」这一对账户结算。 */
  toAccountId?: string
  /**
   * 周期内发生日（后端 transactionTime）。语义随周期变化：
   * weekly 0=周一…6=周日；monthly 几号；quarterly/yearly 周期内天偏移；daily 忽略。
   * null / 缺省：monthly/quarterly/yearly 按周期末；weekly 跟随预算起始日同周几。
   */
  transactionTime?: number | null
  /** 后端预算是否启用；总览/预算页头部只合计启用的预算。 */
  isActive?: boolean
  /** API 适配层带入的当期已用金额（来自 /budgets/statuses）。 */
  used?: number
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
  /** 转账优惠券：转入方额外到账金额，与后端 / Domain 的 X / f / c 语义一致。 */
  coupon?: number
  /** 退款关联的原交易 id。 */
  relatedTransactionId?: string
  /** 原交易类型；退款冲减哪一侧由它决定（缺省 = 未关联退款，只影响余额）。 */
  relatedType?: TxType | null
  /** API 适配层带入的原交易（列表/详情直接展示，不额外查库）。 */
  relatedTransaction?: LedgerTransaction
  /** API 适配层带入的有效退款（软删除的不在其中）。 */
  refunds?: LedgerTransaction[]
  /** 原交易已退款合计（API 适配层预计算）。 */
  refundedAmount?: number
  /** 不计收支：仍影响账户余额，但不进收入/支出统计、预算用量。 */
  excludeFromIncomeExpense?: boolean
}

/**
 * 真实 API 接入时由适配层预先算好的快照。
 *
 * 总览的收支、预算、走势在 API 模式下直接采用后端口径，
 * 避免前端本地算法与领域规则（退款冲减、预算账户绑定）出现第二套口径。
 */
interface LedgerSnapshot {
  overview: OverviewSummary
  budgets: BudgetSummary
  trend: TrendPoint[]
  /** 支出趋势与分类构成（API 模式直接取后端聚合，不在前端按流水重算）。 */
  expenseCharts: ExpenseCharts
  /** 真实数据对应的「今天」，用于最近交易分组和预算期间。 */
  today: string
  /** 页头期间文案，例如「2026 年 11 月」。 */
  periodLabel: string
  /** 账本是否已有交易（单值事实，不再靠全量集合推导）。 */
  hasTransactions: boolean
  /** 最新交易日期（单值）。 */
  latestDate: string | null
  /** 锚点月份的流水笔数（单值）。 */
  anchorMonthCount: number
  /** 已有交易的自然月集合（单值摘要），供预算周期条标记可用性。 */
  activeMonths: string[]
  /** 按账户（含转入侧）的交易笔数摘要，供设置页展示；后端分组查询下发。 */
  accountTxCounts: Record<string, number>
  /** 按分类的交易笔数摘要，供设置页展示；后端分组查询下发。 */
  categoryTxCounts: Record<string, number>
  /** 最近若干笔（后端 dashboard 已带，含关联关系）；只供总览最近流水展示。 */
  recentTransactions: LedgerTransaction[]
}

export interface Ledger {
  accounts: LedgerAccount[]
  categories: LedgerCategory[]
  budgets: LedgerBudget[]
  /** 账户分组（由 /account-categories 带入）。 */
  accountCategories?: LedgerAccountCategory[]
  snapshot?: LedgerSnapshot
}

/**
 * 测试账本：在无后端 API 的单测里携带流水数组。
 * 生产 Ledger 绝不含 transactions；此类型仅供测试夹具与纯函数（addTransaction 等）使用。
 */
export interface TestLedger extends Ledger {
  transactions: LedgerTransaction[]
}

/**
 * 纯函数兼容视图：允许测试账本携带 transactions；生产 Ledger 不带该字段，
 * 因此这些函数的生产路径必须走 snapshot 短路，绝不读取 transactions。
 */
export type LedgerForPureFns = Ledger & { transactions?: LedgerTransaction[] }

export const TODAY = '2026-10-28'
export const CURRENT_MONTH = '2026-10'

/** 最新一笔流水的本地日历日；无流水时为 null。 */
export function latestTransactionDate(
  transactions: readonly LedgerTransaction[],
): string | null {
  let latest: string | null = null
  for (const transaction of transactions) {
    if (!latest || transaction.date > latest) latest = transaction.date
  }
  return latest
}

/**
 * 报表 / 预算的期间锚点：今天与最新流水取较晚者。
 *
 * 有未来日期的数据时也不会把用户挡在数据之外。
 */
export function ledgerAnchorDay(ledger: LedgerForPureFns): string {
  const today = ledger.snapshot?.today ?? TODAY
  const latest = ledger.snapshot?.latestDate ?? latestTransactionDate(ledger.transactions ?? [])
  return latest && latest > today ? latest : today
}
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

/** 支出分类构成的一片；id 为后端真实分类 id。 */
export interface ExpenseCategorySlice {
  id: string
  name: string
  amount: number
}

export interface ExpenseCharts {
  /** 近 12 个月净支出（后端按月汇总，退款已冲减）。 */
  trend: TrendPoint[]
  /** 近 12 个月按一级分类的净支出（后端聚合，金额为整数分）。 */
  categories: ExpenseCategorySlice[]
  /** 图表与下钻共用的期间（本地日历日，含首尾）。 */
  range: { from: string; to: string }
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
export function deriveNetWorthTrend(netWorth: number, series?: TrendPoint[]): TrendPoint[] {
  // 真实数据的 12 个月点位来自 /analytics/asset-trend；
  // 最后一点仍与当前净资产联动，保证曲线末端与页头数字一致。
  const base = series && series.length > 0 ? series : TREND_BASE
  return base.map((point, index) =>
    index === base.length - 1 ? { ...point, value: netWorth } : { ...point },
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
  /** 转账优惠券（分）；新建入口暂不提供输入，导入的账本会带此字段。 */
  coupon?: number
  /** 退款可选关联原交易；不填 = 未关联退款（照常记账，只影响余额）。 */
  relatedTransactionId?: string
  /** 不计收支：仍影响余额，但不进收入/支出统计与预算用量。 */
  excludeFromIncomeExpense?: boolean
  /** 平账专属：用户输入的「当前账户余额」（分，可为负 / 0）。填了即走对账接口自动算差额。 */
  actualBalance?: number
}

/**
 * 前端账本的转账三元组 → Domain 的整数分输入。
 *
 * 只做单位/类型归一（前端模型是裸 number，Domain 要 Minor），不写第二套口径；
 * 转出 / 转入金额一律由 Domain 的 transferOutflow / transferInflow 计算。
 */
export function transferAmounts(transaction: {
  amount: number
  fee?: number
  coupon?: number
}): { principal: Minor; fee: Minor; coupon: Minor } {
  return {
    principal: minor(Math.round(Math.abs(transaction.amount))),
    fee: minor(Math.round(transaction.fee ?? 0)),
    coupon: minor(Math.round(transaction.coupon ?? 0)),
  }
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

/**
 * 退款冲减哪一侧：只认原交易类型。未关联退款（relatedType 为空）不进入收支合计，
 * 只影响账户余额。方向判定复用 Domain 的 refundOffsetKind，这里只加 type 守卫。
 */
export function refundOffsetSide(transaction: LedgerTransaction): 'income' | 'expense' | null {
  if (transaction.type !== 'refund') return null
  return refundOffsetKind(transaction.relatedType)
}

function sumMonthFlow(transactions: LedgerTransaction[]) {
  let income = 0
  let expense = 0
  for (const transaction of transactions) {
    if (!transaction.date.startsWith(CURRENT_MONTH)) continue
    // 与流水页同口径：晚于今天的记录属于「未来」，不计入本月收支。
    if (transaction.date > TODAY) continue
    if (transaction.type === 'income') income += transaction.amount
    if (transaction.type === 'expense') expense += transaction.amount
    const offset = refundOffsetSide(transaction)
    if (offset === 'income') income -= transaction.amount
    if (offset === 'expense') expense -= transaction.amount
    if (transaction.type === 'adjustment' && transaction.amount < 0) expense += -transaction.amount
  }
  return { income, expense }
}

export function deriveOverview(ledger: LedgerForPureFns): OverviewSummary {
  // API 模式：收支与环比采用后端 dashboard 口径，不在此重复实现退款/排除规则。
  if (ledger.snapshot) return ledger.snapshot.overview

  const netWorth = ledger.accounts.reduce((total, account) => total + account.balance, 0)
  const liquidAssets = ledger.accounts
    .filter((account) => account.kind === 'cash')
    .reduce((total, account) => total + account.balance, 0)
  const investmentAssets = ledger.accounts
    .filter((account) => account.kind === 'investment')
    .reduce((total, account) => total + account.balance, 0)
  const { income, expense } = sumMonthFlow(ledger.transactions ?? [])
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

function budgetRange(period: BudgetPeriod, today: string): { start: string; end: string } {
  const anchor = parseDay(today)
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth()

  switch (period) {
    case 'daily':
      return { start: today, end: today }
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

/** 支出预算占用率 → 展示等级；总览与 API 适配层共用同一阈值。 */
export function budgetLevel(percent: number): BudgetRow['level'] {
  if (percent > 100) return 'over'
  if (percent >= 80) return 'warning'
  return 'normal'
}

export function deriveBudgets(ledger: LedgerForPureFns, today = ledger.snapshot?.today ?? TODAY): BudgetSummary {
  // API 模式：每个预算的已用金额来自 /budgets/statuses（领域口径），不在前端重算。
  if (ledger.snapshot) return ledger.snapshot.budgets

  // 头部是「本月预算」：只含月度且启用的支出预算；周/年预算在预算页明细里展示各自周期。
  const expenseBudgets = ledger.budgets.filter(
    (budget) => budget.type === 'expense' && budget.period === 'monthly' && (budget.isActive ?? true),
  )

  const rows = expenseBudgets.map((budget) => {
    const range = budgetRange(budget.period, today)
    const categoryIds = budget.categoryId
      ? categorySubtree(ledger.categories, budget.categoryId)
      : undefined
    const rawUsed = (ledger.transactions ?? [])
      .filter((transaction) => {
        if (transaction.type !== 'expense' && refundOffsetSide(transaction) !== 'expense') return false
        if (transaction.date < range.start || transaction.date > range.end) return false
        if (categoryIds && !categoryIds.has(transaction.categoryId)) return false
        if (budget.accountId && transaction.accountId !== budget.accountId) return false
        return true
      })
      .reduce((total, transaction) => total + (transaction.type === 'expense' ? transaction.amount : -transaction.amount), 0)
    // 退款冲减后为负时按 0 展示，与后端预算用量同口径。
    const used = Math.max(0, rawUsed)
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

/** 图表与下钻共用的「近 12 个月」：11 个月前的 1 日到当月最后一天。 */
export function recentTwelveMonthsRange(today: string): { from: string; to: string } {
  const [year, month] = today.split('-').map(Number)
  return {
    from: formatDay(new Date(Date.UTC(year, month - 12, 1))),
    to: formatDay(new Date(Date.UTC(year, month, 0))),
  }
}

function twelveMonthLabels(today: string): string[] {
  const [year, month] = today.split('-').map(Number)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 12 + index, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

/** 单笔流水对「净支出」的贡献：仅支出与退款冲减，调整流水不计入（与后端趋势同口径）。 */
function netExpenseAmount(transaction: LedgerTransaction): number | null {
  if (transaction.excludeFromIncomeExpense) return null
  if (transaction.type === 'expense') return transaction.amount
  if (refundOffsetSide(transaction) === 'expense') return -transaction.amount
  return null
}

/**
 * 支出趋势与分类构成。
 *
 * 有后端快照时直接返回 /analytics/trends 与 /analytics/category-breakdown 的聚合值；
 * 否则按同一口径从流水本地派生。
 */
export function deriveExpenseCharts(ledger: LedgerForPureFns, today = ledgerAnchorDay(ledger)): ExpenseCharts {
  if (ledger.snapshot) return ledger.snapshot.expenseCharts

  const range = recentTwelveMonthsRange(today)
  const months = twelveMonthLabels(today)
  const monthly = new Map(months.map((month) => [month, 0]))
  const byCategory = new Map<string, number>()

  for (const transaction of ledger.transactions ?? []) {
    if (transaction.date < range.from || transaction.date > range.to) continue
    const amount = netExpenseAmount(transaction)
    if (amount === null) continue
    const month = transaction.date.slice(0, 7)
    if (monthly.has(month)) monthly.set(month, (monthly.get(month) ?? 0) + amount)
    const rootId = getCategoryRootId(ledger, transaction.categoryId)
    byCategory.set(rootId, (byCategory.get(rootId) ?? 0) + amount)
  }

  return {
    trend: months.map((month) => ({ month, value: monthly.get(month) ?? 0 })),
    categories: [...byCategory.entries()]
      .map(([id, amount]) => ({ id, name: getCategoryName(ledger, id), amount }))
      .sort((a, b) => b.amount - a.amount),
    range,
  }
}

function recentDateLabel(date: string, today: string): string {
  const parsed = parseDay(date)
  const year = parsed.getUTCFullYear()
  const month = parsed.getUTCMonth() + 1
  const day = parsed.getUTCDate()
  const weekday = WEEK_LABELS[parsed.getUTCDay()]
  const prefix = date === today ? '今天 · ' : ''
  return `${prefix}${year}年${month}月${day}日 ${weekday}`
}

export function formatDateLabel(date: string): string {
  return recentDateLabel(date, '')
}

export function groupRecentTransactions(
  transactions: LedgerTransaction[],
  limit: number,
  today = TODAY,
): RecentGroup[] {
  // 未来日期不参与「今天/过去」的时间线，单独收进「未来」分组。
  const future = transactions
    .filter((transaction) => transaction.date > today)
    .sort((left, right) => left.date.localeCompare(right.date))
  const past = transactions
    .filter((transaction) => transaction.date <= today)
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, limit)
  const groups: RecentGroup[] = []
  for (const transaction of past) {
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
  if (future.length > 0) {
    groups.push({
      date: 'future',
      label: `未来 · ${recentDateLabel(future[0].date, today)}`,
      items: future,
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

/**
 * 分类图标的用户设置值：先看自身，再沿父链向上找最近一个 iconKey。
 * 都没有时返回 undefined，由 CategoryIcon 回退到名称映射 / 通用 Tag。
 */
export function getCategoryIconKey(ledger: Ledger, categoryId: string): string | undefined {
  let current = getCategory(ledger, categoryId)
  const seen = new Set<string>()
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (current.iconKey) return current.iconKey
    current = current.parentId ? getCategory(ledger, current.parentId) : undefined
  }
  return undefined
}

/**
 * 账户图标的用户设置值：先看账户自身，再回退到所属账户分组的 iconKey。
 * 都没有时返回 undefined，由 CategoryIcon 回退到通用 Tag。
 */
export function getAccountIconKey(ledger: Ledger, accountId: string): string | undefined {
  const account = ledger.accounts.find((item) => item.id === accountId)
  if (!account) return undefined
  if (account.iconKey) return account.iconKey
  if (!account.categoryId) return undefined
  const group = (ledger.accountCategories ?? []).find((item) => item.id === account.categoryId)
  return group?.iconKey ?? undefined
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
      return '平账'
  }
}

interface RefundSummary {
  refunded: number
  state: 'none' | 'partial' | 'full'
}

/** 原交易的退款列表：适配层带入 refunds 时直接用，否则按 relatedTransactionId 现算。 */
export function getRefundList(ledger: LedgerForPureFns, transaction: LedgerTransaction): LedgerTransaction[] {
  if (transaction.refunds) return transaction.refunds
  return (ledger.transactions ?? []).filter(
    (item) => item.type === 'refund' && item.relatedTransactionId === transaction.id,
  )
}

export function getRefundSummary(ledger: Ledger, transaction: LedgerTransaction): RefundSummary {
  if (transaction.type !== 'expense' && transaction.type !== 'income') {
    return { refunded: 0, state: 'none' }
  }
  const refunds = getRefundList(ledger, transaction)
  const refunded = transaction.refundedAmount ?? refunds.reduce((total, item) => total + item.amount, 0)
  // 退款可超过原额；累计已退达到或超过原额即视为全额退款。
  const state = refunded <= 0 ? 'none' : refunded >= transaction.amount ? 'full' : 'partial'
  return { refunded, state }
}

/** 在列表里递归查找关联原交易/退款，便于从任意一侧打开对方详情。 */
export function findTransactionDeep(list: LedgerTransaction[], id: string): LedgerTransaction | undefined {
  const queue = [...list]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const current = queue.shift()!
    if (seen.has(current.id)) continue
    seen.add(current.id)
    if (current.id === id) return current
    if (current.relatedTransaction) queue.push(current.relatedTransaction)
    if (current.refunds) queue.push(...current.refunds)
  }
  return undefined
}

export function getRelatedTransaction(ledger: LedgerForPureFns, transaction: LedgerTransaction): LedgerTransaction | undefined {
  if (transaction.relatedTransaction) return transaction.relatedTransaction
  if (!transaction.relatedTransactionId) return undefined
  return findTransactionDeep(ledger.transactions ?? [], transaction.relatedTransactionId)
}

/** 关联标记的展示名：优先备注，其次分类名，最后短 id。 */
export function transactionRefLabel(ledger: Ledger, transaction: LedgerTransaction): string {
  const note = transaction.note.trim()
  if (note) return note
  const category = getCategoryName(ledger, transaction.categoryId)
  return category !== '未分类' ? category : `#${transaction.id.slice(0, 8)}`
}

export function addTransaction(ledger: TestLedger, input: NewTransactionInput): TestLedger {
  const magnitude = Math.round(Math.abs(input.amount))
  if (magnitude <= 0) return ledger

  const signed = input.type === 'adjustment' ? Math.round(input.amount) : magnitude
  const fee = input.fee && input.fee > 0 ? Math.round(input.fee) : 0
  // 转账的两侧金额只由 Domain 口径给出：转出 X+f、转入 X+c。
  const transfer = transferAmounts({ amount: input.amount, fee, coupon: input.coupon })
  const related = input.relatedTransactionId
    ? findTransactionDeep(ledger.transactions ?? [], input.relatedTransactionId)
    : undefined
  const relatedType = input.type === 'refund' ? related?.type ?? null : undefined

  const accounts = ledger.accounts.map((account) => {
    if (input.type === 'transfer') {
      if (account.id === input.accountId)
        return { ...account, balance: account.balance - transferOutflow(transfer.principal, transfer.fee) }
      if (account.id === input.toAccountId)
        return { ...account, balance: account.balance + transferInflow(transfer.principal, transfer.coupon) }
      return account
    }
    if (account.id !== input.accountId) return account
    // 关联的收入退款是钱退回去（余额减少）；支出退款与未关联退款是余额增加。
    // 方向由 Domain 的 refundOffsetKind 给出，与收支冲减侧同源，避免非法 relatedType 漂移。
    const refundDelta = refundOffsetKind(relatedType) === 'income' ? -magnitude : magnitude
    const delta =
      input.type === 'expense'
        ? -magnitude
        : input.type === 'adjustment'
          ? signed
          : input.type === 'refund'
            ? refundDelta
            : magnitude
    return { ...account, balance: account.balance + delta }
  })

  const nextNumber = (ledger.transactions ?? []).reduce((max, transaction) => {
    const numeric = Number(transaction.id.replace(/\D/g, ''))
    return Number.isFinite(numeric) ? Math.max(max, numeric) : max
  }, 0)

  const transaction: LedgerTransaction = {
    id: `t${nextNumber + 1}`,
    date: input.date || TODAY,
    type: input.type,
    // 关联退款归属原交易分类：预算按分类子树统计，挂在「退款」分类会让预算不冲减。
    categoryId: input.type === 'refund' && related ? related.categoryId : input.categoryId,
    note: input.note.trim() || '未填写备注',
    accountId: input.accountId,
    amount: signed,
    ...(input.type === 'transfer'
      ? {
          toAccountId:
            input.toAccountId ||
            ledger.accounts.find((account) => account.id !== input.accountId)?.id,
          fee,
          coupon: input.coupon || undefined,
        }
      : {}),
    ...(input.type === 'refund'
      ? {
          relatedTransactionId: related?.id,
          relatedType,
        }
      : {}),
    ...(input.excludeFromIncomeExpense && input.type !== 'transfer' && input.type !== 'adjustment'
      ? { excludeFromIncomeExpense: true }
      : {}),
  }

  return {
    ...ledger,
    accounts,
    transactions: [transaction, ...ledger.transactions],
  }
}
