import { addDays, compare, type LocalDate } from '../date.js'
import { add, sub, type Minor } from '../money.js'
import { postingsOf } from './rules.js'
import type { LedgerTransaction, OpeningBalance } from './types.js'

export { postingsOf } from './rules.js'

/** 该交易对指定账户余额的影响。 */
export function accountDelta(transaction: LedgerTransaction, accountId: string): Minor {
  return postingsOf(transaction)
    .filter((posting) => posting.kind === 'account' && posting.accountId === accountId)
    .reduce((total, posting) => add(total, posting.amount), 0 as Minor)
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
 *
 * `opening.date` 只是「该日账户余额 = opening.amount」这个锚点，不是账户的存在起点：
 * 锚点之后向前累加交易，锚点之前从锚点余额反推减去区间内交易，两侧都能算出余额。
 * 没有锚点时，opening.amount 覆盖全部历史，直接累加 date 之前的所有交易。
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

  if (compare(date, openingDate) === 0) return opening.amount

  if (compare(date, openingDate) > 0) {
    return transactions
      .filter((transaction) => transaction.date >= openingDate && transaction.date < date)
      .reduce((total, transaction) => add(total, accountDelta(transaction, accountId)), opening.amount)
  }

  return transactions
    .filter((transaction) => transaction.date >= date && transaction.date < openingDate)
    .reduce((total, transaction) => sub(total, accountDelta(transaction, accountId)), opening.amount)
}
