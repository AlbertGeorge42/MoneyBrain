import type { LocalDate } from '../date.js'
import type { LedgerTransaction } from '../ledger/types.js'
import type { Minor } from '../money.js'

/**
 * 投影领域的输入输出类型（Domain 自有，不依赖 packages/contracts / Prisma）。
 *
 * contracts 里的同名 DTO 与这里的字段一一对应，API 只需做字段直传式映射，
 * 不得在映射里补算金额或改写口径。
 */

/** 日 / ISO 周 / 自然月 / 自然年。季度不属于投影粒度（预算周期才用 quarterly）。 */
export type ProjectionGranularity = 'day' | 'week' | 'month' | 'year'

/** 一个投影桶：start / end 为闭区间，endExclusive 为半开上界。 */
export interface ProjectionBucket {
  granularity: ProjectionGranularity
  label: string
  start: LocalDate
  end: LocalDate
  endExclusive: LocalDate
}

/** 资产 / 负债 / 净资产水平（整数分；liabilities 为正数欠款）。 */
export interface ProjectionBalance {
  assets: Minor
  liabilities: Minor
  netWorth: Minor
}

/** 三来源合成值：total = actual + planned + committed。 */
export interface ProjectionFlowValue {
  actual: Minor
  planned: Minor
  committed: Minor
  total: Minor
}

/** 收支投影三来源：planned 为 null 表示「该分类没有预算来源」，不是 0。 */
export interface ProjectionSourceValue {
  actual: Minor
  committed: Minor
  planned: Minor | null
  total: Minor
}

/** 预算点位的元数据，用于 occurrence 互斥判定与 covered 输出。 */
export interface PlannedOccurrenceMeta {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  amount: Minor
  accountId: string
  toAccountId: string | null
  periodStart: LocalDate
  periodEnd: LocalDate
}

export interface PlannedEvent {
  source: 'planned'
  date: LocalDate
  ledger: LedgerTransaction
  occurrence: PlannedOccurrenceMeta
}

export interface CommittedEvent {
  source: 'committed'
  date: LocalDate
  ledger: LedgerTransaction
  transactionId: string
}

export type ProjectionEvent = PlannedEvent | CommittedEvent

/** 一次覆盖：某个预算点位被哪笔真实交易替代。 */
export interface CoveredOccurrence {
  event: PlannedEvent
  transactionId: string
  transactionDate: LocalDate
}

/** 对外输出的被覆盖点位（字段与 contracts 的 ProjectionCoveredOccurrence 对齐）。 */
export interface ProjectionCoveredOccurrence {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  date: LocalDate
  amount: Minor
  transactionId: string
  transactionDate: LocalDate
}

/** 未来事件集合：planned 已剔除被覆盖点位。 */
export interface ProjectionEvents {
  planned: PlannedEvent[]
  committed: CommittedEvent[]
  covered: CoveredOccurrence[]
}

/**
 * 账户领域引用：由 API 把 Prisma 行与展示兜底（未分类 / 未知名 / 排序哨兵）
 * 填好后传入，Domain 不生成文案、不认识 Prisma 模型。
 */
export interface ProjectionAccountRef {
  id: string
  name: string
  type: string
  categoryId: string
  categoryName: string
  isInvestment: boolean
  sort: number
}

export interface ProjectionAccountValue {
  accountId: string
  name: string
  type: 'asset' | 'liability'
  categoryId: string
  categoryName: string
  isInvestment: boolean
  actual: Minor
  committed: Minor
  planned: Minor
  total: Minor
  hasFutureEvents: boolean
  valuationNote: 'transfer_schedule_only' | null
}

export interface ProjectionCategoryValue {
  categoryId: string
  name: string
  type: 'asset' | 'liability'
  sort: number
  actual: Minor
  committed: Minor
  planned: Minor
  total: Minor
}

export interface AssetProjectionPoint {
  granularity: ProjectionGranularity
  label: string
  start: LocalDate
  end: LocalDate
  date: LocalDate
  actual: ProjectionBalance
  planned: ProjectionBalance
  committed: ProjectionBalance
  total: ProjectionBalance
  covered: ProjectionCoveredOccurrence[]
  accounts: ProjectionAccountValue[]
  categories: ProjectionCategoryValue[]
}

export interface CashFlowProjectionPoint {
  granularity: ProjectionGranularity
  label: string
  start: LocalDate
  end: LocalDate
  date: LocalDate
  inflow: ProjectionFlowValue
  outflow: ProjectionFlowValue
  net: ProjectionFlowValue
  startCash: Minor
  endCash: Minor
  covered: ProjectionCoveredOccurrence[]
}

/** 预算期间计划里的一个展开点位（API 已完成 Date → LocalDate / 元 → 分的边界转换）。 */
export interface BudgetPlanOccurrence {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  date: LocalDate
  amount: Minor
}

export interface BudgetPeriodPlanTotals {
  income: Minor
  expense: Minor
  transfer: Minor
}

export interface BudgetPeriodPlanPoint {
  month: string
  granularity: ProjectionGranularity
  label: string
  start: LocalDate
  end: LocalDate
  date: LocalDate
  hasBudget: boolean
  budgets: BudgetPlanOccurrence[]
  totals: BudgetPeriodPlanTotals | null
}
