import axios from 'axios'
import { message } from 'antd'
import type { ApiResponse, PaginatedResponse, AccountCategory, Account, TransactionCategory, Transaction, Budget } from '@shared/types'

export type { ApiResponse, PaginatedResponse, AccountCategory, Account, TransactionCategory, Transaction, Budget }

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const msg = error.response?.data?.error?.message || error.message || '请求失败'
    message.error(msg)
    return Promise.reject(error)
  }
)

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
  adjust: (id: string, data: { amount: number; date?: string; note?: string }) =>
    api.post<ApiResponse<{ transaction: Transaction; newBalance: number }>>(`/accounts/${id}/adjust`, data),
  batchAdjust: (data: { adjustments: Array<{ accountId: string; amount: number }>; date?: string; note?: string }) =>
    api.post<ApiResponse<{ date: string; count: number; adjustments: Array<{
      accountId: string
      accountName: string
      amount: number
      transactionId: string
      newBalance: number
    }> }>>('/accounts/batch-adjust', data),
}

export const transactionCategoryApi = {
  getAll: () => api.get<ApiResponse<TransactionCategory[]>>('/categories'),
  create: (data: Partial<TransactionCategory>) => api.post<ApiResponse<TransactionCategory>>('/categories', data),
  update: (id: string, data: Partial<TransactionCategory>) => api.put<ApiResponse<TransactionCategory>>(`/categories/${id}`, data),
  updateSort: (items: Array<{ id: string; sort: number; parentId: string | null }>) => 
    api.put<ApiResponse<{ message: string }>>('/categories/sort/batch', { items }),
  delete: (id: string, params?: { transferToCategoryId?: string; deleteTransactions?: boolean }) => 
    api.delete<ApiResponse<{ 
      message: string
      transferredTransactions?: number
      deletedTransactions?: number
      deletedCategory?: string
    }>>(`/categories/${id}`, { params }),
  getStats: (id: string) => 
    api.get<ApiResponse<{ 
      transactionCount: number
      childrenCount: number 
    }>>(`/categories/${id}/stats`),
  move: (id: string, data: { newParentId: string | null }) => 
    api.put<ApiResponse<{ message: string; movedCategory: TransactionCategory }>>(`/categories/${id}/move`, data),
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
      category: string
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
    incomeCategoryDetails: Array<{ name: string; value: number; categoryId: string; hasChildren: boolean }>
    expenseCategoryDetails: Array<{ name: string; value: number; categoryId: string; hasChildren: boolean }>
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
  getCategoryBreakdown: (type: 'income' | 'expense', startDate?: string, endDate?: string, parentCategoryId?: string) => 
    api.get<ApiResponse<Array<{ name: string; value: number; categoryId?: string; hasChildren?: boolean }>>>('/analytics/category-breakdown', { 
      params: { type, startDate, endDate, parentCategoryId } 
    }),
  getAssetTrend: () => api.get<ApiResponse<Array<{
    label: string
    assets: number
    liabilities: number
    netWorth: number
  }>>>('/analytics/asset-trend'),
}

export const dataApi = {
  clearAll: () => api.delete<ApiResponse<{ message: string }>>('/data/all'),
  clearTransactions: () => api.delete<ApiResponse<{ message: string }>>('/data/transactions'),
}

export default api
