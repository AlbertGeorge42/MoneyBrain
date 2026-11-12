import { ZERO_MINOR, add } from '../money.js'
import { bucketStartOf } from './buckets.js'
import type {
  BudgetPeriodPlanPoint,
  BudgetPeriodPlanTotals,
  BudgetPlanOccurrence,
  ProjectionBucket,
  ProjectionGranularity,
} from './types.js'

export interface PeriodPlanInput {
  granularity: ProjectionGranularity
  buckets: readonly ProjectionBucket[]
  /** API 已完成 Date → LocalDate、元 → 分、类型收窄的边界转换。 */
  occurrences: readonly BudgetPlanOccurrence[]
}

function zeroTotals(): BudgetPeriodPlanTotals {
  return { income: ZERO_MINOR, expense: ZERO_MINOR, transfer: ZERO_MINOR }
}

/** 把预算展开点位按桶归组，并给出每桶三类额度合计与 hasBudget。 */
export function buildPeriodPlanPoints(input: PeriodPlanInput): BudgetPeriodPlanPoint[] {
  const { granularity, buckets, occurrences } = input

  const points: BudgetPeriodPlanPoint[] = buckets.map((bucket) => ({
    month: bucket.label,
    granularity,
    label: bucket.label,
    start: bucket.start,
    end: bucket.end,
    date: bucket.end,
    hasBudget: false,
    budgets: [],
    totals: null,
  }))
  const pointByStart = new Map(points.map((point) => [point.start, point]))

  for (const occurrence of occurrences) {
    const point = pointByStart.get(bucketStartOf(granularity, occurrence.date))
    if (!point) continue

    point.budgets.push(occurrence)
    const totals = point.totals ?? zeroTotals()
    totals[occurrence.type] = add(totals[occurrence.type], occurrence.amount)
    point.totals = totals
    point.hasBudget = true
  }

  for (const point of points) {
    point.budgets.sort((a, b) =>
      a.date === b.date ? a.budgetId.localeCompare(b.budgetId) : a.date.localeCompare(b.date),
    )
  }

  return points
}
