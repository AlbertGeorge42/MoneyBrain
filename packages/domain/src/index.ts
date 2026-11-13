export {
  ZERO_MINOR,
  add,
  abs,
  formatAmount,
  formatCurrency,
  fromMajor,
  minor,
  neg,
  parseAmount,
  sub,
  sum,
  toMajor,
  type Minor,
} from './money.js'

export {
  addDays,
  addMonths,
  contains,
  dateParts,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  endOfYear,
  fromDate,
  fromUtcDate,
  isLocalDate,
  isoWeekLabel,
  localDate,
  periodLengthInDays,
  periodOf,
  periodOfMonth,
  periodOfQuarter,
  periodOfWeek,
  periodOfYear,
  startOfMonth,
  startOfWeek,
  startOfYear,
  today,
  toUtcDate,
  weekdayOffset,
  type LocalDate,
  type Period,
  type PeriodKind,
} from './date.js'

export {
  type LedgerTransaction,
  type OpeningBalance,
  type TransactionKind,
} from './ledger/types.js'

export { accountDelta, balanceAt, balanceBefore, postingsOf } from './ledger/postings.js'

export {
  isCountable,
  matchesBudgetScope,
  refundOffsetKind,
  scopeQuery,
  transferInflow,
  transferNet,
  transferOutflow,
  type BudgetScope,
} from './ledger/rules.js'

export {
  resolvePreviousSnapshotIds,
  sortSnapshotChain,
  type SnapshotChainNode,
} from './investment/snapshot-chain.js'

export { calculateXIRR } from './investment/xirr.js'

export {
  calculateMaxCapitalEmployed,
  calculateReturnMetrics,
} from './investment/returns.js'

export { calculateTWR } from './investment/twr.js'

export {
  buildAllocationItems,
  buildSnapshotHistory,
  mergeCategoryItems,
} from './investment/allocation.js'

export {
  type AllocationItem,
  type AllocationSnapshot,
  type AllocationSnapshotItem,
  type InvestmentCashFlow,
} from './investment/types.js'

export {
  UNCATEGORIZED_CATEGORY_ID,
  flowByCategory,
  remainingRefundable,
  summarizeAggregatedFlows,
  summarizeFlows,
  type AggregatedFlowRow,
} from './ledger/summary.js'

export { sumAssetsLiabilities, sumPositiveAssets } from './statements/aggregates.js'
export { buildBalanceSheet } from './statements/balance-sheet.js'
export type { BalanceSheetAccountInput } from './statements/balance-sheet.js'
export { buildCategoryTree } from './statements/category-tree.js'
export type { CategoryRef } from './statements/category-tree.js'
export { buildIncomeExpenseStatement } from './statements/income-expense.js'
export type {
  IncomeExpensePrediction,
  IncomeExpenseStatementInput,
} from './statements/income-expense.js'
export { buildIncomeExpenseProjection } from './statements/income-expense-projection.js'
export { aggregate } from './statements/cash-flow/aggregate.js'
export { buildStatement, buildProjectionActivity } from './statements/cash-flow/statement.js'
export { buildSankey } from './statements/cash-flow/sankey.js'
export type {
  ProcessedTx,
  SankeySourceTransaction,
} from './statements/cash-flow/types.js'

export { budgetContributionSign } from './budget/scope.js'
export { computeBudgetStatus, summarizeBudgetUsage } from './budget/status.js'
export { budgetKindOf, generateBudgetOccurrences } from './budget/occurrences.js'
export type { BudgetUsageRow } from './budget/types.js'

// ===== 投影领域：分桶、三来源合成、事件互斥、资产 / 现金流推演 =====
export { bucketStartOf, buildProjectionBuckets, futureLimitOf } from './projection/buckets.js'
export {
  projectionFlowValue,
  projectionSourceValue,
} from './projection/sources.js'
export {
  coveredInRange,
  excludeCovered,
  matchOccurrences,
} from './projection/events.js'
export {
  cashFlowOf,
  type HistoricalBalanceSnapshot,
} from './projection/balances.js'
export { buildAssetProjection } from './projection/asset.js'
export { buildCashFlowProjection } from './projection/cash-flow.js'
export { buildPeriodPlanPoints } from './projection/period-plan.js'
export {
  accumulatePredictedChanges,
  predictedAccountTotal,
  sumPredictedByType,
  type PredictedEvent,
} from './projection/predicted-changes.js'
export type {
  BudgetPlanOccurrence,
  CommittedEvent,
  CoveredOccurrence,
  PlannedEvent,
  ProjectionAccountRef,
  ProjectionBucket,
  ProjectionEvent,
  ProjectionEvents,
  ProjectionGranularity,
} from './projection/types.js'
