import type { LocalDate } from '../date.js'
import type { Minor } from '../money.js'

/**
 * 投资账户的一笔外部现金流。
 * 金额是整数分且带方向：投入为负、取出为正（与 XIRR 的现金流向一致）。
 * `day` 是本地日历日，用于按日聚合；`timestamp` 是交易时刻毫秒，用于 XIRR 与排序。
 */
export interface InvestmentCashFlow {
  day: LocalDate
  timestamp: number
  amount: Minor
  kind: 'buy' | 'sell'
  accountId: string
}

/** 收益指标：金额一律整数分，比率一律百分数。 */
export interface ReturnMetrics {
  periodInvested: Minor
  periodWithdrawn: Minor
  netCashFlow: Minor
  periodReturn: Minor
  simpleReturnRate: number
  maxCapitalEmployed: Minor
  cumulativeReturn: Minor
  cumulativeReturnRate: number
}

export interface TwrResult {
  twr: number | null
  annualizedTwr: number | null
}

export interface TwrInput {
  startMillis: number
  endMillis: number
  startValue: number
  cashFlows: readonly InvestmentCashFlow[]
  /** 查询给定时点的账户余额合计；取数由 API 用 BalanceCache 实现。 */
  balanceAt: (dayMillis: number) => number
}

/** 账户持仓明细：与对外 DTO 的 AccountAllocationItem 形状一致，API 直接搬运。 */
export interface AllocationItem {
  assetClassId: string
  name: string
  marketValue: Minor
  ratio: number
  targetRatio: number | null
  deviation: number | null
  rebalanceAmount: Minor | null
  periodInvested: Minor
  periodWithdrawn: Minor
  periodReturn: Minor | null
  returnRate: number | null
  sort: number
}

/** 快照内的一条持仓；`previousMarketValue` 为上一快照同类别市值，没有则为 null。 */
export interface AllocationSnapshotItem {
  assetClassId: string
  name: string
  marketValue: Minor
  periodNetFlow: Minor
  targetRatio: number | null
  sort: number
  previousMarketValue: Minor | null
}

export interface AllocationSnapshot {
  id: string
  date: LocalDate
  accountBalance: Minor
  items: readonly AllocationSnapshotItem[]
}

export interface SnapshotHistoryEntry {
  id: string
  date: LocalDate
  accountBalance: Minor
  items: Array<{
    assetClassId: string
    name: string
    marketValue: Minor
    ratio: number
  }>
}
