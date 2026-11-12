import * as transactionCategoryRepo from '../../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../../db/repositories/transaction.repository.js'
import { dayStart } from '../../common/date.js'
import { toLedgerTransaction } from '../ledger.adapter.js'
import {
  UNCATEGORIZED_CATEGORY_ID,
  ZERO_MINOR,
  addDays,
  flowByCategory,
  summarizeFlows,
  sum,
  sub,
  type LedgerTransaction,
  type LocalDate,
  type Minor,
} from '../../../../../packages/domain/src/index.js'
import { coveredInRange, loadProjectionEvents } from '../projection-events.js'
import { buildProjectionBuckets } from './bucket.js'
import { PREDICTION_NOTE_DEFAULT } from './prediction.js'
import type {
  IncomeExpenseProjectionPoint,
  IncomeExpenseProjectionResult,
  ProjectionCategoryDetail,
  ProjectionGranularity,
  ProjectionSourceValue,
} from '../../../../../packages/contracts/types/index.js'

export interface IncomeExpenseProjectionParams {
  asOf: LocalDate
  granularity: ProjectionGranularity
  from: LocalDate
  to: LocalDate
  includeExcluded: boolean
}

const FLOW_KINDS = new Set(['income', 'expense', 'refund'])

type CategoryMaps = {
  income: Map<string, Minor>
  expense: Map<string, Minor>
}

function sumMap(map: Map<string, Minor>): Minor {
  return sum([...map.values()])
}

function sourceValue(
  actual: Minor,
  committed: Minor,
  plannedMap: Map<string, Minor>,
): ProjectionSourceValue {
  const planned = plannedMap.size > 0 ? sumMap(plannedMap) : null
  return {
    actual,
    committed,
    planned,
    total: sum([actual, committed, planned ?? ZERO_MINOR]),
  }
}

