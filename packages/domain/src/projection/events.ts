import type { LocalDate } from '../date.js'
import type {
  CommittedEvent,
  CoveredOccurrence,
  PlannedEvent,
  ProjectionCoveredOccurrence,
  ProjectionEvent,
} from './types.js'

/**
 * 同一 occurrence 的互斥判定：类型、源账户、转入账户、分类相同，
 * 且真实交易日期落在点位所属预算周期 [periodStart, periodEnd] 内。
 *
 * 金额刻意不参与匹配 —— 「预算 2000、实际花 800」不能被算成两份。
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
export function matchOccurrences(
  planned: readonly PlannedEvent[],
  committed: readonly CommittedEvent[],
): CoveredOccurrence[] {
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

/** 从展开点位里剔除已被真实交易覆盖的那些。 */
export function excludeCovered(
  planned: readonly PlannedEvent[],
  covered: readonly CoveredOccurrence[],
): PlannedEvent[] {
  const coveredEvents = new Set(covered.map((item) => item.event))
  return planned.filter((event) => !coveredEvents.has(event))
}

/** 两个未来来源合并成一个按日期升序的事件流（planned 在前、committed 在后）。 */
export function mergeFutureEvents(
  events: { planned: readonly PlannedEvent[]; committed: readonly CommittedEvent[] },
): ProjectionEvent[] {
  return [...events.planned, ...events.committed].sort((left, right) =>
    left.date.localeCompare(right.date),
  )
}

/** 闭区间 [start, end] 内的预算点位覆盖记录（点位日期，不是交易日期）。 */
export function coveredInRange(
  covered: readonly CoveredOccurrence[],
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

