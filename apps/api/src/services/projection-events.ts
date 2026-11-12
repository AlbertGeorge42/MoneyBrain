import {
  CURRENT_RULE_VERSION,
  ZERO_MINOR,
  addDays,
  budgetKindOf,
  fromDate,
  minor,
  type LedgerTransaction,
  type LocalDate,
  type Minor,
} from '../../../../packages/domain/src/index.js'
import { AppError } from '../common/error.js'
import { dayStart } from '../common/date.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import { generatePredictedOccurrences } from './budget.service.js'
import { toLedgerTransaction } from './ledger.adapter.js'
import type { ProjectionCoveredOccurrence } from '../../../../packages/contracts/types/index.js'

/** 推演事件保护阈值：超过后不再继续计算，并给可操作的下一步。 */
const MAX_PROJECTION_EVENTS = 20_000

function assertEventBudget(count: number): void {
  if (count <= MAX_PROJECTION_EVENTS) return
  throw new AppError(
    `推演范围过大（已展开 ${count} 个事件，上限 ${MAX_PROJECTION_EVENTS}）：请缩小 from/to 范围，或改用更粗的粒度后重试`,
    'VALIDATION_ERROR',
    422,
    { eventCount: count, limit: MAX_PROJECTION_EVENTS },
  )
}

