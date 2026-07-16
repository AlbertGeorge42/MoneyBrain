import axios from 'axios'
import type {
  Account,
  AccountCategory,
  AccountStats,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  ApiResponse,
  BalanceSheetReportData,
  Budget,
  BudgetPrediction,
  BudgetStatus,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  InvestmentAssetClass,
  InvestmentAllocationSnapshot,
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
  BalanceSheetReportData,
  Budget,
  BudgetPrediction,
  BudgetStatus,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  InvestmentAssetClass,
  InvestmentAllocationSnapshot,
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

function isTransaction(obj: unknown): obj is Record<string, unknown> {
  if (!obj || typeof obj !== 'object') return false
  return 'type' in obj && 'amount' in obj
}

function isTransactionList(obj: unknown): obj is { list?: unknown[] } {
  if (!obj || typeof obj !== 'object') return false
  return 'list' in obj
}

function transformTransactionFields(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map(transformTransactionFields)
  }
  if (isTransaction(data)) {
    const result: Record<string, unknown> = { ...data }
    if (typeof result.amount === 'string') result.amount = parseFloat(result.amount)
    if (typeof result.fee === 'string') result.fee = parseFloat(result.fee)
    if (typeof result.coupon === 'string') result.coupon = parseFloat(result.coupon)
    if (result.relatedTransaction) {
      result.relatedTransaction = transformTransactionFields(result.relatedTransaction)
    }
    return result
  }
  if (isTransactionList(data)) {
    return { ...data, list: (data.list || []).map(transformTransactionFields) }
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const result: Record<string, unknown> = {}
    for (const key of Object.keys(data as object)) {
      result[key] = transformTransactionFields((data as Record<string, unknown>)[key])
    }
    return result
  }
  return data
}

api.interceptors.response.use(
  (response) => {
    if (response.data?.data) {
      response.data.data = transformTransactionFields(response.data.data)
    }
    return response
  },
  (error) => {
    // 仅做错误归一化：把后端业务消息提取到 error.message，
    // 不在此处弹错。UI 提示由 useNotify() 在组件层显式触发。
    const apiMessage = error.response?.data?.error?.message
    if (apiMessage) {
      error.message = apiMessage
    }
    return Promise.reject(error)
  },
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
  getBalanceAt: (id: string, date: string) =>
    api.get<ApiResponse<{ accountId: string; date: string; balance: number }>>(
      `/accounts/${id}/balance-at`,
      { params: { date } }
    ),
  create: (data: Partial<Account>) => api.post<ApiResponse<Account>>('/accounts', data),
  update: (id: string, data: Partial<Account>) => api.put<ApiResponse<Account>>(`/accounts/${id}`, data),
  updateSort: (items: Array<{ id: string; sort: number; categoryId: string | null }>) =>
    api.put<ApiResponse<{ message: string }>>('/accounts/sort/batch', { items }),
  delete: (id: string, force?: boolean) => api.delete<ApiResponse<{
    message: string
    deletedTransactions?: number
  }>>(`/accounts/${id}`, { params: { force } }),
}

export const transactionCategoryApi = {
  getAll: () => api.get<ApiResponse<TransactionCategory[]>>('/transaction-categories'),
  create: (data: Partial<TransactionCategory>) => api.post<ApiResponse<TransactionCategory>>('/transaction-categories', data),
  update: (id: string, data: Partial<TransactionCategory>) => api.put<ApiResponse<TransactionCategory>>(`/transaction-categories/${id}`, data),
  updateSort: (items: Array<{ id: string; sort: number; parentId: string | null }>) => 
    api.put<ApiResponse<{ message: string }>>('/transaction-categories/sort/batch', { items }),
  delete: (id: string, params?: { transferToCategoryId?: string; deleteTransactions?: boolean }) => 
    api.delete<ApiResponse<{ 
      message: string
      transferredTransactions?: number
      deletedTransactions?: number
      deletedCategory?: string
    }>>(`/transaction-categories/${id}`, { params }),
  getStats: (id: string) => api.get<ApiResponse<TransactionCategoryStats>>(`/transaction-categories/${id}/stats`),
  move: (id: string, data: { newParentId: string | null }) => 
    api.put<ApiResponse<{ message: string; movedCategory: TransactionCategory }>>(`/transaction-categories/${id}/move`, data),
}

export const transactionApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<PaginatedResponse<Transaction>>>('/transactions', { params }),
  getStats: (params?: Record<string, unknown>) => api.get<ApiResponse<{ income: number; expense: number; refund: number; balance: number; transferCount: number }>>('/transactions/stats', { params }),
  getEarliestDate: () => api.get<ApiResponse<{ date: string | null }>>('/transactions/earliest'),
  getRefundableList: () => api.get<ApiResponse<Transaction[]>>('/transactions/refundable/list'),
  create: (data: Partial<Transaction>) => api.post<ApiResponse<Transaction>>('/transactions', data),
  update: (id: string, data: Partial<Transaction>) => api.put<ApiResponse<Transaction>>(`/transactions/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/transactions/${id}`),
}

