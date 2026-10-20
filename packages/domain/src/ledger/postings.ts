import { addDays, compare, type LocalDate } from '../date.js'
import { ZERO_MINOR, add, max, neg, sub, sum, type Minor } from '../money.js'
import {
  EQUITY_ACCOUNT_ID,
  type LedgerTransaction,
  type OpeningBalance,
  type Posting,
} from './types.js'

/**
 * 把一笔交易翻译成复式分录。
 *
 * 规则：
 * - 收入：账户 +amount，收入分类 -amount
 * - 支出：账户 -amount，支出分类 +amount
 * - 转账：转出 -(本金 + 有效手续费)，转入 +本金，手续费 +有效手续费
 * - 退款：支出退款 = 账户 +amount；收入退款 = 账户 -amount
 * - 平账：账户 +amount，权益 -amount
 */
export function postingsOf(transaction: LedgerTransaction): Posting[] {
  const { amount, accountId, categoryId } = transaction
  const postingCategoryId = categoryId ?? null

  switch (transaction.kind) {
    case 'income':
      return [
        { accountId, amount, kind: 'account' },
        { accountId: EQUITY_ACCOUNT_ID, amount: neg(amount), categoryId: postingCategoryId, kind: 'category' },
      ]

    case 'expense':
      return [
        { accountId, amount: neg(amount), kind: 'account' },
        { accountId: EQUITY_ACCOUNT_ID, amount, categoryId: postingCategoryId, kind: 'category' },
      ]

    case 'transfer': {
      if (!transaction.toAccountId) {
        throw new Error(`转账 ${transaction.id} 缺少转入账户`)
      }
      const effectiveFee = effectiveTransferFee(transaction.fee, transaction.coupon)
      return [
        { accountId, amount: neg(add(amount, effectiveFee)), kind: 'account' },
        { accountId: transaction.toAccountId, amount, kind: 'account' },
        { accountId: EQUITY_ACCOUNT_ID, amount: effectiveFee, categoryId: postingCategoryId, kind: 'category' },
      ]
    }

    case 'refund': {
      const direction: 1 | -1 = transaction.relatedType === 'income' ? -1 : 1
      const cash = direction === 1 ? amount : neg(amount)
      const contra = direction === 1 ? neg(amount) : amount
      return [
        { accountId, amount: cash, kind: 'account' },
        { accountId: EQUITY_ACCOUNT_ID, amount: contra, categoryId: postingCategoryId, kind: 'category' },
      ]
    }

    case 'adjustment':
      return [
        { accountId, amount, kind: 'account' },
        { accountId: EQUITY_ACCOUNT_ID, amount: neg(amount), kind: 'equity' },
      ]
  }
}

/**
 * 转账有效手续费：优惠券只能抵扣手续费，不能凭空创造余额。
 */
export function effectiveTransferFee(
  fee: Minor = ZERO_MINOR,
  coupon: Minor = ZERO_MINOR,
): Minor {
  return max(sub(fee, coupon), ZERO_MINOR)
}

/** 转账从转出账户流出的现金：本金 + 有效手续费。 */
export function transferOutflow(
  principal: Minor,
  fee: Minor = ZERO_MINOR,
  coupon: Minor = ZERO_MINOR,
): Minor {
  return add(principal, effectiveTransferFee(fee, coupon))
}

/** 该交易对指定账户余额的影响。 */
export function accountDelta(transaction: LedgerTransaction, accountId: string): Minor {
  return sum(
    postingsOf(transaction)
      .filter((posting) => posting.kind === 'account' && posting.accountId === accountId)
      .map((posting) => posting.amount),
  )
}

/** 余额（包含 date 当天），期初余额视为 opening.date 当天开始前的一笔分录。 */
export function balanceAt(
  accountId: string,
  opening: OpeningBalance,
  transactions: readonly LedgerTransaction[],
  date: LocalDate,
): Minor {
  return balanceBefore(accountId, opening, transactions, addDays(date, 1))
}

/**
 * 余额（不包含 date 当天）。
 * API 层通常传入「查询截止日的下一天」，语义更接近数据库的 `< end`。
 */
export function balanceBefore(
  accountId: string,
  opening: OpeningBalance,
  transactions: readonly LedgerTransaction[],
  date: LocalDate,
): Minor {
  const openingDate = opening.date
  if (!openingDate) {
    return transactions
      .filter((transaction) => transaction.date < date)
      .reduce((total, transaction) => add(total, accountDelta(transaction, accountId)), opening.amount)
  }

  if (compare(date, openingDate) <= 0) {
    return compare(date, openingDate) === 0 ? opening.amount : ZERO_MINOR
  }

  return transactions
    .filter((transaction) => transaction.date >= openingDate && transaction.date < date)
    .reduce((total, transaction) => add(total, accountDelta(transaction, accountId)), opening.amount)
}
