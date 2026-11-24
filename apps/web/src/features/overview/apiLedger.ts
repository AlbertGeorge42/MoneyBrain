/**
 * DTO → Ledger 适配层（总览只读接入）
 *
 * 只调用只读端点：
 * - GET /accounts（账户）+ GET /accounts/:id/balance-at（每账户当日余额）
 * - GET /transaction-categories
 * - GET /budgets + GET /budgets/statuses（预算已用金额用后端领域口径）
 * - GET /analytics/dashboard（本月/上月收支 + 最近交易）
 * - GET /analytics/asset-trend（近 12 个月净资产走势）
 * - GET /analytics/trends?type=expense（近 12 个月支出趋势）
 * - GET /analytics/category-breakdown?type=expense（近 12 个月支出分类构成）
 *
 * 适配层不写库、不缓存；请求失败直接抛出，由页面进入 error 态。
 */
import type {
  Account,
  AccountCategory,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  BootstrapData,
  Budget,
  BudgetStatus,
  DashboardSummaryData,
  Transaction,
  TransactionCategory,
} from '@contracts/types'
import {
  accountApi,
  accountCategoryApi,
  analyticsApi,
  budgetApi,
  transactionCategoryApi,
} from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import type {
  AccountKind,
  BudgetPeriod,
  BudgetRow,
  BudgetSummary,
  ExpenseCategorySlice,
  Ledger,
  LedgerAccount,
  LedgerAccountCategory,
  LedgerBudget,
  LedgerCategory,
  LedgerTransaction,
  OverviewSummary,
  TrendPoint,
  TxType,
} from './model'
import { budgetLevel, recentTwelveMonthsRange } from './model'

function toBaseLedgerTransaction(transaction: Transaction): LedgerTransaction {
  return {
    id: transaction.id,
    date: calendarDay(transaction.date),
    type: transaction.type,
    categoryId: transaction.categoryId ?? '',
    note: transaction.note ?? '',
    accountId: transaction.accountId,
    amount: transaction.amount,
    toAccountId: transaction.toAccountId ?? undefined,
    fee: transaction.fee || undefined,
    coupon: transaction.coupon || undefined,
    relatedTransactionId: transaction.relatedTransactionId ?? undefined,
    relatedType: transaction.relatedType ? asTxType(transaction.relatedType) : null,
    excludeFromIncomeExpense: transaction.excludeFromIncomeExpense || undefined,
  }
}

/**
 * 交易 DTO → 页面模型：连同退款双向关系一起带上。
 * 列表/详情抽屉据此显示「退款 · 关联 #原交易」并可跳到对方详情，无需额外查库。
 */
export function toLedgerTransaction(transaction: Transaction): LedgerTransaction {
  const base = toBaseLedgerTransaction(transaction)
  const relatedTransaction = transaction.relatedTransaction
    ? toBaseLedgerTransaction(transaction.relatedTransaction)
    : undefined
  const refunds = (transaction.refunds ?? [])
    .filter((refund) => refund.type === 'refund')
    .map((refund) => toBaseLedgerTransaction(refund))

  if (base.type === 'expense' || base.type === 'income') {
    const refundedAmount = refunds.reduce((total, refund) => total + refund.amount, 0)
    base.refundedAmount = refundedAmount
    base.remainingAmount = Math.max(base.amount - refundedAmount, 0)
  }

  return {
    ...base,
    relatedTransaction,
    refunds,
  }
}

const TX_TYPES: readonly TxType[] = ['expense', 'income', 'transfer', 'refund', 'adjustment']

function asTxType(value: string): TxType {
  return TX_TYPES.includes(value as TxType) ? (value as TxType) : 'expense'
}

function asBudgetPeriod(value: string): BudgetPeriod {
  if (value === 'daily' || value === 'weekly' || value === 'quarterly' || value === 'yearly') return value
  return 'monthly'
}

/** 本地日历日（与后端 LocalDate 口径一致，不用 UTC 截断）。 */
export function todayLocal(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * 账本日期 → `YYYY-MM-DD`。
 *
 * API 已统一输出本地日历日（date-only），这里原样返回、不做任何时区换算，
 * 所以同一笔交易在 UTC+8 / UTC-5 / UTC 下显示的都是同一个日历日。
 * 仅历史载荷还是 ISO 瞬时（旧后端序列化）时，按客户端本地时区显式解析，
 * 与旧前端 `dayjs(date).format('YYYY-MM-DD')` 的显示一致；
 * 不再用 `slice(0, 10)` 截取 UTC 日期部分（那会把本地午夜写成前一天）。
 */
export function calendarDay(value: string): string {
  if (DATE_ONLY_PATTERN.test(value)) return value
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return todayLocal(parsed)
}

function periodLabelOf(today: string): string {
  const [year, month] = today.split('-')
  return `${year} 年 ${Number(month)} 月`
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) return 0
  return ((current - previous) / previous) * 100
}

