export const queryKeys = {
  accounts: {
    all: ['accounts'] as const,
    list: (params?: Record<string, unknown>) => ['accounts', params] as const,
    detail: (id: string) => ['accounts', id] as const,
    stats: (id: string) => ['accounts', id, 'stats'] as const,
    balanceAt: (id: string, date: string) => ['accounts', id, 'balance-at', date] as const,
  },
  accountCategories: {
    all: ['accountCategories'] as const,
  },
  transactionCategories: {
    all: ['transactionCategories'] as const,
  },
  transactions: {
    all: ['transactions'] as const,
    list: (params?: Record<string, unknown>) => ['transactions', params] as const,
    stats: (params?: Record<string, unknown>) => ['transactions', 'stats', params] as const,
    earliest: ['transactions', 'earliest'] as const,
    refundable: ['transactions', 'refundable'] as const,
  },
  budgets: {
    all: ['budgets'] as const,
    list: (params?: Record<string, unknown>) => ['budgets', params] as const,
    status: (id: string) => ['budgets', id, 'status'] as const,
    statuses: (ids: string[]) => ['budgets', 'statuses', ids] as const,
    predictions: (startDate: string, endDate: string) => ['budgets', 'predictions', startDate, endDate] as const,
  },
  reports: {
    balanceSheet: (date: string) => ['reports', 'balance-sheet', date] as const,
    incomeExpense: (startDate: string, endDate: string, includePredictions?: boolean) =>
      ['reports', 'income-expense', startDate, endDate, includePredictions] as const,
    cashFlow: (startDate: string, endDate: string, includePredictions?: boolean) =>
      ['reports', 'cash-flow', startDate, endDate, includePredictions] as const,
    investmentAnalysis: (startDate: string, endDate: string) =>
      ['reports', 'investment-analysis', startDate, endDate] as const,
  },
  analytics: {
    trends: (type: 'income' | 'expense', period?: string) => ['analytics', 'trends', type, period] as const,
    categoryBreakdown: (type: 'income' | 'expense', startDate?: string, endDate?: string, parentCategoryId?: string) =>
      ['analytics', 'category-breakdown', type, startDate, endDate, parentCategoryId] as const,
    assetTrend: ['analytics', 'asset-trend'] as const,
  },
  investment: {
    assetClasses: (accountId: string) => ['investment', accountId, 'asset-classes'] as const,
    snapshots: (accountId: string, startDate?: string, endDate?: string) =>
      ['investment', accountId, 'snapshots', startDate, endDate] as const,
    latestSnapshot: (accountId: string, beforeDate?: string) =>
      ['investment', accountId, 'latest-snapshot', beforeDate] as const,
  },
}
