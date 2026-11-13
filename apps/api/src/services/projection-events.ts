import {
  ZERO_MINOR,
  addDays,
  budgetKindOf,
  excludeCovered,
  fromDate,
  matchOccurrences,
  minor,
  type CommittedEvent,
  type LocalDate,
  type PlannedEvent,
  type ProjectionEvents,
} from '../../../../packages/domain/src/index.js'
import { AppError } from '../common/error.js'
import { dayStart } from '../common/date.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import { generatePredictedOccurrences } from './budget.service.js'
import { toLedgerTransaction } from './ledger.adapter.js'

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

/**
 * 两个未来来源 + occurrence 互斥：
 * - committed：date > asOf 的真实交易（不再被余额当作 actual，改由本来源单独累计）
 * - planned：预算展开点位（合成交易，只走预算口径，不读真实交易）
 *
 * 预算点位在其周期内存在同类型同账户（转账还需同目标账户）同分类的真实交易时，
 * 视为同一 occurrence 已由真实交易兑现：点位从 planned 剔除，金额只留在 committed，
 * 并通过 `covered` 输出。调用方据此保持 total = actual + planned + committed。
 */
export async function loadProjectionEvents(params: {
  asOf: LocalDate
  windowEndExclusive: LocalDate
  includePlanned: boolean
  includeCommitted: boolean
}): Promise<ProjectionEvents> {
  const firstFutureDay = addDays(params.asOf, 1)
  // 整段区间都在 asOf 之前：没有未来来源，不必查询 / 展开。
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
  return {
    planned: excludeCovered(plannedAll, covered),
    committed,
    covered,
  }
}
