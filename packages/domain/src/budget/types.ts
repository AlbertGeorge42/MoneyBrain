import type { BudgetScope } from '../ledger/rules.js'
import type { Minor } from '../money.js'

/**
 * 预算口径行：SQL 聚合行与下钻明细交易都能映射到这个最小结构。
 * 不复用 Prisma 的 Transaction / Budget，也不引用 packages/contracts 的 DTO。
 */
export interface BudgetScopedRow {
  type: string
  accountId: string
  toAccountId: string | null
  categoryId: string | null
  excludeFromIncomeExpense: boolean
  relatedType: string | null
  /** 写入时的口径版本：每行按自己的版本解释。 */
  ruleVersion: number
}

/** 带金额的预算口径行，金额一律整数分。 */
export interface BudgetUsageRow extends BudgetScopedRow {
  amount: Minor
}

/** 预算状态的领域输入：额度与统计范围。 */
export interface BudgetStatusInput {
  amount: Minor
  scope: BudgetScope
}

/** 预算状态：金额为整数分，percentage 是真实百分比（超支 >100 不截断）。 */
export interface BudgetStatusResult {
  used: Minor
  remaining: Minor
  percentage: number
  isOverBudget: boolean
}

/** 下钻明细中一条计入的记录，index 对应输入行的位置。 */
export interface BudgetUsageContribution {
  index: number
  signedAmount: Minor
}

/** 下钻明细的领域计算结果。 */
export interface BudgetUsageSummary {
  contributions: BudgetUsageContribution[]
  count: number
  /** 未夹到 0 的原始合计（跨期退款可能为负）。 */
  total: Minor
  /** 与预算状态同款下限：max(total, 0)。 */
  used: Minor
}

/**
 * 预算展开点位（含所属周期范围）。
 * 沿用既有的本地日历日 Date 口径：迁移只搬算法，不改日期语义与落点。
 */
export interface BudgetOccurrencePoint {
  date: Date
  periodStart: Date
  periodEnd: Date
}
