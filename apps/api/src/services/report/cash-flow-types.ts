import { Prisma } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library.js'
import { type ReportValue } from './report.utils.js'

// 报表结果类型统一引用 shared 类型（cash-flow 报表对外契约）
export type {
  CashFlowActivityItem,
  CashFlowActivity,
  CashFlowReportData as CashFlowResult,
} from '../../../../../packages/contracts/types/index.js'

export type TransactionWithIncludes = Prisma.TransactionGetPayload<{
  include: { account: true; toAccount: true; category: true }
}>

export interface PredictionTransaction {
  date: Date
  type: string
  amount: number
  note: string | null
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  budgetId: string
  budgetName: string
}

export interface CashFlowActivityDecimal {
  inflow: Decimal
  outflow: Decimal
  items: Array<{
    categoryName: string
    categoryId: string | null
    parentId: string | null
    level: number
    amount: number
    type: string
    direction: string
    icon?: string | null
    color?: string | null
  }>
}

// 重导出 ReportValue，保持原有 import 路径可用
export type { ReportValue }

// 内部使用的轻量类型（collectTransactions / aggregate 之间传递）
export interface CategoryInfo {
  cashFlowType: string | null
  name: string
  icon?: string | null
  color?: string | null
  parentId: string | null
  level: number
}

export interface AccountInfo {
  name: string
}

// 统一后的交易项：actual + predicted 共用同一处理路径
export interface ProcessedTx {
  isPredicted: boolean
  type: string
  /** 退款指向的原交易类型（'income' / 'expense'），决定退款的资金方向 */
  relatedType: string | null
  amount: Decimal
  fee: Decimal
  coupon: Decimal
  isFromCash: boolean
  isToCash: boolean
  categoryName: string
  categoryId: string | null
  parentId: string | null
  level: number
  cashFlowType: string | null
  accountName: string
  toAccountName: string | null
  icon: string | null
  color: string | null
}

export interface AggregatedFlows {
  operating: CashFlowActivityDecimal
  investing: CashFlowActivityDecimal
  financing: CashFlowActivityDecimal
  uncategorized: CashFlowActivityDecimal
  flowByAccount: Record<string, { inflow: Decimal; outflow: Decimal }>
}
