import type { LocalDate } from '../date.js'
import type { Minor } from '../money.js'

export type TransactionKind = 'income' | 'expense' | 'transfer' | 'refund' | 'adjustment'

/**
 * 领域层的交易输入。
 *
 * 金额语义：
 * - income / expense：净现金流（手续费、优惠券已折算进 amount）
 * - transfer：本金（手续费、优惠券单独存放）
 * - refund：实际退回/退出的现金
 * - adjustment：对账户余额的增量
 */
export interface LedgerTransaction {
  id: string
  kind: TransactionKind
  date: LocalDate
  amount: Minor
  fee?: Minor
  coupon?: Minor
  accountId: string
  toAccountId?: string | null
  categoryId?: string | null
  relatedTransactionId?: string | null
  relatedType?: 'income' | 'expense' | null
  excludeFromIncomeExpense?: boolean
}

/**
 * 一条分录。正数增加账户/分类余额，负数减少。
 * 权益账户仅用于让平账交易保持复式平衡，不参与用户可见报表。
 */
export interface Posting {
  accountId: string
  amount: Minor
  categoryId?: string | null
  kind: 'account' | 'category' | 'equity'
}

export const EQUITY_ACCOUNT_ID = '__equity__'

export interface OpeningBalance {
  /** 缺省表示账户没有明确的期初日期，期初余额覆盖全部历史交易。 */
  date?: LocalDate
  amount: Minor
}