/** 账户性质派生：只消费后端根继承解析后的有效属性，不读分类 raw 字段。 */
function accountKind(account: Account): AccountKind {
  if (account.effectiveIsInvestment) return 'investment'
  if (account.type === 'liability') return 'credit'
  if (account.effectiveIsCashEquivalent) return 'cash'
  return 'deposit'
}

export interface LedgerApiPayload {
  accounts: Account[]
  categories: TransactionCategory[]
  accountCategories: AccountCategory[]
  budgets: Budget[]
  statuses: BudgetStatus[]
  dashboard: DashboardSummaryData
  assetTrend: AnalyticsAssetTrendItem[]
  /** 近 12 个月支出趋势（按月聚合，退款已冲减）。 */
  expenseTrend: AnalyticsTrendItem[]
  /** 近 12 个月一级分类支出构成（后端聚合）。 */
  expenseCategories: AnalyticsCategoryBreakdownItem[]
  /**
   * 交易摘要（按账户 / 分类 / 月份分组 + 最新日期 + 总笔数）。
   * 后端一次聚合下发，Ledger 不再拉取也不再持有全量流水。
   */
  transactionSummary: {
    byAccount: Record<string, number>
    byCategory: Record<string, number>
    byMonth: Record<string, number>
    total: number
    latestDate: string | null
  }
  /** accountId → 当日余额（分）。缺任一项都应视为请求失败，不做 0 兜底。 */
  balances: ReadonlyMap<string, number>
}

/**
 * 启动快查询的产出：metadata + 单值摘要 + dashboard + 预算用量。
 * 不含余额回放与 12 月趋势——流水页只依赖这一批即可渲染。
 */
export interface LedgerCorePayload {
  accounts: Account[]
  categories: TransactionCategory[]
  accountCategories: AccountCategory[]
  budgets: Budget[]
  statuses: BudgetStatus[]
  dashboard: DashboardSummaryData
  transactionSummary: LedgerApiPayload['transactionSummary']
  today: string
}

/** 慢查询的产出：净资产/余额一次回放 + 支出趋势与分类构成。 */
export interface LedgerAnalyticsPayload {
  bootstrap: BootstrapData
  expenseTrend: AnalyticsTrendItem[]
  expenseCategories: AnalyticsCategoryBreakdownItem[]
}

