export {
  ZERO_MINOR,
  add,
  abs,
  formatAmount,
  formatCurrency,
  fromMajor,
  isNegative,
  isZero,
  max,
  min,
  minor,
  neg,
  parseAmount,
  round,
  sub,
  sum,
  toMajor,
  type Minor,
} from './money.js'

export {
  addDays,
  addMonths,
  compare,
  contains,
  fromDate,
  isAfter,
  isBefore,
  isLocalDate,
  isoWeekLabel,
  localDate,
  maxDate,
  minDate,
  periodLengthInDays,
  periodOf,
  periodOfDay,
  periodOfMonth,
  periodOfQuarter,
  periodOfWeek,
  periodOfYear,
  startOfMonth,
  startOfNextMonth,
  startOfNextQuarter,
  startOfNextYear,
  startOfQuarter,
  startOfWeek,
  startOfYear,
  today,
  type LocalDate,
  type Period,
  type PeriodKind,
} from './date.js'

export {
  EQUITY_ACCOUNT_ID,
  type LedgerTransaction,
  type OpeningBalance,
  type Posting,
  type TransactionKind,
} from './ledger/types.js'

export { accountDelta, balanceAt, balanceBefore, postingsOf } from './ledger/postings.js'

export {
  CURRENT_RULE_VERSION,
  registerRuleSet,
  rulesFor,
  type BudgetKind,
  type BudgetScope,
  type BudgetTransaction,
  type CountableTransaction,
  type FlowKind,
  type RuleSet,
  type ScopeQuery,
} from './ledger/rules.js'

export {
  resolvePreviousSnapshotIds,
  sortSnapshotChain,
  type SnapshotChainNode,
} from './investment.js'

export {
  UNCATEGORIZED_CATEGORY_ID,
  flowByCategory,
  remainingRefundable,
  summarizeAggregatedFlows,
  summarizeFlows,
  type AggregatedFlowRow,
  type FlowSummary,
  type FlowSummaryOptions,
} from './ledger/summary.js'

export { sumAssetsLiabilities, sumPositiveAssets } from './statements/aggregates.js'
export { buildBalanceSheet } from './statements/balance-sheet.js'
export type {
  BalanceSheetAccountInput,
  BalanceSheetAccountNode,
  BalanceSheetCategoryNode,
  BalanceSheetResult,
} from './statements/balance-sheet.js'
export type { AccountTypeRef, AssetLiabilityTotals } from './statements/types.js'
export { buildCategoryTree } from './statements/category-tree.js'
export type { CategoryRef, FlowCategoryType } from './statements/category-tree.js'
export { buildIncomeExpenseStatement } from './statements/income-expense.js'
export type {
  IncomeExpenseCategoryDetail,
  IncomeExpensePrediction,
  IncomeExpenseReconciliation,
  IncomeExpenseStatement,
  IncomeExpenseStatementInput,
} from './statements/income-expense.js'
export { buildIncomeExpenseProjection } from './statements/income-expense-projection.js'
export type {
  IncomeExpenseProjectionInput,
  IncomeExpenseProjectionOutput,
  IncomeExpenseProjectionPoint,
  ProjectionCategoryDetail,
} from './statements/income-expense-projection.js'

export { budgetContributionSign } from './budget/scope.js'
export { computeBudgetStatus, summarizeBudgetUsage } from './budget/status.js'
export { budgetKindOf, generateBudgetOccurrences } from './budget/occurrences.js'
export type {
  BudgetOccurrencePoint,
  BudgetScopedRow,
  BudgetStatusInput,
  BudgetStatusResult,
  BudgetUsageContribution,
  BudgetUsageRow,
  BudgetUsageSummary,
} from './budget/types.js'

// ===== 投影领域：分桶、三来源合成、事件互斥、资产 / 现金流推演 =====
export { bucketStartOf, buildProjectionBuckets, futureLimitOf } from './projection/buckets.js'
export {
  addBalance,
  projectionFlowValue,
  projectionSourceValue,
  sumProjectionFlows,
  zeroBalance,
} from './projection/sources.js'
export {
  coveredInRange,
  excludeCovered,
  matchOccurrences,
  mergeFutureEvents,
} from './projection/events.js'
export {
  aggregateBalances,
  applyEventToBalances,
  balanceAtBucket,
  buildAccountDetail,
  cashBalanceTotal,
  cashFlowOf,
  type HistoricalBalanceSnapshot,
} from './projection/balances.js'
export { buildAssetProjection, type AssetProjectionInput, type AssetProjectionOutput } from './projection/asset.js'
export {
  buildCashFlowProjection,
  type CashActualEntry,
  type CashFlowProjectionInput,
  type CashFlowProjectionOutput,
} from './projection/cash-flow.js'
export { buildPeriodPlanPoints, type PeriodPlanInput } from './projection/period-plan.js'
export type {
  AssetProjectionPoint,
  BudgetPeriodPlanPoint,
  BudgetPeriodPlanTotals,
  BudgetPlanOccurrence,
  CashFlowProjectionPoint,
  CommittedEvent,
  CoveredOccurrence,
  PlannedEvent,
  PlannedOccurrenceMeta,
  ProjectionAccountRef,
  ProjectionAccountValue,
  ProjectionBalance,
  ProjectionBucket,
  ProjectionCategoryValue,
  ProjectionCoveredOccurrence,
  ProjectionEvent,
  ProjectionEvents,
  ProjectionFlowValue,
  ProjectionGranularity,
  ProjectionSourceValue,
} from './projection/types.js'
