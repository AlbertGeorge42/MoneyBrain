// 投资分析报表类型定义

// 报表结果类型统一引用 shared 类型（投资分析报表对外契约）
export type {
  InvestmentAccountDetail,
  InvestmentCategorySummary,
  InvestmentReturnAnalysis,
  InvestmentTrendItem,
  AccountAllocationItem,
  SnapshotHistoryItem,
  AccountAllocationDetail,
  StaleAccountInfo,
  InvestmentAnalysisReportData as InvestmentAnalysisResult,
} from '../../../../shared/types/index.js'

export interface CashFlow {
  date: Date
  amount: number
  type: 'buy' | 'sell'
  accountId: string
  accountName: string
}

export interface AccountWithCategory {
  id: string
  name: string
  categoryId: string | null
  category: { id: string; name: string; icon: string | null; color: string | null } | null
  icon: string | null
  color: string | null
  initialBalance: { toNumber: () => number }
  initialBalanceDate: Date | null
  createdAt: Date
}