export function buildLedgerFromApi(payload: LedgerApiPayload, today = todayLocal()): Ledger {
  const categories: LedgerCategory[] = payload.categories.map((category) => ({
    id: category.id,
    name: category.name,
    type: asTxType(category.type),
    parentId: category.parentId ?? undefined,
    cashFlowType: category.cashFlowType,
    effectiveCashFlowType: category.effectiveCashFlowType,
    iconKey: category.iconKey,
  }))

  const accountCategories: LedgerAccountCategory[] = payload.accountCategories.map((category) => ({
    id: category.id,
    name: category.name,
    type: category.type === 'liability' ? 'liability' : 'asset',
    parentId: category.parentId ?? null,
    sort: category.sort,
    isCashEquivalent: category.isCashEquivalent,
    isInvestment: category.isInvestment,
    effectiveIsCashEquivalent: category.effectiveIsCashEquivalent,
    effectiveIsInvestment: category.effectiveIsInvestment,
    iconKey: category.iconKey,
  }))

  const accounts: LedgerAccount[] = payload.accounts.map((account) => {
    const balance = payload.balances.get(account.id)
    if (balance === undefined) {
      throw new Error(`账户 ${account.name} 缺少当日余额`)
    }
    return {
      id: account.id,
      name: account.name,
      kind: accountKind(account),
      balance,
      categoryId: account.categoryId ?? null,
      initialBalance: Number(account.initialBalance),
      initialBalanceDate: account.initialBalanceDate,
    }
  })

  const statusById = new Map(payload.statuses.map((status) => [status.budget.id, status]))
  const budgets: LedgerBudget[] = payload.budgets.map((budget) => ({
    id: budget.id,
    name: budget.name,
    type: asTxType(budget.type),
    period: asBudgetPeriod(budget.period),
    limit: Number(budget.amount),
    categoryId: budget.categoryId || undefined,
    accountId: budget.accountId,
    toAccountId: budget.toAccountId ?? undefined,
    transactionTime: budget.transactionTime ?? null,
    isActive: budget.isActive,
    // 已用金额来自 /budgets/statuses（领域口径），不在前端按流水重算。
    used: statusById.get(budget.id)?.used,
  }))
  // 总览卡是「本月预算」：只含月度且启用的支出预算，周/年预算在预算页明细里展示各自周期。
  const rows: BudgetRow[] = budgets
    .filter((budget) => budget.type === 'expense' && budget.period === 'monthly' && (budget.isActive ?? true))
    .map((budget) => {
      const used = budget.used ?? 0
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
  const budgetsSummary: BudgetSummary = {
    rows,
    used: rows.reduce((total, row) => total + row.used, 0),
    limit: rows.reduce((total, row) => total + row.limit, 0),
    percent: 0,
  }
  budgetsSummary.percent =
    budgetsSummary.limit === 0 ? 0 : (budgetsSummary.used / budgetsSummary.limit) * 100

  // 交易事实的单值摘要由后端一次聚合下发；Ledger 不再持有也不再扫描全量流水。
  const { latestDate, byMonth, byAccount, byCategory, total } = payload.transactionSummary
  const anchorMonth = (latestDate && latestDate > today ? latestDate : today).slice(0, 7)
  const anchorMonthCount = byMonth[anchorMonth] ?? 0
  const activeMonths = Object.keys(byMonth)

  // 负债账户余额在 API 里以正数表示欠款；净资产 = 资产 − 负债。
  // 不能把全部余额直接相加，否则欠款会被加进净值（真实库 770,775.78 vs 738,715.48）。
  const assetBalances = accounts.filter((account) => account.kind !== 'credit')
  const liabilityBalances = accounts.filter((account) => account.kind === 'credit')
  const netWorth =
    assetBalances.reduce((total, account) => total + account.balance, 0) -
    liabilityBalances.reduce((total, account) => total + Math.abs(account.balance), 0)
  const liquidAssets = accounts
    .filter((account) => account.kind === 'cash')
    .reduce((total, account) => total + account.balance, 0)
  const investmentAssets = accounts
    .filter((account) => account.kind === 'investment')
    .reduce((total, account) => total + account.balance, 0)

  const trend: TrendPoint[] = payload.assetTrend.map((item) => ({
    month: item.label,
    value: item.netWorth,
  }))

  // 支出图表直接使用后端聚合：趋势按月取 /analytics/trends，
  // 分类构成取 /analytics/category-breakdown，不在前端按流水再算一遍。
  const expenseCategories: ExpenseCategorySlice[] = payload.expenseCategories.map((item) => ({
    id: item.categoryId ?? '',
    name: item.name,
    amount: item.value,
  }))
  const expenseCharts = {
    trend: payload.expenseTrend.map((item) => ({ month: item.label, value: item.amount })),
    categories: expenseCategories,
    range: recentTwelveMonthsRange(today),
  }
  // 上月净资产取走势的倒数第二个月；不足两个月时退回当前净值（环比为 0）。
  const previousNetWorth =
    trend.length >= 2 ? trend[trend.length - 2].value : netWorth

  // 收支方向由前端展示层承担（前缀 + / −）：接口里的历史负向支出只取金额绝对值，
  // 否则会出现「−-¥28.00」。净资产 / 结余等带符号口径仍用接口原值，不在此处翻转。
  const income = Math.abs(payload.dashboard.thisMonth.income)
  const expense = Math.abs(payload.dashboard.thisMonth.expense)
  const overview: OverviewSummary = {
    netWorth,
    previousNetWorth,
    netWorthChangePct: percentChange(netWorth, previousNetWorth),
    liquidAssets,
    investmentAssets,
    income,
    expense,
    balance: payload.dashboard.thisMonth.balance,
    savingsRate: income === 0 ? 0 : ((income - expense) / income) * 100,
    incomeChangePct: percentChange(income, Math.abs(payload.dashboard.lastMonth.income)),
    expenseChangePct: percentChange(expense, Math.abs(payload.dashboard.lastMonth.expense)),
    elapsedDays: Number(today.slice(8, 10)),
  }

  return {
    accounts,
    categories,
    accountCategories,
    budgets,
    snapshot: {
      overview,
      budgets: budgetsSummary,
      trend,
      expenseCharts,
      today,
      periodLabel: periodLabelOf(today),
      hasTransactions: total > 0,
      latestDate,
      anchorMonthCount,
      activeMonths,
      accountTxCounts: byAccount,
      categoryTxCounts: byCategory,
      recentTransactions: payload.dashboard.recentTransactions.map((transaction: Transaction) =>
        toLedgerTransaction(transaction),
      ),
    },
  }
}

/**
 * 启动快阶段的账本：只有 metadata，没有 snapshot。
 * 流水页只依赖 accounts / categories / accountCategories 做深链还原与筛选，
 * 页面自身有 `?? TODAY` / `?? CURRENT_MONTH_LABEL` 兜底，不依赖 snapshot。
 * 总览 / 报表 / 预算 / 设置页由 fullState=loading 挡在骨架态，读不到这份半成品。
 */
export function buildMetadataLedger(core: LedgerCorePayload): Ledger {
  return {
    accounts: core.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      kind: accountKind(account),
      balance: 0,
      categoryId: account.categoryId ?? null,
      initialBalance: Number(account.initialBalance),
      initialBalanceDate: account.initialBalanceDate,
    })),
    categories: core.categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: asTxType(category.type),
      parentId: category.parentId ?? undefined,
      cashFlowType: category.cashFlowType,
      effectiveCashFlowType: category.effectiveCashFlowType,
      iconKey: category.iconKey,
    })),
    accountCategories: core.accountCategories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type === 'liability' ? 'liability' : 'asset',
      parentId: category.parentId ?? null,
      sort: category.sort,
      isCashEquivalent: category.isCashEquivalent,
      isInvestment: category.isInvestment,
      effectiveIsCashEquivalent: category.effectiveIsCashEquivalent,
      effectiveIsInvestment: category.effectiveIsInvestment,
      iconKey: category.iconKey,
    })),
    budgets: core.budgets.map((budget) => ({
      id: budget.id,
      name: budget.name,
      type: asTxType(budget.type),
      period: asBudgetPeriod(budget.period),
      limit: Number(budget.amount),
      categoryId: budget.categoryId || undefined,
      accountId: budget.accountId,
      toAccountId: budget.toAccountId ?? undefined,
      transactionTime: budget.transactionTime ?? null,
      isActive: budget.isActive,
    })),
  }
}