function ledgerInRange(list: LedgerTransaction[], start: LocalDate, end: LocalDate): LedgerTransaction[] {
  return list.filter((transaction) => transaction.date >= start && transaction.date <= end)
}

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

  const options = { includeExcluded: params.includeExcluded }
  const actualSummary = summarizeFlows(actualLedger, undefined, options)
  const committedSummary = summarizeFlows(committedLedger, undefined, options)
  const plannedSummary = summarizeFlows(plannedLedger, undefined, options)

  const actualMaps: CategoryMaps = {
    income: flowByCategory(actualLedger, 'income', undefined, options),
    expense: flowByCategory(actualLedger, 'expense', undefined, options),
  }
  const committedMaps: CategoryMaps = {
    income: flowByCategory(committedLedger, 'income', undefined, options),
    expense: flowByCategory(committedLedger, 'expense', undefined, options),
  }
  const plannedMaps: CategoryMaps = {
    income: flowByCategory(plannedLedger, 'income', undefined, options),
    expense: flowByCategory(plannedLedger, 'expense', undefined, options),
  }

  const categories = await transactionCategoryRepo.findMany({ orderBy: { sort: 'asc' } })
  const childrenOf = new Map<string | null, typeof categories>()
  for (const category of categories) {
    const key = category.parentId ?? null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(category)
  }

  const buildTree = (type: 'income' | 'expense', parentId: string | null): ProjectionCategoryDetail[] => {
    const result: ProjectionCategoryDetail[] = []
    for (const category of childrenOf.get(parentId) ?? []) {
      if (category.type !== type) continue

      const childLeaves = buildTree(type, category.id)
      const ownActual = actualMaps[type].get(category.id) ?? ZERO_MINOR
      const ownCommitted = committedMaps[type].get(category.id) ?? ZERO_MINOR
      const ownPlanned = plannedMaps[type].has(category.id) ? plannedMaps[type].get(category.id)! : null
      const hasChildren = (childrenOf.get(category.id) ?? []).length > 0

      if (ownActual === 0 && ownCommitted === 0 && ownPlanned === null && childLeaves.length === 0) continue

      const childrenActual = sum(childLeaves.map((child) => child.actual))
      const childrenCommitted = sum(childLeaves.map((child) => child.committed))
      const childPlanned = childLeaves.filter((child) => child.planned !== null)
      const planned = ownPlanned === null && childPlanned.length === 0
        ? null
        : sum([ownPlanned ?? ZERO_MINOR, ...childPlanned.map((child) => child.planned ?? ZERO_MINOR)])
      const actual = sum([ownActual, childrenActual])
      const committed = sum([ownCommitted, childrenCommitted])

      result.push({
        name: category.name,
        categoryId: category.id,
        hasChildren,
        sort: category.sort,
        actual,
        committed,
        planned,
        total: sum([actual, committed, planned ?? ZERO_MINOR]),
        hasBudget: planned !== null,
        children: childLeaves.length > 0 ? childLeaves : undefined,
      })
    }
    return result.sort((left, right) => left.sort - right.sort)
  }

  const buildUncategorized = (type: 'income' | 'expense'): ProjectionCategoryDetail | null => {
    const actual = actualMaps[type].get(UNCATEGORIZED_CATEGORY_ID) ?? ZERO_MINOR
    const committed = committedMaps[type].get(UNCATEGORIZED_CATEGORY_ID) ?? ZERO_MINOR
    if (actual === 0 && committed === 0) return null
    return {
      name: '未分类',
      categoryId: 'uncategorized',
      hasChildren: false,
      sort: Number.MAX_SAFE_INTEGER,
      actual,
      committed,
      planned: null,
      total: sum([actual, committed]),
      hasBudget: false,
    }
  }

  const incomeCategoryDetails = buildTree('income', null)
  const expenseCategoryDetails = buildTree('expense', null)
  const uncategorizedIncome = buildUncategorized('income')
  const uncategorizedExpense = buildUncategorized('expense')
  if (uncategorizedIncome) incomeCategoryDetails.push(uncategorizedIncome)
  if (uncategorizedExpense) expenseCategoryDetails.push(uncategorizedExpense)

  const points: IncomeExpenseProjectionPoint[] = buckets.map((bucket) => {
    const actualSlice = ledgerInRange(actualLedger, bucket.start, bucket.end)
    const committedSlice = ledgerInRange(committedLedger, bucket.start, bucket.end)
    const plannedSlice = ledgerInRange(plannedLedger, bucket.start, bucket.end)

    const actual = summarizeFlows(actualSlice, undefined, options)
    const committed = summarizeFlows(committedSlice, undefined, options)

    const plannedIncomeSlice = plannedSlice.filter(
      (transaction) => transaction.kind === 'income' || transaction.kind === 'refund',
    )
    const plannedExpenseSlice = plannedSlice.filter(
      (transaction) => transaction.kind === 'expense' || transaction.kind === 'refund',
    )
    const plannedIncomeSummary = summarizeFlows(plannedIncomeSlice, undefined, options)
    const plannedExpenseSummary = summarizeFlows(plannedExpenseSlice, undefined, options)

    const income = sourceValue(
      actual.netIncome,
      committed.netIncome,
      plannedIncomeSlice.length > 0 ? new Map([['income', plannedIncomeSummary.netIncome]]) : new Map(),
    )
    const expense = sourceValue(
      actual.netExpense,
      committed.netExpense,
      plannedExpenseSlice.length > 0 ? new Map([['expense', plannedExpenseSummary.netExpense]]) : new Map(),
    )
    const balance = sourceValue(
      sub(actual.netIncome, actual.netExpense),
      sub(committed.netIncome, committed.netExpense),
      plannedSlice.length > 0
        ? new Map([['balance', sub(plannedIncomeSummary.netIncome, plannedExpenseSummary.netExpense)]])
        : new Map(),
    )

    return {
      granularity: bucket.granularity,
      label: bucket.label,
      start: bucket.start,
      end: bucket.end,
      date: bucket.end,
      income,
      expense,
      balance,
      covered: coveredInRange(events.covered, bucket.start, bucket.end),
    }
  })

  const hasFuture = committedLedger.length > 0 || plannedLedger.length > 0

  return {
    asOf: params.asOf,
    granularity: params.granularity,
    start: windowStart,
    end: windowEnd,
    bucketCount: buckets.length,
    income: sourceValue(actualSummary.netIncome, committedSummary.netIncome, plannedMaps.income),
    expense: sourceValue(actualSummary.netExpense, committedSummary.netExpense, plannedMaps.expense),
    balance: sourceValue(
      sub(actualSummary.netIncome, actualSummary.netExpense),
      sub(committedSummary.netIncome, committedSummary.netExpense),
      plannedLedger.length > 0
        ? new Map([['balance', sub(plannedSummary.netIncome, plannedSummary.netExpense)]])
        : new Map(),
    ),
    incomeCategoryDetails,
    expenseCategoryDetails,
    points,
    predictionNote: hasFuture ? PREDICTION_NOTE_DEFAULT : undefined,
  }
}
