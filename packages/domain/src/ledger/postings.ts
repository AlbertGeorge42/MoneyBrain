import { addDays, compare, type LocalDate } from '../date.js'
import { ZERO_MINOR, add, sum, type Minor } from '../money.js'
import { rulesFor } from './rules.js'
import type { LedgerTransaction, OpeningBalance, Posting } from './types.js'

/**
 * 把一笔交易翻译成复式分录。
 * 使用交易写入时的口径版本；未知版本会直接失败。
 */
export function postingsOf(transaction: LedgerTransaction): Posting[] {
  return rulesFor(transaction.ruleVersion).postingsOf(transaction)
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
