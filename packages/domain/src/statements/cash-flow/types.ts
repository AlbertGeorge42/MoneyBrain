import type { Minor } from '../../money.js'
import type { ProjectionFlowValue } from '../../projection/types.js'

/** API 把 Prisma 交易与预算点位映射成的最小领域视图，实际/预测共用同一处理路径。 */
export interface ProcessedTx {
  isPredicted: boolean
  type: string
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
  }>
}

export interface AggregatedFlows {
  operating: CashFlowActivityMinor
  investing: CashFlowActivityMinor
  financing: CashFlowActivityMinor
  uncategorized: CashFlowActivityMinor
  /** 平账净额：只影响余额，不进任何活动桶。 */
  reconciliation: Minor
  flowByAccount: Record<string, { inflow: Minor; outflow: Minor }>
}

/**
 * 现金流活动分类：财务业务语义，前后端唯一枚举。
 *
 * 只表达「经营 / 投资 / 筹资」三类业务活动；中文名、排序权重、颜色等展示属性
 * 不属于领域，留在各自展示层。未分配 / 无收支活动用 null 表达，不扩展枚举。
 * 与下方报表桶类型 `CashFlowActivity` 区分：本类型是活动身份，后者是活动汇总。
 */
export type CashFlowActivityKey = 'operating' | 'investing' | 'financing'

/** 活动身份的值集合：输入校验与值域判断的唯一来源，与上面的类型同源。 */
export const CASH_FLOW_ACTIVITIES: readonly CashFlowActivityKey[] = [
  'operating', 'investing', 'financing',
]

export interface ReportValue {
  actual: Minor
  predicted: Minor
}

export interface CashFlowActivityItem {
  categoryName: string
  categoryId: string | null
  parentId: string | null
  level: number
  amount: Minor
  actual: Minor
  predicted: Minor
  type: string
  direction: string
  children?: CashFlowActivityItem[]
}

export interface CashFlowActivity {
  inflow: ReportValue
  outflow: ReportValue
  net: ReportValue
  items: CashFlowActivityItem[]
}

export interface CashFlowStatement {
  byActivity: {
    operating: CashFlowActivity
    investing: CashFlowActivity
    financing: CashFlowActivity
    uncategorized: CashFlowActivity
  }
  cashInflow: ReportValue
  cashOutflow: ReportValue
  netCashFlow: ReportValue
  reconciliation: ReportValue
  flowByAccount: Record<string, { inflow: ReportValue; outflow: ReportValue }>
}

export interface ProjectionCashActivityItem {
  categoryName: string
  categoryId: string | null
  parentId: string | null
  level: number
  direction: string
  type: string
  actual: Minor
  committed: Minor
  planned: Minor | null
  total: Minor
  children?: ProjectionCashActivityItem[]
}

export interface ProjectionCashActivity {
  inflow: ProjectionFlowValue
  outflow: ProjectionFlowValue
  net: ProjectionFlowValue
  items: ProjectionCashActivityItem[]
}

export interface ProjectionCashByActivity {
  operating: ProjectionCashActivity
  investing: ProjectionCashActivity
  financing: ProjectionCashActivity
  uncategorized: ProjectionCashActivity
}
