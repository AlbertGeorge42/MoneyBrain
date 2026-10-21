import { contains, type Period } from '../date.js'
import { ZERO_MINOR, add, max, sub, sum, type Minor } from '../money.js'
import { isCountable, refundOffsetKind, type FlowKind } from './rules.js'
import type { LedgerTransaction } from './types.js'

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
    if (!isCountable(transaction, options.includeExcluded)) continue
    if (!inPeriod(transaction, period)) continue

    switch (transaction.kind) {
      case 'income':
        income = add(income, transaction.amount)
        break
      case 'expense':
        expense = add(expense, transaction.amount)
        break
      case 'refund': {
        const offset = refundOffsetKind(transaction.relatedType)
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
    if (!isCountable(transaction, options.includeExcluded)) continue
    if (!inPeriod(transaction, period)) continue

    if (transaction.kind === kind) {
      append(transaction.categoryId, transaction.amount)
    } else if (transaction.kind === 'refund' && refundOffsetKind(transaction.relatedType) === kind) {
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
