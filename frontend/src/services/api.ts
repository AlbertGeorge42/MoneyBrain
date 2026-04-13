import axios from 'axios'
import { message } from 'antd'
import type {
  Account,
  AccountCategory,
  AccountStats,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  ApiResponse,
  BalanceSheetAccountItem,
  BalanceSheetReportData,
  Budget,
  BudgetStatus,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  PaginatedResponse,
  Transaction,
  TransactionCategory,
  TransactionCategoryStats,
} from '@shared/types'

export type {
  Account,
  AccountCategory,
  AccountStats,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  ApiResponse,
  BalanceSheetAccountItem,
  BalanceSheetReportData,
  Budget,
  BudgetStatus,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  PaginatedResponse,
  Transaction,
  TransactionCategory,
  TransactionCategoryStats,
}

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
  getStats: (id: string) => api.get<ApiResponse<AccountStats>>(`/accounts/${id}/stats`),
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
  getStats: (id: string) => api.get<ApiResponse<TransactionCategoryStats>>(`/categories/${id}/stats`),
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
  getStatus: (id: string) => api.get<ApiResponse<BudgetStatus>>(`/budgets/${id}/status`),
  create: (data: Partial<Budget>) => api.post<ApiResponse<Budget>>('/budgets', data),
  update: (id: string, data: Partial<Budget>) => api.put<ApiResponse<Budget>>(`/budgets/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/budgets/${id}`),
}

export const reportApi = {
  getBalanceSheet: (date: string) => api.get<ApiResponse<BalanceSheetReportData>>('/reports/balance-sheet', { params: { date } }),
  getIncomeExpense: (startDate: string, endDate: string) => api.get<ApiResponse<IncomeExpenseReportData>>('/reports/income-expense', { params: { startDate, endDate } }),
  getCashFlow: (startDate: string, endDate: string) => api.get<ApiResponse<CashFlowReportData>>('/reports/cash-flow', { params: { startDate, endDate } }),
  getInvestmentAnalysis: (startDate: string, endDate: string) => api.get<ApiResponse<InvestmentAnalysisReportData>>('/reports/investment-analysis', { params: { startDate, endDate } }),
}

export const analyticsApi = {
  getTrends: (type: 'income' | 'expense', period?: string) => api.get<ApiResponse<AnalyticsTrendItem[]>>('/analytics/trends', { params: { type, period } }),
  getCategoryBreakdown: (type: 'income' | 'expense', startDate?: string, endDate?: string, parentCategoryId?: string) => 
    api.get<ApiResponse<AnalyticsCategoryBreakdownItem[]>>('/analytics/category-breakdown', { 
      params: { type, startDate, endDate, parentCategoryId } 
    }),
  getAssetTrend: () => api.get<ApiResponse<AnalyticsAssetTrendItem[]>>('/analytics/asset-trend'),
}

export const dataApi = {
  clearAll: () => api.delete<ApiResponse<{ message: string }>>('/data/all'),
  clearTransactions: () => api.delete<ApiResponse<{ message: string }>>('/data/transactions'),
  exportCsv: () => api.get<Blob>('/data/export', { responseType: 'blob' }),
  importCsv: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return api.post<ApiResponse<{ imported: number; skipped: number; errors: string[] }>>('/data/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000,
    })
  },
}

export default api
