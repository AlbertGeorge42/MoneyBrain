import axios from 'axios'
import type {
  Account,
  AccountBalanceAtResult,
  AccountCategory,
  AccountDeleteResult,
  AccountReconcileResult,
  AccountStats,
  AnalyticsAssetTrendItem,
  AnalyticsCategoryBreakdownItem,
  AnalyticsTrendItem,
  AssetProjectionResult,
  ApiResponse,
  AuditEvent,
  AuditEventHistoryResult,
  AutoBackupConfig,
  BalanceSheetReportData,
  Budget,
  BudgetPeriodPlanResult,
  BudgetPrediction,
  BudgetStatus,
  BudgetUsageDetails,
  CashFlowProjectionResult,
  CashFlowReportData,
  DashboardSummaryData,
  DetectFileResult,
  EarliestTransactionDateResult,
  ImportBackupResult,
  ImportBatch,
  ImportBatchRollbackResult,
  ImportFileSummary,
  ImportFullResult,
  ImportPreview,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  InvestmentAssetClass,
  InvestmentAllocationSnapshot,
  MessageResult,
  Minor,
  PaginatedResponse,
  ProjectionGranularity,
  RecycleBinItem,
  RecycleBinResult,
  RollbackPoint,
  RollbackResult,
  Transaction,
  TransactionCategory,
  TransactionCategoryDeleteResult,
  TransactionCategoryMoveResult,
  TransactionCategoryStats,
  TransactionDeleteResult,
  TransactionStats,
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
  AssetProjectionResult,
  AuditEvent,
  AutoBackupConfig,
  BalanceSheetReportData,
  Budget,
  BudgetPeriodPlanResult,
  BudgetPrediction,
  BudgetStatus,
  BudgetUsageDetails,
  CashFlowProjectionResult,
  CashFlowReportData,
  IncomeExpenseReportData,
  InvestmentAnalysisReportData,
  InvestmentAssetClass,
  ImportFullResult,
  ImportBackupResult,
  ImportPreview,
  ImportBatch,
  ImportBatchRollbackResult,
  ImportFileSummary,
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
    api.put<ApiResponse<MessageResult>>('/account-categories/sort/batch', { items }),
  delete: (id: string) => api.delete<ApiResponse<MessageResult>>(`/account-categories/${id}`),
}

export const accountApi = {
  getAll: () => api.get<ApiResponse<Account[]>>('/accounts'),
  getStats: (id: string) => api.get<ApiResponse<AccountStats>>(`/accounts/${id}/stats`),
  getBalanceAt: (id: string, date: string) =>
    api.get<ApiResponse<AccountBalanceAtResult>>(
      `/accounts/${id}/balance-at`,
      { params: { date } }
    ),
  create: (data: Partial<Account>) => api.post<ApiResponse<Account>>('/accounts', data),
  update: (id: string, data: Partial<Account>) => api.put<ApiResponse<Account>>(`/accounts/${id}`, data),
  /** 一键对账：给出真实余额，后端算差额并生成 adjustment 分录。 */
  reconcile: (
    id: string,
    data: {
      date: string
      actualBalance: Minor
      note?: string
      mode?: 'overwrite' | 'append'
    },
  ) => api.post<ApiResponse<AccountReconcileResult>>(`/accounts/${id}/reconcile`, data),
  updateSort: (items: Array<{ id: string; sort: number; categoryId: string | null }>) =>
    api.put<ApiResponse<MessageResult>>('/accounts/sort/batch', { items }),
  delete: (id: string, force?: boolean) => api.delete<ApiResponse<AccountDeleteResult>>(`/accounts/${id}`, { params: { force } }),
}

