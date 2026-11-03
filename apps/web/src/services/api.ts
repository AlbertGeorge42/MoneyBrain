import axios from 'axios'
import type {
  Account,
  AccountCategory,
  AccountStats,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  ApiResponse,
  AuditEvent,
  AutoBackupConfig,
  BalanceSheetReportData,
  Budget,
  BudgetPrediction,
  BudgetStatus,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  InvestmentAssetClass,
  ImportFullResult,
  ImportPreview,
  InvestmentAllocationSnapshot,
  Minor,
  PaginatedResponse,
  RecycleBinItem,
  RollbackPoint,
  RollbackResult,
  Transaction,
  TransactionCategory,
  TransactionCategoryStats,
  TransactionType,
} from '@contracts/types'
import { normalizeApiError } from './apiError'
import { CLEAR_CONFIRM, ROLLBACK_CONFIRM } from '@contracts/constants'

export type {
  Account,
  AccountCategory,
  AccountStats,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  ApiResponse,
  AuditEvent,
  AutoBackupConfig,
  BalanceSheetReportData,
  Budget,
  BudgetPrediction,
  BudgetStatus,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  InvestmentAssetClass,
  ImportFullResult,
  ImportPreview,
  InvestmentAllocationSnapshot,
  Minor,
  PaginatedResponse,
  RecycleBinItem,
  RollbackPoint,
  RollbackResult,
  Transaction,
  TransactionCategory,
  TransactionCategoryStats,
  TransactionType,
}

export { ApiClientError, getApiErrorMessage, getApiErrorRequestId } from './apiError'
export { unwrapApiData } from './apiResult'

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    // 统一归一化错误：所有失败都以 ApiClientError 抛出。
    // 不在此处弹错，UI 提示由 useNotify() 在组件层显式触发。
    return Promise.reject(normalizeApiError(error))
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
    api.get<ApiResponse<{ accountId: string; date: string; balance: Minor }>>(
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
    deletedIncomingTransfers?: number
    deletedBudgets?: number
    deletedAssetClasses?: number
    deletedSnapshots?: number
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
  getStats: (params?: Record<string, unknown>) => api.get<ApiResponse<{ income: Minor; expense: Minor; refund: Minor; balance: Minor; transferCount: number }>>('/transactions/stats', { params }),
  getEarliestDate: () => api.get<ApiResponse<{ date: string | null }>>('/transactions/earliest'),
  getRefundableList: () => api.get<ApiResponse<Transaction[]>>('/transactions/refundable/list'),
  create: (data: Partial<Transaction>) => api.post<ApiResponse<Transaction>>('/transactions', data),
  update: (id: string, data: Partial<Transaction>) => api.put<ApiResponse<Transaction>>(`/transactions/${id}`, data),
  // 软删除：返回审计事件 id，前端提示「已删除 · 撤销」
  delete: (id: string) => api.delete<ApiResponse<{ message: string; auditEventId: string }>>(`/transactions/${id}`),
  getHistory: (id: string) => api.get<ApiResponse<{ list: AuditEvent[] }>>(`/transactions/${id}/history`),
  getRecycleBin: () => api.get<ApiResponse<{ list: RecycleBinItem[] }>>('/transactions/recycle-bin'),
}

export const auditEventApi = {
  // 撤销 = 审计事件反向写入；回收站的「恢复」与删除提示条的「撤销」共用此端点
  undo: (id: string) => api.post<ApiResponse<Transaction>>(`/audit-events/${id}/undo`),
}

