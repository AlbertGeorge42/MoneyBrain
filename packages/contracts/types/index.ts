// ===== 通用响应类型 =====

/**
 * 后端统一错误码。
 * 前端据此决定提示文案、是否重试、是否需要用户介入。
 */
export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_ERROR'
  | 'FOREIGN_KEY_ERROR'
  | 'CONFLICT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export interface ApiError {
  code: ApiErrorCode
  /** 面向用户的可读文案 */
  message: string
  /** 结构化补充信息（如字段级校验错误） */
  details?: unknown
  /** 请求 ID，用于在后端日志中定位同一次请求 */
  requestId?: string
}

export interface ApiSuccessResponse<T> {
  success: true
  data: T
  timestamp: string
}

export interface ApiErrorResponse {
  success: false
  error: ApiError
  timestamp: string
}

/** 所有 API 响应的联合类型：成功必有 data，失败必有 error */
export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse

export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

// ===== 账户分类 =====

export interface AccountCategory {
  id: string
  name: string
  type: string
  icon: string | null
  color: string | null
  parentId: string | null
  sort: number
  parent: AccountCategory | null
  children: AccountCategory[]
  isCashEquivalent: boolean
  isInvestment: boolean
  createdAt: string
  updatedAt: string
}

// ===== 账户 =====

export interface Account {
  id: string
  name: string
  type: string
  initialBalance: number
  initialBalanceDate: string | null
  icon: string | null
  color: string | null
  categoryId: string | null
  sort: number
  category: AccountCategory | null
  createdAt: string
  updatedAt: string
}

export interface AccountStats {
  transactionCount: number
  totalIncome: number
  totalExpense: number
}

// ===== 交易分类 =====

export interface TransactionCategory {
  id: string
  name: string
  type: string
  icon: string | null
  color: string | null
  parentId: string | null
  sort: number
  parent: TransactionCategory | null
  children: TransactionCategory[]
  cashFlowType: 'operating' | 'investing' | 'financing' | null
  createdAt: string
  updatedAt: string
}

// ===== 交易 =====

// 交易类型（表单与 API 共用）
export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund' | 'adjustment'

export interface Transaction {
  id: string
  type: TransactionType
  amount: number
  fee: number
  coupon: number
  date: string
  note: string | null
  accountId: string
  categoryId: string | null
  toAccountId: string | null
  relatedTransactionId: string | null
  relatedType: string | null // 'income' | 'expense'（退款时记录原交易类型）
  excludeFromIncomeExpense: boolean // 不计收支：不参与收入/支出统计（仍影响账户余额）
  account: Account
  category: TransactionCategory | null
  toAccount: Account | null
  relatedTransaction: Transaction | null
  refunds: Transaction[]
  createdAt: string
}

// ===== 预算 =====

export interface Budget {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  period: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  startDate: string
  endDate: string | null
  transactionTime: number | null
  note: string | null
  isActive: boolean
  accountId: string
  toAccountId: string | null
  categoryId: string
  account: Account
  toAccount: Account | null
  category: TransactionCategory
  createdAt: string
  updatedAt: string
}

export interface BudgetPrediction {
  date: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string
  budgetId: string
  budgetName: string
}

export interface BudgetStatus {
  budget: Budget
  used: number
  remaining: number
  percentage: number
  isOverBudget: boolean
}

export interface TransactionCategoryStats {
  transactionCount: number
  childrenCount: number
}

// ===== 分析与报表 =====

export interface ReportValue {
  actual: number
  predicted: number
}

export interface AnalyticsTrendItem {
  label: string
  amount: number
}

export interface AnalyticsCategoryBreakdownItem {
  name: string
  value: number
  categoryId?: string
  hasChildren?: boolean
}

export interface AnalyticsAssetTrendItem {
  label: string
  assets: number
  liabilities: number
  netWorth: number
}

// 资产负债表 - 分类节点
export interface BalanceSheetCategoryNode {
  id: string  // categoryId
  name: string
  type: 'asset' | 'liability'
  sort: number
  icon?: string | null
  color?: string | null
  actual: number
  predicted: number
  children: BalanceSheetAccountNode[]
}

// 资产负债表 - 账户节点
export interface BalanceSheetAccountNode {
  id: string  // accountId
  name: string
  categoryId: string
  type: 'asset' | 'liability'
  icon?: string | null
  color?: string | null
  actual: number
  predicted: number
}

export interface BalanceSheetReportData {
  date: string
  granularity: 'day' | 'month' | 'year'
  assets: ReportValue
  liabilities: ReportValue
  netWorth: ReportValue
  assetsByCategory: Record<string, number>
  liabilitiesByCategory: Record<string, number>
  assetNodes: BalanceSheetCategoryNode[]
  liabilityNodes: BalanceSheetCategoryNode[]
  predictionNote?: string
}

export interface ReportCategoryDetail {
  name: string
  actual: number
  predicted: number
  categoryId: string
  hasChildren: boolean
  sort: number
  icon?: string | null
  color?: string | null
  children?: ReportCategoryDetail[]
}

