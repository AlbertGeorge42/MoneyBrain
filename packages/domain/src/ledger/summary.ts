import { contains, type Period } from '../date.js'
import { ZERO_MINOR, add, max, sub, sum, type Minor } from '../money.js'
import { rulesFor, type FlowKind } from './rules.js'
import type { LedgerTransaction, TransactionKind } from './types.js'

export const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__'

export interface FlowSummary {
  income: Minor
  expense: Minor
  incomeRefunds: Minor
  expenseRefunds: Minor
  netIncome: Minor
  netExpense: Minor
  balance: Minor
}

function inPeriod(transaction: LedgerTransaction, period?: Period): boolean {
  return !period || contains(period, transaction.date)
}

/** 汇总选项：是否把「不计收支」的交易也算进来（报表的「含不计收支」口径）。 */
export interface FlowSummaryOptions {
  includeExcluded?: boolean
}

/**
 * 一组已按口径聚合好的行。
 *
 * service 侧先用 SQL 把交易按「类型 × 退款原类型 × 不计收支 × 口径版本」聚合，
 * 再交给领域层按各自版本解释——这样聚合在 SQL 跑，口径仍只有一份，
 * 且扫描量随期间增长而不是随总历史增长。
 */
export interface AggregatedFlowRow {
  /** 交易类型 */
  kind: TransactionKind
  /** 退款指向的原交易类型（决定冲减哪一侧） */
  relatedType?: string | null
  /** 「不计收支」标记 */
  excludeFromIncomeExpense?: boolean | null
  /** 写入时的口径版本 */
  ruleVersion: number
  /** 该组的金额合计 */
  amount: Minor
}

/**
 * 按已聚合的行汇总收支；退款按原交易类型冲减对应一侧。
 *
 * 与 {@link summarizeFlows} 结果一致，区别只在于输入是聚合行而不是明细。
 */
export function summarizeAggregatedFlows(
  rows: readonly AggregatedFlowRow[],
  options: FlowSummaryOptions = {},
): FlowSummary {
  let income = ZERO_MINOR
  let expense = ZERO_MINOR
  let incomeRefunds = ZERO_MINOR
  let expenseRefunds = ZERO_MINOR

  for (const row of rows) {
    const rules = rulesFor(row.ruleVersion)
    if (!rules.isCountable(row, options.includeExcluded)) continue

    switch (row.kind) {
      case 'income':
        income = add(income, row.amount)
        break
      case 'expense':
        expense = add(expense, row.amount)
        break
      case 'refund': {
        const offset = rules.refundOffsetKind(row.relatedType)
        if (offset === 'income') {
          incomeRefunds = add(incomeRefunds, row.amount)
        } else if (offset === 'expense') {
          expenseRefunds = add(expenseRefunds, row.amount)
        }
        break
      }
      default:
        break
    }
  }

  const netIncome = sub(income, incomeRefunds)
  const netExpense = sub(expense, expenseRefunds)

  return {
    income,
    expense,
    incomeRefunds,
    expenseRefunds,
    netIncome,
    netExpense,
    balance: sub(netIncome, netExpense),
  }
}

/** 收入/支出/退款汇总；退款按原交易类型冲减对应一侧。 */
export function summarizeFlows(
  transactions: readonly LedgerTransaction[],
  period?: Period,
  options: FlowSummaryOptions = {},
): FlowSummary {
  let income = ZERO_MINOR
  let expense = ZERO_MINOR
  let incomeRefunds = ZERO_MINOR
  let expenseRefunds = ZERO_MINOR

  for (const transaction of transactions) {
    const rules = rulesFor(transaction.ruleVersion)
    if (!rules.isCountable(transaction, options.includeExcluded)) continue
    if (!inPeriod(transaction, period)) continue

    switch (transaction.kind) {
      case 'income':
        income = add(income, transaction.amount)
        break
      case 'expense':
        expense = add(expense, transaction.amount)
        break
      case 'refund': {
        const offset = rules.refundOffsetKind(transaction.relatedType)
        if (offset === 'income') {
          incomeRefunds = add(incomeRefunds, transaction.amount)
        } else if (offset === 'expense') {
          expenseRefunds = add(expenseRefunds, transaction.amount)
        }
        break
      }
      default:
        break
    }
  }

  const netIncome = sub(income, incomeRefunds)
  const netExpense = sub(expense, expenseRefunds)

  return {
    income,
    expense,
    incomeRefunds,
    expenseRefunds,
    netIncome,
    netExpense,
    balance: sub(netIncome, netExpense),
  }
}

/** 按分类聚合净收入或净支出。退款会从原分类中扣减。 */
export function flowByCategory(
  transactions: readonly LedgerTransaction[],
  kind: FlowKind,
  period?: Period,
  options: FlowSummaryOptions = {},
): Map<string, Minor> {
  const result = new Map<string, Minor>()

  const append = (categoryId: string | null | undefined, amount: Minor) => {
    const key = categoryId ?? UNCATEGORIZED_CATEGORY_ID
    result.set(key, add(result.get(key) ?? ZERO_MINOR, amount))
  }

  for (const transaction of transactions) {
    const rules = rulesFor(transaction.ruleVersion)
    if (!rules.isCountable(transaction, options.includeExcluded)) continue
    if (!inPeriod(transaction, period)) continue

    if (transaction.kind === kind) {
      append(transaction.categoryId, transaction.amount)
    } else if (transaction.kind === 'refund' && rules.refundOffsetKind(transaction.relatedType) === kind) {
      append(transaction.categoryId, sub(ZERO_MINOR, transaction.amount))
    }
  }

  return result
}

/** 可退金额计算需要的最小结构（原交易 + 它的退款）。 */
export interface RefundableOriginal {
  id: string
  kind: string
  amount: Minor
}

export interface RefundableRefund {
  kind: string
  amount: Minor
  relatedTransactionId?: string | null
}

/**
 * 原交易还可退多少。
 *
 * 退款上限的口径只有这一处；后端创建/编辑退款时也调用它，
 * 避免自己再写一遍「原额 − 已退额」。
 */
export function remainingRefundable(
  original: RefundableOriginal,
  refunds: readonly RefundableRefund[],
): Minor {
  if (original.kind !== 'income' && original.kind !== 'expense') return ZERO_MINOR

  const refunded = sum(
    refunds
      .filter((refund) => refund.kind === 'refund' && refund.relatedTransactionId === original.id)
      .map((refund) => refund.amount),
  )

  return max(sub(original.amount, refunded), ZERO_MINOR)
}
