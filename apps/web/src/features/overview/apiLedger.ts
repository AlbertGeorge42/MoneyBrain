/**
 * DTO → Ledger 适配层（总览只读接入）
 *
 * 只调用只读端点：
 * - GET /accounts（账户）+ GET /accounts/:id/balance-at（每账户当日余额）
 * - GET /transaction-categories
 * - GET /budgets + GET /budgets/statuses（预算已用金额用后端领域口径）
 * - GET /analytics/dashboard（本月/上月收支 + 最近交易）
 * - GET /analytics/asset-trend（近 12 个月净资产走势）
 *
 * 适配层不写库、不缓存；请求失败直接抛出，由页面进入 error 态。
 */
import type {
  Account,
  AnalyticsAssetTrendItem,
  Budget,
  BudgetStatus,
  DashboardSummaryData,
  Transaction,
  TransactionCategory,
} from '@contracts/types'
import { accountApi, analyticsApi, budgetApi, transactionApi, transactionCategoryApi } from '@/services/api'
import { unwrapApiData } from '@/services/apiResult'
import type {
  AccountKind,
  BudgetPeriod,
  BudgetRow,
  BudgetSummary,
  Ledger,
  LedgerAccount,
  LedgerBudget,
  LedgerCategory,
  LedgerTransaction,
  OverviewSummary,
  TrendPoint,
  TxType,
} from './model'

/**
 * 真实分类是 UUID，而总览的分类图标按种子 key（food / salary…）取字形。
 * 名称命中种子分类时把根分类 id 映射成同一个 key，保证接线后视觉与种子一致。
 * 未命中的分类保留真实 id，图标回退为通用 Tag。
 */
const CATEGORY_KEY_BY_NAME: Record<string, string> = {
  餐饮: 'food',
  交通: 'traffic',
  居住: 'home',
  购物: 'shop',
  娱乐: 'fun',
  医疗: 'health',
  教育: 'edu',
  其他: 'other',
  工资: 'salary',
  理财收益: 'inv',
  红包: 'gift',
  退款: 'refund',
  账户互转: 'move',
}

export interface CategoryDisplayMapper {
  /** 真实分类 id → 展示 id（种子 key 或原 id）。 */
  displayId: (id: string | null | undefined) => string
  /** 展示 id → 真实分类 id；未映射的视为本身就是真实 id。 */
  realId: (displayId: string) => string
  /** 真实 → 展示 的全量映射，挂在 Ledger.ids 上供跨页面复用。 */
  display: Record<string, string>
  /** 展示 → 真实 的全量映射。 */
  real: Record<string, string>
}

export function createCategoryDisplayMapper(
  categories: readonly TransactionCategory[],
): CategoryDisplayMapper {
  const display = new Map<string, string>()
  const real: Record<string, string> = {}
  const used = new Set<string>()
  for (const category of categories) {
    const key = CATEGORY_KEY_BY_NAME[category.name.trim()]
    // 同名根分类（如收入/支出都叫「其他」）只映射第一个，避免展示 id 撞车。
    if (!category.parentId && key && !used.has(key)) {
      display.set(category.id, key)
      real[key] = category.id
      used.add(key)
    }
  }
  return {
    displayId: (id) => (id ? display.get(id) ?? id : ''),
    realId: (displayId) => real[displayId] ?? displayId,
    display: Object.fromEntries(display),
    real,
  }
}

/** 复用账本里的映射（API 模式下 Ledger.ids 由 buildLedgerFromApi 写入）。 */
export function mapperFromLedger(ledger: Ledger): CategoryDisplayMapper {
  const display = ledger.ids?.categoryDisplay ?? {}
  const real = ledger.ids?.categoryReal ?? {}
  return {
    displayId: (id) => (id ? display[id] ?? id : ''),
    realId: (displayId) => real[displayId] ?? displayId,
    display,
    real,
  }
}

function toBaseLedgerTransaction(
  transaction: Transaction,
  mapper: CategoryDisplayMapper,
): LedgerTransaction {
  return {
    id: transaction.id,
    date: calendarDay(transaction.date),
    type: transaction.type,
    categoryId: mapper.displayId(transaction.categoryId),
    note: transaction.note ?? '',
    accountId: transaction.accountId,
    amount: transaction.amount,
    toAccountId: transaction.toAccountId ?? undefined,
    fee: transaction.fee || undefined,
    relatedTransactionId: transaction.relatedTransactionId ?? undefined,
    relatedType: transaction.relatedType ? asTxType(transaction.relatedType) : null,
  }
}

/**
 * 交易 DTO → 页面模型：连同退款双向关系一起带上。
 * 列表/详情抽屉据此显示「退款 · 关联 #原交易」并可跳到对方详情，无需额外查库。
 */
