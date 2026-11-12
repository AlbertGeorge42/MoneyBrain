import type { LocalDate } from '../date.js'
import { UNCATEGORIZED_CATEGORY_ID, flowByCategory, summarizeFlows } from '../ledger/summary.js'
import type { LedgerTransaction } from '../ledger/types.js'
import { ZERO_MINOR, sub, sum, type Minor } from '../money.js'
import { coveredInRange } from '../projection/events.js'
import { projectionSourceValue } from '../projection/sources.js'
import type {
  CoveredOccurrence,
  ProjectionBucket,
  ProjectionCoveredOccurrence,
  ProjectionGranularity,
  ProjectionSourceValue,
} from '../projection/types.js'
import { buildCategoryTree, type CategoryRef, type FlowCategoryType } from './category-tree.js'

export interface IncomeExpenseProjectionInput {
  buckets: readonly ProjectionBucket[]
  /** 已发生、已承诺、计划三来源的收支分录交易（均已按窗口与 FLOW_KINDS 过滤）。 */
  actualLedger: readonly LedgerTransaction[]
  committedLedger: readonly LedgerTransaction[]
  plannedLedger: readonly LedgerTransaction[]
  categories: readonly CategoryRef[]
  uncategorizedLabel: string
  includeExcluded: boolean
  covered: readonly CoveredOccurrence[]
}

export interface ProjectionCategoryDetail {
  name: string
  categoryId: string
  hasChildren: boolean
  sort: number
  actual: Minor
  committed: Minor
  planned: Minor | null
  total: Minor
  hasBudget: boolean
  children?: ProjectionCategoryDetail[]
}

export interface IncomeExpenseProjectionPoint {
  granularity: ProjectionGranularity
  label: string
  start: LocalDate
  end: LocalDate
  date: LocalDate
  income: ProjectionSourceValue
  expense: ProjectionSourceValue
  balance: ProjectionSourceValue
  covered: ProjectionCoveredOccurrence[]
}

export interface IncomeExpenseProjectionOutput {
  income: ProjectionSourceValue
  expense: ProjectionSourceValue
  balance: ProjectionSourceValue
  incomeCategoryDetails: ProjectionCategoryDetail[]
  expenseCategoryDetails: ProjectionCategoryDetail[]
  points: IncomeExpenseProjectionPoint[]
  hasFuture: boolean
}

type CategoryMaps = {
  income: Map<string, Minor>
  expense: Map<string, Minor>
}

/** 闭区间 [start, end] 内的分录交易（桶边界按日历日比较）。 */
function ledgerInRange(
  list: readonly LedgerTransaction[],
  start: LocalDate,
  end: LocalDate,
): LedgerTransaction[] {
  return list.filter((transaction) => transaction.date >= start && transaction.date <= end)
}

/**
 * 构造收支三来源投影：逐桶 actual / committed / planned 汇总、
 * 分类明细树与顶层三来源合计。取数、occurrence 互斥与 DTO 文案留在 API。
 */
