import { contains, type Period } from '../date.js'
import { ZERO_MINOR, add, max, sub, sum, type Minor } from '../money.js'
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

function countable(transaction: LedgerTransaction): boolean {
  return !transaction.excludeFromIncomeExpense
}

/** 收入/支出/退款汇总；退款按原交易类型冲减对应一侧。 */
export function summarizeFlows(
  transactions: readonly LedgerTransaction[],
  period?: Period,
): FlowSummary {
  let income = ZERO_MINOR
  let expense = ZERO_MINOR
  let incomeRefunds = ZERO_MINOR
  let expenseRefunds = ZERO_MINOR

  for (const transaction of transactions) {
    if (!countable(transaction) || !inPeriod(transaction, period)) continue

    switch (transaction.kind) {
      case 'income':
        income = add(income, transaction.amount)
        break
      case 'expense':
        expense = add(expense, transaction.amount)
        break
      case 'refund':
        if (transaction.relatedType === 'income') {
          incomeRefunds = add(incomeRefunds, transaction.amount)
        } else if (transaction.relatedType === 'expense') {
          expenseRefunds = add(expenseRefunds, transaction.amount)
        }
        break
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
  kind: 'income' | 'expense',
  period?: Period,
): Map<string, Minor> {
  const result = new Map<string, Minor>()

  const append = (categoryId: string | null | undefined, amount: Minor) => {
    const key = categoryId ?? UNCATEGORIZED_CATEGORY_ID
    result.set(key, add(result.get(key) ?? ZERO_MINOR, amount))
  }

  for (const transaction of transactions) {
    if (!countable(transaction) || !inPeriod(transaction, period)) continue

    if (transaction.kind === kind) {
      append(transaction.categoryId, transaction.amount)
    } else if (transaction.kind === 'refund' && transaction.relatedType === kind) {
      append(transaction.categoryId, sub(ZERO_MINOR, transaction.amount))
    }
  }

  return result
}

export interface BudgetUsageInput {
  kind: 'income' | 'expense' | 'transfer'
  period: Period
  categoryIds: ReadonlySet<string>
  accountId: string
  toAccountId?: string | null
}

/**
 * 预算已用金额。
 * 预算与交易使用同一套日期/账户/分类口径，退款自动冲减。
 */
export function budgetUsage(
  transactions: readonly LedgerTransaction[],
  input: BudgetUsageInput,
): Minor {
  let used = ZERO_MINOR

  for (const transaction of transactions) {
    if (!countable(transaction) || !contains(input.period, transaction.date)) continue
    if (transaction.categoryId && !input.categoryIds.has(transaction.categoryId)) continue

    const accountMatches =
      transaction.accountId === input.accountId ||
      (transaction.kind === 'transfer' &&
        input.toAccountId != null &&
        transaction.toAccountId === input.toAccountId)

    if (!accountMatches) continue

    if (transaction.kind === input.kind) {
      used = add(used, transaction.amount)
    } else if (transaction.kind === 'refund' && transaction.relatedType === input.kind) {
      used = sub(used, transaction.amount)
    }
  }

  return max(used, ZERO_MINOR)
}

/** 原交易还可退多少。 */
export function remainingRefundable(
  original: LedgerTransaction,
  refunds: readonly LedgerTransaction[],
): Minor {
  if (original.kind !== 'income' && original.kind !== 'expense') return ZERO_MINOR

  const refunded = sum(
    refunds
      .filter((refund) => refund.kind === 'refund' && refund.relatedTransactionId === original.id)
      .map((refund) => refund.amount),
  )

  return max(sub(original.amount, refunded), ZERO_MINOR)
}