export interface IncomeExpenseReportData {
  startDate: string
  endDate: string
  income: ReportValue
  expense: ReportValue
  balance: ReportValue
  /**
   * 对账条：期初净资产 + 净收入 − 净支出 + other = 期末净资产。
   * other = 不进收支统计但改变余额的部分（不计收支、转账手续费、平账、减开户日前的交易）。
   * difference = 期末 − 上面等式的右边；恒为 0 才说明收支口径与余额口径自洽。
   */
  reconciliation: {
    startNetWorth: number
    netIncome: number
    netExpense: number
    other: number
    endNetWorth: number
    difference: number
  }
  incomeByCategory: Record<string, number>
  expenseByCategory: Record<string, number>
  incomeCategoryDetails: ReportCategoryDetail[]
  expenseCategoryDetails: ReportCategoryDetail[]
  startAssets: ReportValue
  startLiabilities: ReportValue
  startNetWorth: ReportValue
  endAssets: ReportValue
  endLiabilities: ReportValue
  endNetWorth: ReportValue
  assetChange: ReportValue
  predictionNote?: string
}

export interface CashFlowActivityItem {
  categoryName: string
  categoryId: string | null
  parentId: string | null
  level: number
  amount: number
  actual: number
  predicted: number
  type: string
  direction: string
  icon?: string | null
  color?: string | null
  children?: CashFlowActivityItem[]
}

export interface CashFlowActivity {
  inflow: ReportValue
  outflow: ReportValue
  net: ReportValue
  items: CashFlowActivityItem[]
}

export interface SankeyLink {
  source: string
  target: string
  value: number
  actualValue?: number
  predictedValue?: number
}

export interface CashFlowReportData {
  startDate: string
  endDate: string
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
  cashAccounts: string[]
  startCash: ReportValue
  endCash: ReportValue
  cashChange: ReportValue
  byActivity: {
    operating: CashFlowActivity
    investing: CashFlowActivity
    financing: CashFlowActivity
    uncategorized: CashFlowActivity
  }
  sankey: {
    nodes: Array<{
      name: string
      category?: 'income_category' | 'non_cash_source' | 'cash' | 'expense_category' | 'non_cash_target'
    }>
    links: SankeyLink[]
  }
  predictionNote?: string
}

// ===== 投资分析 =====

export interface InvestmentAccountDetail {
  id: string
  name: string
  categoryId: string | null
  categoryName: string
  icon?: string | null
  color?: string | null
  categoryIcon?: string | null
  categoryColor?: string | null
  balance: number
  ratio: number
  totalInvested: number
  totalWithdrawn: number
  maxCapitalEmployed: number
  simpleReturnRate: number
  cumulativeReturnRate: number
}

export interface InvestmentCategorySummary {
  categoryId: string
  categoryName: string
  icon?: string | null
  color?: string | null
  balance: number
  ratio: number
  accounts: InvestmentAccountDetail[]
}

export interface InvestmentReturnAnalysis {
  startValue: number
  endValue: number
  valueChange: number
  periodInvested: number
  periodWithdrawn: number
  netCashFlow: number
  periodReturn: number
  maxCapitalEmployed: number
  simpleReturnRate: number
  cumulativeReturnRate: number
  xirr: number | null
  twr: number | null
  annualizedTwr: number | null
  investmentDays: number
  cashFlowCount: number
}

export interface InvestmentTrendItem {
  month: string
  investment: number
  netWorth: number
  ratio: number
}

// ===== 投资资产类型 =====

export interface InvestmentAssetClass {
  id: string
  accountId: string
  name: string
  icon: string | null
  color: string | null
  targetRatio: number | null
  sort: number
  createdAt: string
  updatedAt: string
}

// ===== 投资快照 =====

export interface InvestmentAllocationItem {
  id: string
  snapshotId: string
  assetClassId: string
  marketValue: number
  periodNetFlow: number
  sort: number
  assetClass: InvestmentAssetClass
}

export interface InvestmentAllocationSnapshot {
  id: string
  accountId: string
  date: string
  accountBalance: number
  previousSnapshotId: string | null
  note: string | null
  items: InvestmentAllocationItem[]
  createdAt: string
  updatedAt: string
}

// ===== 投资分析报表扩展 =====

export interface AccountAllocationItem {
  assetClassId: string
  name: string
  icon: string | null
  color: string | null
  marketValue: number
  ratio: number
  targetRatio: number | null
  deviation: number | null
  rebalanceAmount: number | null
  periodInvested: number
  periodWithdrawn: number
  periodReturn: number | null
  returnRate: number | null
  sort: number
}

export interface SnapshotHistoryItem {
  id: string
  date: string
  accountBalance: number
  items: Array<{
    assetClassId: string
    name: string
    marketValue: number
    ratio: number
  }>
}

export interface AccountAllocationDetail {
  accountId: string
  accountName: string
  accountIcon: string | null
  accountColor: string | null
  balance: number
  hasAssetClasses: boolean
  latestSnapshotDate: string | null
  returnRate: number | null
  items: AccountAllocationItem[]
  snapshots: SnapshotHistoryItem[]
}

export interface StaleAccountInfo {
  accountId: string
  accountName: string
  daysSinceLastSnapshot: number
  balance: number
}

export interface InvestmentAnalysisReportData {
  startDate: string
  endDate: string
  totalInvestment: number
  totalAssets: number
  investmentRatio: number
  accountCount: number
  returnAnalysis: InvestmentReturnAnalysis
  byCategory: InvestmentCategorySummary[]
  trend: InvestmentTrendItem[]
  byAccountAllocation: AccountAllocationDetail[]
  staleAccounts: StaleAccountInfo[]
}
