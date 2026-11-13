import type { Minor } from '../../money.js'
import type { ProjectionFlowValue } from '../../projection/types.js'

/** API 把 Prisma 交易与预算点位映射成的最小领域视图，实际/预测共用同一处理路径。 */
export interface ProcessedTx {
  isPredicted: boolean
  ruleVersion: number
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
 * 桑基图的领域输入。API 负责 Prisma 行 / 预算 DTO → 本结构的映射（含名称兜底差异、
 * 日期范围过滤与现金集合判定），Domain 只做节点与链路计算。
 */
export interface SankeySourceTransaction {
  isActual: boolean
  type: string
  relatedType: string | null
  amount: Minor
  fee: Minor
  coupon: Minor
  ruleVersion: number
  isFromCash: boolean
  isToCash: boolean
  categoryName: string | null | undefined
  accountName: string | null | undefined
  toAccountName: string | null | undefined
}

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

type SankeyNodeCategory =
  | 'income_category'
  | 'non_cash_source'
  | 'cash'
  | 'expense_category'
  | 'non_cash_target'

export interface SankeyNode {
  name: string
  category?: SankeyNodeCategory
}

export interface SankeyLink {
  source: string
  target: string
  value: Minor
  actualValue?: Minor
  predictedValue?: Minor
}

export interface SankeyResult {
  nodes: SankeyNode[]
  links: SankeyLink[]
}