interface PlannedOccurrenceMeta {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  amount: Minor
  accountId: string
  toAccountId: string | null
  /** 点位所属预算周期的第一天（含），用于 occurrence 匹配。 */
  periodStart: LocalDate
  /** 点位所属预算周期的最后一天（含），用于 occurrence 匹配。 */
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

/** 一次覆盖：某个预算点位被哪一笔真实交易替代。 */
export interface CoveredOccurrence {
  event: PlannedEvent
  transactionId: string
  transactionDate: LocalDate
}

export interface LoadedProjectionEvents {
  /** 已剔除被真实交易覆盖的点位。 */
  planned: PlannedEvent[]
  /** date > asOf 的真实交易，按日期升序。 */
  committed: CommittedEvent[]
  /** 窗口内被覆盖的点位，按点位日期升序。 */
  covered: CoveredOccurrence[]
}

/**
 * 同一 occurrence 的互斥判定。
 *
 * 预算点位与其周期内的真实交易视为「同一笔计划」需同时满足：
 * - 类型相同（income / expense / transfer）；
 * - 来源账户相同；
 * - 转入账户相同（非转账两侧都为 null，转账必须同源同目标）；
 * - 分类相同（同账户下不同分类不能互相吃掉）；
 * - 真实交易日期落在点位所属预算周期 [periodStart, periodEnd] 内。
 *
 * 金额不参与匹配：周期内同类型同账户同分类的交易即视为该计划已兑现，
 * 否则「预算 2000、实际只花 800」会被算成两份。
 */
function occurrenceMatches(planned: PlannedEvent, transaction: CommittedEvent): boolean {
  const meta = planned.occurrence
  if (meta.type !== transaction.ledger.kind) return false
  if (meta.accountId !== transaction.ledger.accountId) return false
  if (meta.toAccountId !== transaction.ledger.toAccountId) return false
  if (planned.ledger.categoryId !== transaction.ledger.categoryId) return false
  return transaction.date >= meta.periodStart && transaction.date <= meta.periodEnd
}

/**
 * committed 按日期升序一对一匹配：
 * 1. 先按「同日」匹配，避免同周期内先到先得挤掉真正当天的点位；
 * 2. 剩余交易日再在周期内匹配。
 * 一笔真实交易最多覆盖一个预算点位；未被匹配的两侧都保留。
 */
function matchOccurrences(planned: PlannedEvent[], committed: CommittedEvent[]): CoveredOccurrence[] {
  const matched = new Set<PlannedEvent>()
  const usedTransactions = new Set<string>()
  const covered: CoveredOccurrence[] = []

  const cover = (event: PlannedEvent, transaction: CommittedEvent) => {
    matched.add(event)
    usedTransactions.add(transaction.transactionId)
    covered.push({
      event,
      transactionId: transaction.transactionId,
      transactionDate: transaction.date,
    })
  }

  for (const transaction of committed) {
    const event = planned.find(
      (candidate) =>
        !matched.has(candidate)
        && candidate.date === transaction.date
        && occurrenceMatches(candidate, transaction),
    )
    if (event) cover(event, transaction)
  }

  for (const transaction of committed) {
    if (usedTransactions.has(transaction.transactionId)) continue
    const event = planned.find(
      (candidate) => !matched.has(candidate) && occurrenceMatches(candidate, transaction),
    )
    if (event) cover(event, transaction)
  }

  covered.sort((a, b) => a.event.date.localeCompare(b.event.date))
  return covered
}

/**
 * 两个未来来源 + occurrence 互斥：
 * - committed：date > asOf 的真实交易（不再被余额当作 actual，改由本来源单独累计）
 * - planned：预算展开点位（合成交易，只走预算口径，不读真实交易）
 *
 * 预算点位在其周期内存在同类型同账户（转账还需同目标账户）同分类的真实交易时，
 * 视为同一 occurrence 已由真实交易兑现：点位从 planned 剔除，金额只留在 committed，
 * 并通过 `covered` 输出。调用方据此保持 total = actual + planned + committed。
 *
 * 只有两者都纳入时才做匹配：单独请求 planned 时返回未兑现的原始预算展开。
 */
export async function loadProjectionEvents(params: {
  asOf: LocalDate
  windowEndExclusive: LocalDate
  includePlanned: boolean
  includeCommitted: boolean
}): Promise<LoadedProjectionEvents> {
  const firstFutureDay = addDays(params.asOf, 1)
  // 整段区间都在 asOf 之前：没有未来来源，不必查询/展开。
  if (params.windowEndExclusive <= firstFutureDay) {
    return { planned: [], committed: [], covered: [] }
  }
  const committed: CommittedEvent[] = []
  const plannedAll: PlannedEvent[] = []

  if (params.includeCommitted) {
    const rows = await transactionRepo.findActive(
      {
        date: {
          gte: dayStart(firstFutureDay),
          lt: dayStart(params.windowEndExclusive),
        },
      },
      { orderBy: { date: 'asc' } },
    )
    for (const row of rows) {
      const date = fromDate(row.date)
      committed.push({
        source: 'committed',
        date,
        ledger: toLedgerTransaction(row),
        transactionId: row.id,
      })
    }
  }

  if (params.includePlanned) {
    // 只展开 [asOf+1, 窗口末日]：已过去的预算点位不会进来
    const occurrences = await generatePredictedOccurrences(
      firstFutureDay,
      addDays(params.windowEndExclusive, -1),
    )
    for (const occurrence of occurrences) {
      const date = fromDate(occurrence.date)
      const type = budgetKindOf(occurrence.type)
      plannedAll.push({
        source: 'planned',
        date,
        ledger: {
          id: `budget:${occurrence.budgetId}:${date}`,
          ruleVersion: CURRENT_RULE_VERSION,
          kind: type,
          date,
          amount: minor(occurrence.amount),
          fee: ZERO_MINOR,
          coupon: ZERO_MINOR,
          accountId: occurrence.accountId,
          toAccountId: occurrence.toAccountId,
          categoryId: occurrence.categoryId,
          relatedTransactionId: null,
          relatedType: null,
          excludeFromIncomeExpense: false,
        },
        occurrence: {
          budgetId: occurrence.budgetId,
          budgetName: occurrence.budgetName,
          type,
          amount: minor(occurrence.amount),
          accountId: occurrence.accountId,
          toAccountId: occurrence.toAccountId,
          periodStart: fromDate(occurrence.periodStart),
          periodEnd: fromDate(occurrence.periodEnd),
        },
      })
    }
  }

  // 先于 O(n²) 的 occurrence 匹配检查总量，避免超范围请求把 CPU 打满。
  assertEventBudget(plannedAll.length + committed.length)
  const covered = matchOccurrences(plannedAll, committed)
  const coveredEvents = new Set(covered.map((item) => item.event))
  return {
    planned: plannedAll.filter((event) => !coveredEvents.has(event)),
    committed,
    covered,
  }
}

/** 区间 [start, end] 内被真实交易覆盖的预算点位。 */
export function coveredInRange(
  covered: CoveredOccurrence[],
  start: LocalDate,
  end: LocalDate,
): ProjectionCoveredOccurrence[] {
  return covered
    .filter((item) => item.event.date >= start && item.event.date <= end)
    .map((item) => ({
      budgetId: item.event.occurrence.budgetId,
      budgetName: item.event.occurrence.budgetName,
      type: item.event.occurrence.type,
      date: item.event.date,
      amount: item.event.occurrence.amount,
      transactionId: item.transactionId,
      transactionDate: item.transactionDate,
    }))
}
