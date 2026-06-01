// ===== 通用响应类型 =====
export type { ApiResponse } from '../../backend/src/common/index.js'

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
  parentId: string | null
  sort: number
  parent: TransactionCategory | null
  children: TransactionCategory[]
  cashFlowType: 'operating' | 'investing' | 'financing' | null
  createdAt: string
  updatedAt: string
}

// ===== 交易 =====

export interface Transaction {
  id: string
  type: string // 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment'
  amount: number
  fee: number
  coupon: number
  date: string
  note: string | null
  isAdjustment: boolean
  accountId: string
  categoryId: string | null
  toAccountId: string | null
  relatedTransactionId: string | null
  relatedType: string | null // 'income' | 'expense'（退款时记录原交易类型）
  account: Account
  category: TransactionCategory | null
  toAccount: Account | null
  relatedTransaction: Transaction | null
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

export interface BalanceSheetAccountItem {
  id: string
  name: string
  type: 'asset' | 'liability'
  actual: number
  predicted: number
  category: string
  categorySort?: number
  categoryIcon?: string
  icon?: string
}

export interface BalanceSheetReportData {
  date: string
  granularity: 'day' | 'month' | 'year'
  assets: ReportValue
  liabilities: ReportValue
  netWorth: ReportValue
  assetsByCategory: Record<string, number>
  liabilitiesByCategory: Record<string, number>
  accounts: BalanceSheetAccountItem[]
  predictionNote?: string
}

export interface ReportCategoryDetail {
  name: string
  actual: number
  predicted: number
  categoryId: string
  hasChildren: boolean
  sort: number
}

export interface IncomeExpenseReportData {
  startDate: string
  endDate: string
  income: ReportValue
  expense: ReportValue
  balance: ReportValue
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
  amount: number
  type: string
  direction: string
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

export interface InvestmentCashFlow {
  date: string
  amount: number
  type: 'buy' | 'sell'
  accountId: string
  accountName: string
}

export interface InvestmentAccountDetail {
  id: string
  name: string
  categoryId: string | null
  categoryName: string
  categoryIcon: string | null
  icon: string | null
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
  icon: string | null
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
  balance: number
  hasAssetClasses: boolean
  latestSnapshotDate: string | null
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