export function buildIncomeExpenseProjection(
  input: IncomeExpenseProjectionInput,
): IncomeExpenseProjectionOutput {
  const { actualLedger, committedLedger, plannedLedger, categories } = input
  const options = { includeExcluded: input.includeExcluded }

  const actualSummary = summarizeFlows(actualLedger, undefined, options)
  const committedSummary = summarizeFlows(committedLedger, undefined, options)
  const plannedSummary = summarizeFlows(plannedLedger, undefined, options)

  const categoryMaps = (ledger: readonly LedgerTransaction[]): CategoryMaps => ({
    income: flowByCategory(ledger, 'income', undefined, options),
    expense: flowByCategory(ledger, 'expense', undefined, options),
  })
  const actualMaps = categoryMaps(actualLedger)
  const committedMaps = categoryMaps(committedLedger)
  const plannedMaps = categoryMaps(plannedLedger)

  const categoryTree = (type: FlowCategoryType): ProjectionCategoryDetail[] =>
    buildCategoryTree<ProjectionCategoryDetail>(categories, type, (category, childLeaves, hasChildren) => {
      const ownActual = actualMaps[type].get(category.id) ?? ZERO_MINOR
      const ownCommitted = committedMaps[type].get(category.id) ?? ZERO_MINOR
      const ownPlanned = plannedMaps[type].has(category.id) ? plannedMaps[type].get(category.id)! : null
      if (ownActual === 0 && ownCommitted === 0 && ownPlanned === null && childLeaves.length === 0) return null

      const childrenActual = sum(childLeaves.map((child) => child.actual))
      const childrenCommitted = sum(childLeaves.map((child) => child.committed))
      const childPlanned = childLeaves.filter((child) => child.planned !== null)
      const planned = ownPlanned === null && childPlanned.length === 0
        ? null
        : sum([ownPlanned ?? ZERO_MINOR, ...childPlanned.map((child) => child.planned ?? ZERO_MINOR)])
      const actual = sum([ownActual, childrenActual])
      const committed = sum([ownCommitted, childrenCommitted])

      const node: ProjectionCategoryDetail = {
        name: category.name,
        categoryId: category.id,
        hasChildren,
        sort: category.sort,
        actual,
        committed,
        planned,
        total: sum([actual, committed, planned ?? ZERO_MINOR]),
        hasBudget: planned !== null,
      }
      if (childLeaves.length > 0) node.children = childLeaves
      return node
    })

  const uncategorized = (type: FlowCategoryType): ProjectionCategoryDetail | null => {
    const actual = actualMaps[type].get(UNCATEGORIZED_CATEGORY_ID) ?? ZERO_MINOR
    const committed = committedMaps[type].get(UNCATEGORIZED_CATEGORY_ID) ?? ZERO_MINOR
    if (actual === 0 && committed === 0) return null
    return {
      name: input.uncategorizedLabel,
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

  const incomeCategoryDetails = categoryTree('income')
  const expenseCategoryDetails = categoryTree('expense')
  const uncategorizedIncome = uncategorized('income')
  const uncategorizedExpense = uncategorized('expense')
  if (uncategorizedIncome) incomeCategoryDetails.push(uncategorizedIncome)
  if (uncategorizedExpense) expenseCategoryDetails.push(uncategorizedExpense)

  const points: IncomeExpenseProjectionPoint[] = input.buckets.map((bucket) => {
    const actualSlice = ledgerInRange(actualLedger, bucket.start, bucket.end)
    const committedSlice = ledgerInRange(committedLedger, bucket.start, bucket.end)
    const plannedSlice = ledgerInRange(plannedLedger, bucket.start, bucket.end)

    const actual = summarizeFlows(actualSlice, undefined, options)
    const committed = summarizeFlows(committedSlice, undefined, options)

    // refund 两侧都参与：由 summarizeFlows 的退款冲减口径决定净额
    const plannedIncomeSlice = plannedSlice.filter(
      (transaction) => transaction.kind === 'income' || transaction.kind === 'refund',
    )
    const plannedExpenseSlice = plannedSlice.filter(
      (transaction) => transaction.kind === 'expense' || transaction.kind === 'refund',
    )
    const plannedIncomeSummary = summarizeFlows(plannedIncomeSlice, undefined, options)
    const plannedExpenseSummary = summarizeFlows(plannedExpenseSlice, undefined, options)

    const income = projectionSourceValue(
      actual.netIncome,
      committed.netIncome,
      plannedIncomeSlice.length > 0 ? new Map([['income', plannedIncomeSummary.netIncome]]) : new Map(),
    )
    const expense = projectionSourceValue(
      actual.netExpense,
      committed.netExpense,
      plannedExpenseSlice.length > 0 ? new Map([['expense', plannedExpenseSummary.netExpense]]) : new Map(),
    )
    const balance = projectionSourceValue(
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
      covered: coveredInRange(input.covered, bucket.start, bucket.end),
    }
  })

  return {
    income: projectionSourceValue(actualSummary.netIncome, committedSummary.netIncome, plannedMaps.income),
    expense: projectionSourceValue(actualSummary.netExpense, committedSummary.netExpense, plannedMaps.expense),
    balance: projectionSourceValue(
      sub(actualSummary.netIncome, actualSummary.netExpense),
      sub(committedSummary.netIncome, committedSummary.netExpense),
      plannedLedger.length > 0
        ? new Map([['balance', sub(plannedSummary.netIncome, plannedSummary.netExpense)]])
        : new Map(),
    ),
    incomeCategoryDetails,
    expenseCategoryDetails,
    points,
    hasFuture: committedLedger.length > 0 || plannedLedger.length > 0,
  }
}