export const transactionCategoryApi = {
  getAll: () => api.get<ApiResponse<TransactionCategory[]>>('/transaction-categories'),
  create: (data: Partial<TransactionCategory>) => api.post<ApiResponse<TransactionCategory>>('/transaction-categories', data),
  update: (id: string, data: Partial<TransactionCategory>) => api.put<ApiResponse<TransactionCategory>>(`/transaction-categories/${id}`, data),
  updateSort: (items: Array<{ id: string; sort: number; parentId: string | null }>) => 
    api.put<ApiResponse<MessageResult>>('/transaction-categories/sort/batch', { items }),
  delete: (id: string, params?: { transferToCategoryId?: string; deleteTransactions?: boolean }) =>
    api.delete<ApiResponse<TransactionCategoryDeleteResult>>(`/transaction-categories/${id}`, { params }),
  getStats: (id: string) => api.get<ApiResponse<TransactionCategoryStats>>(`/transaction-categories/${id}/stats`),
  move: (id: string, data: { newParentId: string | null }) =>
    api.put<ApiResponse<TransactionCategoryMoveResult>>(`/transaction-categories/${id}/move`, data),
}

export const transactionApi = {
  getAll: (params?: Record<string, unknown> | URLSearchParams) => api.get<ApiResponse<PaginatedResponse<Transaction>>>('/transactions', { params }),
  getStats: (params?: Record<string, unknown> | URLSearchParams) => api.get<ApiResponse<TransactionStats>>('/transactions/stats', { params }),
  getEarliestDate: () => api.get<ApiResponse<EarliestTransactionDateResult>>('/transactions/earliest'),
  getRefundableList: () => api.get<ApiResponse<Transaction[]>>('/transactions/refundable/list'),
  create: (data: Partial<Transaction>) => api.post<ApiResponse<Transaction>>('/transactions', data),
  update: (id: string, data: Partial<Transaction>) => api.put<ApiResponse<Transaction>>(`/transactions/${id}`, data),
  // 软删除：返回审计事件 id，前端提示「已删除 · 撤销」
  delete: (id: string) => api.delete<ApiResponse<TransactionDeleteResult>>(`/transactions/${id}`),
  getHistory: (id: string) => api.get<ApiResponse<AuditEventHistoryResult>>(`/transactions/${id}/history`),
  getRecycleBin: () => api.get<ApiResponse<RecycleBinResult>>('/transactions/recycle-bin'),
}

export const auditEventApi = {
  // 撤销 = 审计事件反向写入；回收站的「恢复」与删除提示条的「撤销」共用此端点
  undo: (id: string) => api.post<ApiResponse<Transaction>>(`/audit-events/${id}/undo`),
}

export const budgetApi = {
  getAll: (params?: Record<string, unknown>) => api.get<ApiResponse<Budget[]>>('/budgets', { params }),
  // date：按该日所在周期结算（预算页浏览历史月份）；缺省后端用今天
  getStatuses: (ids: string[], date?: string) =>
    api.get<ApiResponse<BudgetStatus[]>>('/budgets/statuses', { params: date ? { ids, date } : { ids } }),
  // 预算下钻明细（C2）：与用量同一口径，条数与合计 == 预算用量
  getUsageDetails: (id: string) => api.get<ApiResponse<BudgetUsageDetails>>(`/budgets/${id}/usage-details`),
  getPredictions: (startDate: string, endDate: string) => api.get<ApiResponse<BudgetPrediction[]>>('/budgets/predictions', { params: { startDate, endDate } }),
  // 同一套 from/to + granularity 窗口（日 / 周 / 月 / 年）；budgets[] 按 occurrence 日期归组。
  getPeriodPlanWindow: (window: ProjectionQueryWindow) =>
    api.get<ApiResponse<BudgetPeriodPlanResult>>('/budgets/period-plan', { params: window }),
  create: (data: Partial<Budget>) => api.post<ApiResponse<Budget>>('/budgets', data),
  update: (id: string, data: Partial<Budget>) => api.put<ApiResponse<Budget>>(`/budgets/${id}`, data),
  delete: (id: string) => api.delete<ApiResponse<MessageResult>>(`/budgets/${id}`),
}

