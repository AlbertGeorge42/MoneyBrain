import * as transactionCategoryRepo from '../../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../../db/repositories/transaction.repository.js'
import { dayStart } from '../../common/date.js'
import { toLedgerTransaction } from '../ledger.adapter.js'
import {
  addDays,
  buildIncomeExpenseProjection,
  type CategoryRef,
  type LocalDate,
  type ProjectionGranularity,
} from '../../../../../packages/domain/src/index.js'
import { loadProjectionEvents } from '../projection-events.js'
import { buildProjectionBuckets } from './bucket.js'
import { PREDICTION_NOTE_DEFAULT } from './prediction-source.js'
import type { IncomeExpenseProjectionResult } from '../../../../../packages/contracts/types/index.js'

export interface IncomeExpenseProjectionParams {
  asOf: LocalDate
  granularity: ProjectionGranularity
  from: LocalDate
  to: LocalDate
  includeExcluded: boolean
}

const FLOW_KINDS = new Set(['income', 'expense', 'refund'])

export async function generateIncomeExpenseProjection(
  params: IncomeExpenseProjectionParams,
): Promise<IncomeExpenseProjectionResult> {
  const buckets = buildProjectionBuckets(params.asOf, params.granularity, params.from, params.to)
  const windowStart = buckets[0]!.start
  const windowEnd = buckets[buckets.length - 1]!.end

  const events = await loadProjectionEvents({
    asOf: params.asOf,
    windowEndExclusive: addDays(windowEnd, 1),
    includePlanned: true,
    includeCommitted: true,
  })

  // 已发生：窗口内、asOf 之前的真实收支（未来真实交易进 committed，不重复计入）。
  const actualEnd = windowEnd <= params.asOf ? windowEnd : params.asOf
  const actualRows = windowStart <= actualEnd
    ? await transactionRepo.findActive(
      {
        date: {
          gte: dayStart(windowStart),
          lt: dayStart(addDays(actualEnd, 1)),
        },
        type: { in: ['income', 'expense', 'refund'] },
        amount: { not: 0 },
        ...(params.includeExcluded ? {} : { excludeFromIncomeExpense: false }),
      },
      { orderBy: { date: 'asc' } },
    )
    : []

  const actualLedger = actualRows.map(toLedgerTransaction)
  const committedLedger = events.committed
    .filter((event) => event.date >= windowStart && event.date <= windowEnd)
    .filter((event) => FLOW_KINDS.has(event.ledger.kind))
    .map((event) => event.ledger)
  // 转账不属于收支，预算展开里只保留收入/支出点位。
  const plannedLedger = events.planned
    .filter((event) => event.date >= windowStart && event.date <= windowEnd)
    .filter((event) => FLOW_KINDS.has(event.ledger.kind))
    .map((event) => event.ledger)

  const allCategories = await transactionCategoryRepo.findMany({ orderBy: { sort: 'asc' } })
  const categories: CategoryRef[] = allCategories.map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type,
    parentId: c.parentId,
    sort: c.sort,
  }))

  // 逐桶三来源汇总、分类明细树与顶层合计全部由 domain/statements 计算。
  const projection = buildIncomeExpenseProjection({
    buckets,
    actualLedger,
    committedLedger,
    plannedLedger,
    categories,
    uncategorizedLabel: '未分类',
    includeExcluded: params.includeExcluded,
    covered: events.covered,
  })

  return {
    asOf: params.asOf,
    granularity: params.granularity,
    start: windowStart,
    end: windowEnd,
    bucketCount: buckets.length,
    income: projection.income,
    expense: projection.expense,
    balance: projection.balance,
    incomeCategoryDetails: projection.incomeCategoryDetails,
    expenseCategoryDetails: projection.expenseCategoryDetails,
    points: projection.points,
    predictionNote: projection.hasFuture ? PREDICTION_NOTE_DEFAULT : undefined,
  }
}
