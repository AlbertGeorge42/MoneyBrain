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
  isFromCash: boolean
  isToCash: boolean
  categoryName: string | null | undefined
  /** 一级分类稳定身份；聚合按它进行，展示名不参与身份判定。 */
  categoryId: string | null | undefined
  accountName: string | null | undefined
  /** 现金 / 非现金账户稳定身份。 */
  accountId: string | null | undefined
  toAccountName: string | null | undefined
  /** 转入账户稳定身份。 */
  toAccountId: string | null | undefined
  /** 分类所属一级分类组；真实分类由 API 解析，合成分类不填。 */
  categoryGroupId: string | null | undefined
  categoryGroupName: string | null | undefined
  /** 账户所属账户分类组；有账户分类的账户由 API 解析，未分组不填。 */
  accountGroupId: string | null | undefined
  accountGroupName: string | null | undefined
  /** 转入账户所属账户分类组（非现金转入节点归组用）。 */
  toAccountGroupId: string | null | undefined
  toAccountGroupName: string | null | undefined
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

/** 桑基 endpoint 的显式类型，取代原来编码在展示名后缀里的身份信息。 */
export type SankeyNodeType =
  | 'income_category'
  | 'non_cash_source'
  | 'cash'
  | 'expense_category'
  | 'non_cash_target'

/** 桑基 endpoint 所在侧：左（流入）/ 中（账户）/ 右（流出）。 */
export type SankeySide = 'in' | 'account' | 'out'

/** 桑基 endpoint 所属的折叠组元数据，由后端确定；无法归组的合成节点为 null。 */
export interface SankeyGroupMeta {
  id: string
  name: string
  /** 组内是否含多个 endpoint（可展开）。由后端按组内 endpoint 数量确定。 */
  expandable: boolean
}

/**
 * 桑基 endpoint：身份、展示名、类型、方向分别表达。
 * `id` 是结构化身份（实体 id + 桑基语义前缀），不从 `name` 推导；
 * `name` 仅用于展示，改名不影响身份。
 */
export interface SankeyEndpoint {
  id: string
  name: string
  nodeType: SankeyNodeType
  side: SankeySide
  /** 所属折叠组元数据；合成 / 无法归组节点为 null，前端原样展示。 */
  group: SankeyGroupMeta | null
}

export interface SankeyLink {
  /** endpoint.id */
  source: string
  /** endpoint.id */
  target: string
  value: Minor
  actualValue?: Minor
  predictedValue?: Minor
}

export interface SankeyResult {
  nodes: SankeyEndpoint[]
  links: SankeyLink[]
}
