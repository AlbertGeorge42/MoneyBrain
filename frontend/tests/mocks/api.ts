import { vi } from 'vitest'

/**
 * 创建 API Mock 对象
 * 用于前端测试中替代真实的 Axios 请求
 */
export function createMockApi() {
  return {
    accountCategoryApi: {
      getAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateSort: vi.fn(),
      delete: vi.fn(),
    },
    accountApi: {
      getAll: vi.fn(),
      getStats: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateSort: vi.fn(),
      delete: vi.fn(),
      adjust: vi.fn(),
      batchAdjust: vi.fn(),
    },
    transactionCategoryApi: {
      getAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateSort: vi.fn(),
      delete: vi.fn(),
      getStats: vi.fn(),
      move: vi.fn(),
    },
    transactionApi: {
      getAll: vi.fn(),
      getStats: vi.fn(),
      getEarliestDate: vi.fn(),
      getRefundableList: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    budgetApi: {
      getAll: vi.fn(),
      getStatus: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reportApi: {
      getBalanceSheet: vi.fn(),
      getIncomeExpense: vi.fn(),
      getCashFlow: vi.fn(),
      getInvestmentAnalysis: vi.fn(),
    },
    analyticsApi: {
      getTrends: vi.fn(),
      getCategoryBreakdown: vi.fn(),
      getAssetTrend: vi.fn(),
    },
    dataApi: {
      clearAll: vi.fn(),
      clearTransactions: vi.fn(),
      exportCsv: vi.fn(),
      importCsv: vi.fn(),
    },
  }
}

/**
 * 创建标准成功响应
 */
export function createSuccessResponse<T>(data: T) {
  return {
    data: {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    },
  }
}

/**
 * 创建标准错误响应
 */
export function createErrorResponse(code: string, message: string) {
  return {
    data: {
      success: false,
      error: { code, message },
      timestamp: new Date().toISOString(),
    },
  }
}