/** 加载中/失败时的空账本占位：页面此时只渲染骨架或错误态。 */
export const EMPTY_LEDGER: Ledger = {
  accounts: [],
  categories: [],
  budgets: [],
}

/**
 * 启动快查询：metadata + dashboard + 交易摘要 + 预算用量，全部是轻查询。
 * 两个 query 并行发起，本批不等待 analytics 的余额回放，流水页据此先渲染。
 */
export async function fetchLedgerCore(): Promise<LedgerCorePayload> {
  const today = todayLocal()
  const [
    accounts,
    categories,
    accountCategories,
    budgets,
    dashboard,
    transactionSummary,
  ] = await Promise.all([
    accountApi.getAll().then(unwrapApiData),
    transactionCategoryApi.getAll().then(unwrapApiData),
    accountCategoryApi.getAll().then(unwrapApiData),
    budgetApi.getAll().then(unwrapApiData),
    analyticsApi.getDashboardSummary().then(unwrapApiData),
    analyticsApi.getTransactionSummary().then(unwrapApiData),
  ])
  const budgetIds = budgets.map((budget) => budget.id)
  const statuses =
    budgetIds.length > 0
      ? await budgetApi.getStatuses(budgetIds).then(unwrapApiData)
      : []
  return { accounts, categories, accountCategories, budgets, statuses, dashboard, transactionSummary, today }
}

/** 启动慢查询：净资产/余额一次回放 + 支出趋势与分类构成。与 fetchLedgerCore 并行发起。 */
export async function fetchLedgerAnalytics(): Promise<LedgerAnalyticsPayload> {
  const today = todayLocal()
  const expenseRange = recentTwelveMonthsRange(today)
  const [bootstrap, expenseTrend, expenseCategories] = await Promise.all([
    analyticsApi.getBootstrap().then(unwrapApiData),
    analyticsApi.getTrends('expense').then(unwrapApiData),
    analyticsApi.getCategoryBreakdown('expense', expenseRange.from, expenseRange.to).then(unwrapApiData),
  ])
  return { bootstrap, expenseTrend, expenseCategories }
}

/** 把快/慢两批装配成完整账本；两批都就绪后调用。 */
export function assembleLedger(core: LedgerCorePayload, analytics: LedgerAnalyticsPayload): Ledger {
  return buildLedgerFromApi(
    {
      accounts: core.accounts,
      categories: core.categories,
      accountCategories: core.accountCategories,
      budgets: core.budgets,
      statuses: core.statuses,
      dashboard: core.dashboard,
      assetTrend: analytics.bootstrap.assetTrend,
      expenseTrend: analytics.expenseTrend,
      expenseCategories: analytics.expenseCategories,
      transactionSummary: core.transactionSummary,
      balances: new Map(Object.entries(analytics.bootstrap.balances)),
    },
    core.today,
  )
}

