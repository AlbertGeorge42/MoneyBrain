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
  parent: AccountCategory | null
  children: AccountCategory[]
  createdAt: string
  updatedAt: string
}

export interface Account {
  id: string
  name: string
  type: string
  balance: number
  icon: string | null
  categoryId: string | null
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
  parent: Category | null
  children: Category[]
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  type: string
  amount: number
  date: string
  note: string | null
  accountId: string
  categoryId: string
  account: Account
  category: Category
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

export interface PaginatedResponse<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export const accountCategoryApi = {
  getAll: () => api.get<ApiResponse<AccountCategory[]>>('/account-categories'),
  getTree: () => api.get<ApiResponse<AccountCategory[]>>('/account-categories/tree'),
  getById: (id: string) => api.get<ApiResponse<AccountCategory>>(`/account-categories/${id}`),
  create: (data: Partial<AccountCategory>) => api.post<ApiResponse<AccountCategory>>('/account-categories', data),
  update: (id: string, data: Partial<AccountCategory>) => api.put<ApiResponse<AccountCategory>>(`/account-categories/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/account-categories/${id}`),
}

export const accountApi = {
  getAll: () => api.get<ApiResponse<Account[]>>('/accounts'),
  getById: (id: string) => api.get<ApiResponse<Account>>(`/accounts/${id}`),
  create: (data: Partial<Account>) => api.post<ApiResponse<Account>>('/accounts', data),
  update: (id: string, data: Partial<Account>) => api.put<ApiResponse<Account>>(`/accounts/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/accounts/${id}`),
}

export const categoryApi = {
  getAll: () => api.get<ApiResponse<Category[]>>('/categories'),
  getTree: () => api.get<ApiResponse<Category[]>>('/categories/tree'),
  getById: (id: string) => api.get<ApiResponse<Category>>(`/categories/${id}`),
  create: (data: Partial<Category>) => api.post<ApiResponse<Category>>('/categories', data),
  update: (id: string, data: Partial<Category>) => api.put<ApiResponse<Category>>(`/categories/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/categories/${id}`),
}

export const transactionApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<PaginatedResponse<Transaction>>>('/transactions', { params }),
  getById: (id: string) => api.get<ApiResponse<Transaction>>(`/transactions/${id}`),
  create: (data: Partial<Transaction>) => api.post<ApiResponse<Transaction>>('/transactions', data),
  update: (id: string, data: Partial<Transaction>) => api.put<ApiResponse<Transaction>>(`/transactions/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/transactions/${id}`),
}

export const budgetApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<Budget[]>>('/budgets', { params }),
  getById: (id: string) => api.get<ApiResponse<Budget>>(`/budgets/${id}`),
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
  getBalanceSheet: (date?: string) => api.get<ApiResponse<{
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
      category: string
    }>
  }>>('/reports/balance-sheet', { params: { date } }),
  getIncomeExpense: (startDate: string, endDate: string) => api.get<ApiResponse<{
    startDate: string
    endDate: string
    income: number
    expense: number
    balance: number
    incomeByCategory: Record<string, number>
    expenseByCategory: Record<string, number>
  }>>('/reports/income-expense', { params: { startDate, endDate } }),
  getCashFlow: (startDate: string, endDate: string) => api.get<ApiResponse<{
    startDate: string
    endDate: string
    cashInflow: number
    cashOutflow: number
    netCashFlow: number
    flowByAccount: Record<string, { inflow: number; outflow: number }>
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

export default api
