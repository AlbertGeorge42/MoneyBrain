import { ZERO_MINOR, add, sub, type Minor } from '../money.js'
import { addDays, type LocalDate } from '../date.js'
import type { LedgerTransaction } from '../ledger/types.js'
import { cashBalanceTotal, cashFlowOf } from './balances.js'
import { coveredInRange, mergeFutureEvents } from './events.js'
import { projectionFlowValue, sumProjectionFlows } from './sources.js'
import type {
  CashFlowProjectionPoint,
  ProjectionBucket,
  ProjectionCoveredOccurrence,
  ProjectionEvents,
  ProjectionFlowValue,
} from './types.js'

/** 实际交易（已由 API 从 Prisma 行转成领域分录）。 */
export interface CashActualEntry {
  date: LocalDate
  ledger: LedgerTransaction
}

export interface CashFlowProjectionInput {
  asOf: LocalDate
  buckets: readonly ProjectionBucket[]
  cashAccountIds: ReadonlySet<string>
  /** 真实交易只取到 asOf（含），按日期升序；未来日期交易走 committed，避免双计。 */
  actualTransactions: readonly CashActualEntry[]
  /**
   * 期初余额：首桶起点 ≤ asOf 时取首桶起点的真实余额；
   * 首桶在 asOf 之后时取 asOf+1 的真实余额（桶起点前的净额由本函数滚入）。
   */
  openingBalances: ReadonlyMap<string, Minor>
  events: ProjectionEvents
}

export interface CashFlowProjectionOutput {
  points: CashFlowProjectionPoint[]
  startCash: Minor
  endCash: Minor
  cashInflow: ProjectionFlowValue
  cashOutflow: ProjectionFlowValue
  netCashFlow: ProjectionFlowValue
  /** 窗口级被覆盖点位；各桶的 covered 已在 points 内。 */
  covered: ProjectionCoveredOccurrence[]
}

/**
 * 四粒度现金流推演：
 * - 历史桶：真实交易逐日求和，期初取桶起点真实余额；
 * - 混合桶：actual 到 asOf 为止，planned / committed 从 asOf+1 起；
 * - 未来桶：期初 = 上一桶期末，必要时先滚入 asOf+1 至桶起点前的计划 / 已排定净额。
 *
 * 逐桶 inflow / outflow 三来源累加后合成 net；runningCash 按 net.total 滚动，
 * 因此 startCash + Σ net.total == endCash。
 */
export function buildCashFlowProjection(input: CashFlowProjectionInput): CashFlowProjectionOutput {
  const { asOf, buckets, cashAccountIds, actualTransactions, openingBalances, events } = input
  const firstBucket = buckets[0]!
  const lastBucket = buckets[buckets.length - 1]!

  const actualEvents = actualTransactions.map((item) => ({
    date: item.date,
    flow: cashFlowOf(item.ledger, cashAccountIds),
  }))
  let actualIndex = 0

  const futureEvents = mergeFutureEvents(events)
  let eventIndex = 0

  // 首桶在 asOf 之后：先滚入 asOf+1 至桶起点前的计划 / 已排定净额，
  // 并消费掉这段事件，后续桶不再重复计入。
  const baseCash = cashBalanceTotal(openingBalances)
  let startCash = baseCash
  if (firstBucket.start > asOf) {
    let preNet = 0
    const preEnd = addDays(firstBucket.start, -1)
    while (eventIndex < futureEvents.length && futureEvents[eventIndex]!.date <= preEnd) {
      const flow = cashFlowOf(futureEvents[eventIndex]!.ledger, cashAccountIds)
      preNet += flow.inflow - flow.outflow
      eventIndex += 1
    }
    startCash = add(baseCash, preNet as Minor)
  }

  let runningCash = startCash
  const points: CashFlowProjectionPoint[] = buckets.map((bucket) => {
    let actualInflow = ZERO_MINOR
    let actualOutflow = ZERO_MINOR
    while (actualIndex < actualEvents.length && actualEvents[actualIndex]!.date <= bucket.end) {
      const item = actualEvents[actualIndex]!
      actualInflow = add(actualInflow, item.flow.inflow)
      actualOutflow = add(actualOutflow, item.flow.outflow)
      actualIndex += 1
    }

    let plannedInflow = ZERO_MINOR
    let plannedOutflow = ZERO_MINOR
    let committedInflow = ZERO_MINOR
    let committedOutflow = ZERO_MINOR
    while (eventIndex < futureEvents.length && futureEvents[eventIndex]!.date <= bucket.end) {
      const event = futureEvents[eventIndex]!
      const flow = cashFlowOf(event.ledger, cashAccountIds)
      if (event.source === 'planned') {
        plannedInflow = add(plannedInflow, flow.inflow)
        plannedOutflow = add(plannedOutflow, flow.outflow)
      } else {
        committedInflow = add(committedInflow, flow.inflow)
        committedOutflow = add(committedOutflow, flow.outflow)
      }
      eventIndex += 1
    }

    const inflow = projectionFlowValue(actualInflow, plannedInflow, committedInflow)
    const outflow = projectionFlowValue(actualOutflow, plannedOutflow, committedOutflow)
    const net = projectionFlowValue(
      sub(inflow.actual, outflow.actual),
      sub(inflow.planned, outflow.planned),
      sub(inflow.committed, outflow.committed),
    )

    const start = runningCash
    const endCash = add(start, net.total)
    runningCash = endCash

    return {
      granularity: bucket.granularity,
      label: bucket.label,
      start: bucket.start,
      end: bucket.end,
      date: bucket.end,
      inflow,
      outflow,
      net,
      startCash: start,
      endCash,
      covered: coveredInRange(events.covered, bucket.start, bucket.end),
    }
  })

  return {
    points,
    startCash: points[0]!.startCash,
    endCash: points[points.length - 1]!.endCash,
    cashInflow: sumProjectionFlows(points, 'inflow'),
    cashOutflow: sumProjectionFlows(points, 'outflow'),
    netCashFlow: sumProjectionFlows(points, 'net'),
    covered: coveredInRange(events.covered, firstBucket.start, lastBucket.end),
  }
}
