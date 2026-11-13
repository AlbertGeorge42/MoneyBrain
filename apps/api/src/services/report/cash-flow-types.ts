import { Prisma } from '@prisma/client'

// 报表结果类型统一引用 shared 类型（cash-flow 报表对外契约）
export type {
  CashFlowActivityItem,
  CashFlowActivity,
  CashFlowReportData as CashFlowResult,
} from '../../../../../packages/contracts/types/index.js'

/** 仅 API 适配层使用：Prisma 的原始交易行，不得进入 packages/domain。 */
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

// collect / 桑基入参映射用的 ID → 名称字典
export interface CategoryInfo {
  cashFlowType: string | null
  name: string
  parentId: string | null
  level: number
}

export interface AccountInfo {
  name: string
}