export const budgetApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<Budget[]>>('/budgets', { params }),
  getStatus: (id: string) => api.get<ApiResponse<BudgetStatus>>(`/budgets/${id}/status`),
  getStatuses: (ids: string[]) => api.get<ApiResponse<BudgetStatus[]>>('/budgets/statuses', { params: { ids } }),
  getPredictions: (startDate: string, endDate: string) => api.get<ApiResponse<BudgetPrediction[]>>('/budgets/predictions', { params: { startDate, endDate } }),
  create: (data: Partial<Budget>) => api.post<ApiResponse<Budget>>('/budgets', data),
  update: (id: string, data: Partial<Budget>) => api.put<ApiResponse<Budget>>(`/budgets/${id}`, data),
  patch: (id: string, data: Partial<Budget>) => api.patch<ApiResponse<Budget>>(`/budgets/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/budgets/${id}`),
}

export const reportApi = {
  getBalanceSheet: (date: string) => api.get<ApiResponse<BalanceSheetReportData>>('/reports/balance-sheet', { params: { date } }),
  getIncomeExpense: (startDate: string, endDate: string, includePredictions?: boolean) =>
    api.get<ApiResponse<IncomeExpenseReportData>>('/reports/income-expense', {
      params: { startDate, endDate, includePredictions: includePredictions ? 'true' : undefined },
    }),
  getCashFlow: (startDate: string, endDate: string, includePredictions?: boolean) =>
    api.get<ApiResponse<CashFlowReportData>>('/reports/cash-flow', {
      params: { startDate, endDate, includePredictions: includePredictions ? 'true' : undefined },
    }),
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

export interface ImportFullResult {
  imported: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    transactions: number
    budgets: number
    investmentSnapshots: number
    investmentItems: number
  }
  updated: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    budgets: number
    investmentSnapshots: number
  }
  skipped: {
    accountCategories: number
    accounts: number
    transactionCategories: number
    transactions: number
    budgets: number
    investmentSnapshots: number
  }
  errors: string[]
}

export const dataApi = {
  clearAll: () => api.delete<ApiResponse<{ message: string }>>('/data/all'),
  clearTransactions: () => api.delete<ApiResponse<{ message: string }>>('/data/transactions'),
  // 新的备份API
  exportFull: () => {
    return api.get<Blob>('/data/export-full', {
      responseType: 'blob',
    })
  },
  exportCustom: (params: { includes: string[] }) => {
    return api.post<Blob>('/data/export-custom', params, {
      responseType: 'blob',
    })
  },
  importBackup: (file: File, params: { mode: 'merge' | 'overwrite' }) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', params.mode)
    return api.post<ApiResponse<ImportFullResult>>('/data/import-backup', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000,
    })
  },
  detectFileIncludes: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<ApiResponse<{ includes: string[] }>>('/data/detect-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
}

export const investmentApi = {
  getAssetClasses: (accountId: string) =>
    api.get<ApiResponse<InvestmentAssetClass[]>>(`/investments/${accountId}/asset-classes`),

  createAssetClass: (accountId: string, data: Partial<InvestmentAssetClass>) =>
    api.post<ApiResponse<InvestmentAssetClass>>(`/investments/${accountId}/asset-classes`, data),

  updateAssetClass: (id: string, data: Partial<InvestmentAssetClass>) =>
    api.put<ApiResponse<InvestmentAssetClass>>(`/investments/asset-classes/${id}`, data),

  deleteAssetClass: (id: string, forceDelete = false) =>
    api.delete<ApiResponse<{ message: string; needConfirm?: boolean; snapshotsCount?: number; deletedSnapshots?: number }>>(`/investments/asset-classes/${id}`, {
      params: { forceDelete },
    }),

  reorderAssetClasses: (accountId: string, orderedIds: string[]) =>
    api.put<ApiResponse<{ message: string }>>(`/investments/${accountId}/asset-classes/reorder`, { orderedIds }),

  getSnapshots: (accountId: string, startDate?: string, endDate?: string) =>
    api.get<ApiResponse<InvestmentAllocationSnapshot[]>>('/investments/allocations', { params: { accountId, startDate, endDate } }),

  getLatestSnapshot: (accountId: string, beforeDate?: string) =>
    api.get<ApiResponse<InvestmentAllocationSnapshot | null>>('/investments/allocations/latest', { params: { accountId, beforeDate } }),

  saveSnapshot: (data: {
    accountId: string
    date: string
    items: Array<{
      assetClassId: string
      marketValue: number
      periodNetFlow?: number
    }>
    note?: string
  }) => api.post<ApiResponse<InvestmentAllocationSnapshot>>('/investments/allocations', data),

  updateSnapshot: (id: string, data: {
    date: string
    items: Array<{
      assetClassId: string
      marketValue: number
      periodNetFlow?: number
    }>
    note?: string
  }) => api.put<ApiResponse<InvestmentAllocationSnapshot>>(`/investments/allocations/${id}`, data),

  deleteSnapshot: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/investments/allocations/${id}`),
}

export default api