export const budgetApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<Budget[]>>('/budgets', { params }),
  getStatuses: (ids: string[]) => api.get<ApiResponse<BudgetStatus[]>>('/budgets/statuses', { params: { ids } }),
  getPredictions: (startDate: string, endDate: string) => api.get<ApiResponse<BudgetPrediction[]>>('/budgets/predictions', { params: { startDate, endDate } }),
  create: (data: Partial<Budget>) => api.post<ApiResponse<Budget>>('/budgets', data),
  update: (id: string, data: Partial<Budget>) => api.put<ApiResponse<Budget>>(`/budgets/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<{ message: string }>>(`/budgets/${id}`),
}

export const reportApi = {
  getBalanceSheet: (date: string) => api.get<ApiResponse<BalanceSheetReportData>>('/reports/balance-sheet', { params: { date } }),
  getIncomeExpense: (startDate: string, endDate: string, includePredictions?: boolean, includeExcluded?: boolean) =>
    api.get<ApiResponse<IncomeExpenseReportData>>('/reports/income-expense', {
      params: { startDate, endDate, includePredictions: includePredictions ? 'true' : undefined, includeExcluded: includeExcluded ? 'true' : undefined },
    }),
  getCashFlow: (startDate: string, endDate: string, includePredictions?: boolean) =>
    api.get<ApiResponse<CashFlowReportData>>('/reports/cash-flow', {
      params: { startDate, endDate, includePredictions: includePredictions ? 'true' : undefined },
    }),
  getInvestmentAnalysis: (startDate: string, endDate: string) => api.get<ApiResponse<InvestmentAnalysisReportData>>('/reports/investment-analysis', { params: { startDate, endDate } }),
}

export const analyticsApi = {
  getDashboardSummary: () => api.get<ApiResponse<{
    thisMonth: { income: Minor; expense: Minor; balance: Minor }
    lastMonth: { income: Minor; expense: Minor }
    recentTransactions: Transaction[]
  }>>('/analytics/dashboard'),
  getTrends: (type: 'income' | 'expense', period?: string) => api.get<ApiResponse<AnalyticsTrendItem[]>>('/analytics/trends', { params: { type, period } }),
  getCategoryBreakdown: (type: 'income' | 'expense', startDate?: string, endDate?: string, parentCategoryId?: string) => 
    api.get<ApiResponse<AnalyticsCategoryBreakdownItem[]>>('/analytics/category-breakdown', { 
      params: { type, startDate, endDate, parentCategoryId } 
    }),
  getAssetTrend: () => api.get<ApiResponse<AnalyticsAssetTrendItem[]>>('/analytics/asset-trend'),
}

export const dataApi = {
  // 清空数据不可逆：必须带确认值，服务端会校验
  clearAll: () => api.delete<ApiResponse<{ message: string }>>('/data/all', {
    data: { confirm: CLEAR_CONFIRM.all },
  }),
  clearTransactions: () => api.delete<ApiResponse<{ message: string }>>('/data/transactions', {
    data: { confirm: CLEAR_CONFIRM.transactions },
  }),
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
  importBackup: (file: File, params: { mode: 'merge' | 'overwrite'; includes?: string[] }) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', params.mode)
    if (params.includes) {
      formData.append('includes', JSON.stringify(params.includes))
    }
    return api.post<ApiResponse<ImportFullResult & { rollbackPointId?: string }>>(
      '/data/import-backup',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 120000,
      }
    )
  },
  // 导入预览：与正式导入同一套逻辑，只是跑完就回滚
  previewImport: (file: File, params: { mode: 'merge' | 'overwrite'; includes?: string[] }) => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('mode', params.mode)
    if (params.includes) {
      formData.append('includes', JSON.stringify(params.includes))
    }
    return api.post<ApiResponse<ImportPreview>>('/data/import-preview', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 120000,
    })
  },
  listRollbackPoints: () => api.get<ApiResponse<RollbackPoint[]>>('/data/rollback-points'),
  // ─── 自动定时备份（B3）───
  getAutoBackup: () => api.get<ApiResponse<AutoBackupConfig>>('/data/auto-backup'),
  // 云同步目录默认被后端拒绝；confirmCloudDirectory: true 表示用户已确认「将定时产生全量明文账本副本」
  updateAutoBackup: (data: Partial<Pick<AutoBackupConfig, 'enabled' | 'directory'>> & { confirmCloudDirectory?: boolean }) =>
    api.put<ApiResponse<AutoBackupConfig>>('/data/auto-backup', data),
  // 回滚会用快照覆盖当前数据，不可逆：必须带确认值
  restoreRollbackPoint: (id: string) =>
    api.post<ApiResponse<RollbackResult>>(`/data/rollback-points/${id}/restore`, {
      confirm: ROLLBACK_CONFIRM.restore,
    }),
  deleteRollbackPoint: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/data/rollback-points/${id}`),
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
      marketValue: Minor
      periodNetFlow?: Minor
    }>
    note?: string
  }) => api.post<ApiResponse<InvestmentAllocationSnapshot>>('/investments/allocations', data),

  updateSnapshot: (id: string, data: {
    date: string
    items: Array<{
      assetClassId: string
      marketValue: Minor
      periodNetFlow?: Minor
    }>
    note?: string
  }) => api.put<ApiResponse<InvestmentAllocationSnapshot>>(`/investments/allocations/${id}`, data),

  deleteSnapshot: (id: string) =>
    api.delete<ApiResponse<{ message: string }>>(`/investments/allocations/${id}`),
}

export default api