export function toLedgerTransaction(
  transaction: Transaction,
  mapper: CategoryDisplayMapper,
): LedgerTransaction {
  const base = toBaseLedgerTransaction(transaction, mapper)
  const relatedTransaction = transaction.relatedTransaction
    ? toBaseLedgerTransaction(transaction.relatedTransaction, mapper)
    : undefined
  const refunds = (transaction.refunds ?? [])
    .filter((refund) => refund.type === 'refund')
    .map((refund) => toBaseLedgerTransaction(refund, mapper))

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

function accountKind(account: Account): AccountKind {
  if (account.category?.isInvestment) return 'investment'
  if (account.type === 'liability') return 'credit'
  if (account.category?.isCashEquivalent) return 'cash'
  return 'deposit'
}

function budgetLevel(percent: number): BudgetRow['level'] {
  if (percent > 100) return 'over'
  if (percent >= 80) return 'warning'
  return 'normal'
}

export interface LedgerApiPayload {
  accounts: Account[]
  categories: TransactionCategory[]
  budgets: Budget[]
  statuses: BudgetStatus[]
  dashboard: DashboardSummaryData
  assetTrend: AnalyticsAssetTrendItem[]
  /**
   * 完整流水分页拉取的结果（不是 dashboard 的最近 8 笔）。
   * 报表与预算的合计都从这里取，跨月 / 跨年才不会被快照窗口截断。
   */
  transactions: Transaction[]
  /** accountId → 当日余额（分）。缺任一项都应视为请求失败，不做 0 兜底。 */
  balances: ReadonlyMap<string, number>
}

/** 完整流水分页拉取：只读端点，失败直接抛给页面进入 error 态。 */
export async function fetchAllTransactions(): Promise<Transaction[]> {
  const pageSize = 200
  const all: Transaction[] = []
  for (let page = 1; page <= 100; page += 1) {
    const result = await transactionApi.getAll({ page, pageSize }).then(unwrapApiData)
    all.push(...result.list)
    if (result.list.length === 0 || all.length >= result.total) return all
  }
  // 超过 2 万笔时宁可报错，也不静默截断后算出偏小的合计。
  throw new Error('流水超过 2 万笔，分页加载未完成')
}

export function buildLedgerFromApi(payload: LedgerApiPayload, today = todayLocal()): Ledger {
  const mapper = createCategoryDisplayMapper(payload.categories)
  const displayId = mapper.displayId

  const categories: LedgerCategory[] = payload.categories.map((category) => ({
    id: displayId(category.id),
    name: category.name,
    type: asTxType(category.type),
    parentId: category.parentId ? displayId(category.parentId) : undefined,
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
      initialBalance: Number(account.initialBalance),
      initialBalanceDate: account.initialBalanceDate,
    }
  })

  const budgets: LedgerBudget[] = payload.budgets.map((budget) => ({
    id: budget.id,
    name: budget.name,
    type: asTxType(budget.type),
    period: asBudgetPeriod(budget.period),
    limit: Number(budget.amount),
    categoryId: displayId(budget.categoryId) || undefined,
    accountId: budget.accountId,
  }))

  const statusById = new Map(payload.statuses.map((status) => [status.budget.id, status]))
  const rows: BudgetRow[] = budgets
    .filter((budget) => budget.type === 'expense')
    .map((budget) => {
      const used = statusById.get(budget.id)?.used ?? 0
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
  // 与现有总览口径保持一致：头部合计仍是所有支出预算行相加。
  // 「月度可花」混算周/年预算属于已知缺口，见 hf-api-gaps.md，本批不擅自改口径。
  const budgetsSummary: BudgetSummary = {
    rows,
    used: rows.reduce((total, row) => total + row.used, 0),
    limit: rows.reduce((total, row) => total + row.limit, 0),
    percent: 0,
  }
  budgetsSummary.percent =
    budgetsSummary.limit === 0 ? 0 : (budgetsSummary.used / budgetsSummary.limit) * 100

  const transactions: LedgerTransaction[] = payload.transactions.map((transaction: Transaction) =>
    toLedgerTransaction(transaction, mapper),
  )

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
    budgets,
    transactions,
    ids: { categoryDisplay: mapper.display, categoryReal: mapper.real },
    snapshot: {
      overview,
      budgets: budgetsSummary,
      trend,
      today,
      periodLabel: periodLabelOf(today),
    },
  }
}

/** API 模式加载中/失败时的占位账本：不是种子数据，页面此时只渲染骨架或错误态。 */
export const EMPTY_LEDGER: Ledger = {
  accounts: [],
  categories: [],
  budgets: [],
  transactions: [],
}

export interface ApiLedgerResult {
  ledger: Ledger
  /** 无账户即视为空账本，页头走冷启动引导。 */
  isEmpty: boolean
}

/** 只读拉取总览所需数据；任一请求失败都抛出，由上层进入 error 态。 */
export async function fetchLedgerFromApi(): Promise<ApiLedgerResult> {
  const today = todayLocal()
  const [accounts, categories, budgets, dashboard, assetTrend, transactions] = await Promise.all([
    accountApi.getAll().then(unwrapApiData),
    transactionCategoryApi.getAll().then(unwrapApiData),
    budgetApi.getAll().then(unwrapApiData),
    analyticsApi.getDashboardSummary().then(unwrapApiData),
    analyticsApi.getAssetTrend().then(unwrapApiData),
    fetchAllTransactions(),
  ])

  const balanceResults = await Promise.all(
    accounts.map((account) =>
      accountApi
        .getBalanceAt(account.id, today)
        .then(unwrapApiData)
        .then((result) => [account.id, result.balance] as const),
    ),
  )

  const expenseBudgetIds = budgets
    .filter((budget) => budget.type === 'expense')
    .map((budget) => budget.id)
  const statuses =
    expenseBudgetIds.length > 0
      ? await budgetApi.getStatuses(expenseBudgetIds).then(unwrapApiData)
      : []

  return {
    ledger: buildLedgerFromApi(
      {
        accounts,
        categories,
        budgets,
        statuses,
        dashboard,
        assetTrend,
        transactions,
        balances: new Map(balanceResults),
      },
      today,
    ),
    isEmpty: accounts.length === 0,
  }
}
