import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
  timestamp: string
}

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
  createdAt: string
  updatedAt: string
}

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

export interface Category {
  id: string
  name: string
  type: string
  icon: string | null
  parentId: string | null
  sort: number
  parent: Category | null
  children: Category[]
  cashFlowType: 'operating' | 'investing' | 'financing' | null
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  type: string // 'income' | 'expense' | 'transfer' | 'refund'
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
  account: Account
  category: Category | null
  toAccount: Account | null
  relatedTransaction: Transaction | null
  createdAt: string
}

export interface Budget {
  id: string
  name: string
  amount: number
  period: string
  startDate: string
  endDate: string | null
  categoryId: string | null
  category: Category | null
  createdAt: string
  updatedAt: string
}

export interface BalanceSnapshot {
  id: string
  month: string
  accountId: string
  account: Account
  balance: number
  isManual: boolean
  createdAt: string
  updatedAt: string
}

export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export const accountCategoryApi = {
  getAll: () => api.get<ApiResponse<AccountCategory[]>>('/account-categories'),
  create: (data: Partial<AccountCategory>) => api.post<ApiResponse<AccountCategory>>('/account-categories', data),
  update: (id: string, data: Partial<AccountCategory>) => api.put<ApiResponse<AccountCategory>>(`/account-categories/${id}`, data),
  updateSort: (items: Array<{ id: string; sort: number; parentId: string | null }>) => 
    api.put<ApiResponse<{ message: string }>>('/account-categories/sort/batch', { items }),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/account-categories/${id}`),
}

export const accountApi = {
  getAll: () => api.get<ApiResponse<Account[]>>('/accounts'),
  getStats: (id: string) => api.get<ApiResponse<{
    transactionCount: number
    totalIncome: number
    totalExpense: number
  }>>(`/accounts/${id}/stats`),
  create: (data: Partial<Account>) => api.post<ApiResponse<Account>>('/accounts', data),
  update: (id: string, data: Partial<Account>) => api.put<ApiResponse<Account>>(`/accounts/${id}`, data),
  updateSort: (items: Array<{ id: string; sort: number; categoryId: string | null }>) => 
    api.put<ApiResponse<{ message: string }>>('/accounts/sort/batch', { items }),
  delete: (id: string, force?: boolean) => api.delete<ApiResponse<{ 
    message: string
    deletedTransactions?: number 
  }>>(`/accounts/${id}`, { params: { force } }),
}

export const categoryApi = {
  getAll: () => api.get<ApiResponse<Category[]>>('/categories'),
  create: (data: Partial<Category>) => api.post<ApiResponse<Category>>('/categories', data),
  update: (id: string, data: Partial<Category>) => api.put<ApiResponse<Category>>(`/categories/${id}`, data),
  updateSort: (items: Array<{ id: string; sort: number; parentId: string | null }>) => 
    api.put<ApiResponse<{ message: string }>>('/categories/sort/batch', { items }),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/categories/${id}`),
}

export const transactionApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<PaginatedResponse<Transaction>>>('/transactions', { params }),
  getStats: (params?: Record<string, unknown>) => api.get<ApiResponse<{ income: number; expense: number; refund: number; balance: number; transferCount: number }>>('/transactions/stats', { params }),
  getRefundableList: () => api.get<ApiResponse<Transaction[]>>('/transactions/refundable/list'),
  create: (data: Partial<Transaction>) => api.post<ApiResponse<Transaction>>('/transactions', data),
  update: (id: string, data: Partial<Transaction>) => api.put<ApiResponse<Transaction>>(`/transactions/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/transactions/${id}`),
}

export const budgetApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<Budget[]>>('/budgets', { params }),
  getStatus: (id: string) => api.get<ApiResponse<{
    budget: Budget
    used: number
    remaining: number
    percentage: number
    isOverBudget: boolean
  }>>(`/budgets/${id}/status`),
  create: (data: Partial<Budget>) => api.post<ApiResponse<Budget>>('/budgets', data),
  update: (id: string, data: Partial<Budget>) => api.put<ApiResponse<Budget>>(`/budgets/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/budgets/${id}`),
}

export const reportApi = {
  getBalanceSheet: (month: string) => api.get<ApiResponse<{
    month: string
    date: string
    assets: number
    liabilities: number
    netWorth: number
    assetsByCategory: Record<string, number>
    liabilitiesByCategory: Record<string, number>
    accounts: Array<{
      id: string
      name: string
      type: string
      balance: number
      calculatedBalance: number
      category: string
      isManual: boolean
    }>
  }>>('/reports/balance-sheet', { params: { month } }),
  getIncomeExpense: (startDate: string, endDate: string) => api.get<ApiResponse<{
    startDate: string
    endDate: string
    income: number
    expense: number
    balance: number
    incomeByCategory: Record<string, number>
    expenseByCategory: Record<string, number>
    startAssets: number
    startLiabilities: number
    startNetWorth: number
    endAssets: number
    endLiabilities: number
    endNetWorth: number
    assetChange: number
  }>>('/reports/income-expense', { params: { startDate, endDate } }),
  getCashFlow: (startDate: string, endDate: string) => api.get<ApiResponse<{
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
      operating: { inflow: number; outflow: number; net: number; items: Array<{ categoryName: string; amount: number; type: string }> }
      investing: { inflow: number; outflow: number; net: number; items: Array<{ categoryName: string; amount: number; type: string }> }
      financing: { inflow: number; outflow: number; net: number; items: Array<{ categoryName: string; amount: number; type: string }> }
      uncategorized: { inflow: number; outflow: number; net: number; items: Array<{ categoryName: string; amount: number; type: string }> }
    }
  }>>('/reports/cash-flow', { params: { startDate, endDate } }),
}

export const analyticsApi = {
  getTrends: (type: 'income' | 'expense', period?: string) => api.get<ApiResponse<Array<{
    label: string
    amount: number
  }>>>('/analytics/trends', { params: { type, period } }),
  getCategoryBreakdown: (type: 'income' | 'expense', startDate?: string, endDate?: string) => 
    api.get<ApiResponse<Array<{ name: string; value: number }>>>('/analytics/category-breakdown', { 
      params: { type, startDate, endDate } 
    }),
  getAssetTrend: () => api.get<ApiResponse<Array<{
    label: string
    assets: number
    liabilities: number
    netWorth: number
  }>>>('/analytics/asset-trend'),
}

export const balanceSnapshotApi = {
  getAll: (month?: string) => api.get<ApiResponse<BalanceSnapshot[]>>('/balance-snapshots', { params: { month } }),
  create: (data: { month: string; accountId: string; balance: number; isManual?: boolean }) => 
    api.post<ApiResponse<BalanceSnapshot>>('/balance-snapshots', data),
  batchCreate: (data: { month: string; snapshots: Array<{ accountId: string; balance: number }> }) => 
    api.post<ApiResponse<BalanceSnapshot[]>>('/balance-snapshots/batch', data),
  adjust: (data: { month: string; adjustments: Array<{ accountId: string; targetBalance: number }> }) =>
    api.post<ApiResponse<{ month: string; adjustments: Array<{
      accountId: string
      accountName: string
      calculatedBalance: number
      targetBalance: number
      difference: number
      transaction: string | null
    }> }>>('/balance-snapshots/adjust', data),
  delete: (month: string, accountId: string) => 
    api.delete<ApiResponse<{ message: string }>>(`/balance-snapshots/${month}/${accountId}`),
}

export const dataApi = {
  clearAll: () => api.delete<ApiResponse<{ message: string }>>('/data/all'),
}

export default api
