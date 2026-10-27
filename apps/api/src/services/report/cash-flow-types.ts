import { Prisma } from '@prisma/client'
import { type Minor } from '../../../../../packages/domain/src/index.js'
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

export interface CashFlowActivityMinor {
  inflow: Minor
  outflow: Minor
  items: Array<{
    categoryName: string
    categoryId: string | null
    parentId: string | null
    level: number
    amount: Minor
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
  /** 写入时的账务口径版本；聚合时按它解释转账手续费与退款方向。 */
  ruleVersion: number
  type: string
  /** 退款指向的原交易类型（'income' / 'expense'），决定退款的资金方向 */
  relatedType: string | null
  amount: Minor
  fee: Minor
  coupon: Minor
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
  operating: CashFlowActivityMinor
  investing: CashFlowActivityMinor
  financing: CashFlowActivityMinor
  uncategorized: CashFlowActivityMinor
  flowByAccount: Record<string, { inflow: Minor; outflow: Minor }>
}
