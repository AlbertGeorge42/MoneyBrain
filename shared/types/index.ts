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
  balance: number
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
  amount: number
  period: string
  startDate: string
  endDate: string | null
  categoryId: string | null
  category: TransactionCategory | null
  createdAt: string
  updatedAt: string
}

export interface TransactionCategoryStats {
  transactionCount: number
  childrenCount: number
}

export interface BudgetStatus {
  budget: Budget
  used: number
  remaining: number
  percentage: number
  isOverBudget: boolean
}

// ===== 分析与报表 =====

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
  type: string
  balance: number
  category: string
  categorySort?: number
  categoryIcon?: string
  icon?: string
}

export interface BalanceSheetReportData {
  date: string
  granularity: 'day' | 'month' | 'year'
  assets: number
  liabilities: number
  netWorth: number
  assetsByCategory: Record<string, number>
  liabilitiesByCategory: Record<string, number>
  accounts: BalanceSheetAccountItem[]
}

export interface ReportCategoryDetail {
  name: string
  value: number
  categoryId: string
  hasChildren: boolean
  sort: number
}

export interface IncomeExpenseReportData {
  startDate: string
  endDate: string
  income: number
  expense: number
  balance: number
  incomeByCategory: Record<string, number>
  expenseByCategory: Record<string, number>
  incomeCategoryDetails: ReportCategoryDetail[]
  expenseCategoryDetails: ReportCategoryDetail[]
  startAssets: number
  startLiabilities: number
  startNetWorth: number
  endAssets: number
  endLiabilities: number
  endNetWorth: number
  assetChange: number
}

export interface CashFlowActivityItem {
  categoryName: string
  amount: number
  type: string
  direction: string
}

export interface CashFlowActivity {
  inflow: number
  outflow: number
  net: number
  items: CashFlowActivityItem[]
}

export interface SankeyLink {
  source: string
  target: string
  value: number
}

export interface CashFlowReportData {
  startDate: string
  endDate: string
  cashInflow: number
  cashOutflow: number
  netCashFlow: number
  flowByAccount: Record<string, { inflow: number; outflow: number }>
  cashAccounts: string[]
  startCash: number
  endCash: number
  cashChange: number
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
}