/** 两个投影端点共用的窗口参数：from/to 为闭区间，桶由后端向外对齐。 */
export interface ProjectionQueryWindow {
  asOf: string
  granularity: ProjectionGranularity
  from: string
  to: string
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
  // 未来现金流推演：逐桶 inflow/outflow/net/endCash 由后端合成，前端只渲染。
  // 唯一正向入口是 from/to + granularity；累计始终由后端从 asOf 起算。
  getCashFlowProjection: (window: ProjectionQueryWindow) =>
    api.get<ApiResponse<CashFlowProjectionResult>>('/reports/cash-flow-projection', {
      params: { ...window, includePlanned: 'true', includeCommitted: 'true' },
    }),
}

export const analyticsApi = {
  getDashboardSummary: () => api.get<ApiResponse<DashboardSummaryData>>('/analytics/dashboard'),
  getTrends: (type: 'income' | 'expense', period?: string) => api.get<ApiResponse<AnalyticsTrendItem[]>>('/analytics/trends', { params: { type, period } }),
  getCategoryBreakdown: (type: 'income' | 'expense', startDate?: string, endDate?: string, parentCategoryId?: string) => 
    api.get<ApiResponse<AnalyticsCategoryBreakdownItem[]>>('/analytics/category-breakdown', { 
      params: { type, startDate, endDate, parentCategoryId } 
    }),
  getAssetTrend: () => api.get<ApiResponse<AnalyticsAssetTrendItem[]>>('/analytics/asset-trend'),
  // 未来资产/负债/净资产推演：total 由后端合成，前端不自行累加。
  // 唯一正向入口是 from/to + granularity；累计始终由后端从 asOf 起算。
  getAssetProjection: (window: ProjectionQueryWindow) =>
    api.get<ApiResponse<AssetProjectionResult>>('/analytics/asset-projection', {
      params: { ...window, includePlanned: 'true', includeCommitted: 'true' },
    }),
}

export const dataApi = {
  // 清空数据不可逆：必须带确认值，服务端会校验
  clearAll: () => api.delete<ApiResponse<MessageResult>>('/data/all', {
    data: { confirm: CLEAR_CONFIRM.all },
  }),
  clearTransactions: () => api.delete<ApiResponse<MessageResult>>('/data/transactions', {
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
    return api.post<ApiResponse<ImportBackupResult>>(
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
  // 导入批次：设置页展示「这批导入了多少笔」，并可精确撤销
  listImportBatches: (limit = 10) =>
    api.get<ApiResponse<ImportBatch[]>>('/data/import-batches', { params: { limit } }),
  rollbackImportBatch: (id: string) =>
    api.post<ApiResponse<ImportBatchRollbackResult>>(`/data/import-batches/${id}/rollback`, {
      confirm: ROLLBACK_CONFIRM.import,
    }),
  // ─── 自动定时备份（B3）───
  getAutoBackup: () => api.get<ApiResponse<AutoBackupConfig>>('/data/auto-backup'),
  // 云同步目录默认被后端拒绝；confirmCloudDirectory: true 表示用户已确认「将定时产生全量明文账本副本」
  updateAutoBackup: (
    data: Partial<Pick<AutoBackupConfig, 'enabled' | 'directory' | 'intervalHours' | 'keepCount'>> & {
      confirmCloudDirectory?: boolean
    },
  ) => api.put<ApiResponse<AutoBackupConfig>>('/data/auto-backup', data),
  // 回滚会用快照覆盖当前数据，不可逆：必须带确认值
  restoreRollbackPoint: (id: string) =>
    api.post<ApiResponse<RollbackResult>>(`/data/rollback-points/${id}/restore`, {
      confirm: ROLLBACK_CONFIRM.restore,
    }),
  deleteRollbackPoint: (id: string) =>
    api.delete<ApiResponse<MessageResult>>(`/data/rollback-points/${id}`),
  detectFileIncludes: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return api.post<ApiResponse<DetectFileResult>>('/data/detect-file', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })
  },
}

export default api
