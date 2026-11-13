/**
 * 账务口径规则（唯一来源，固定内核）。
 *
 * 「口径」= 哪些交易参与统计、退款冲减哪一侧、账户与分类如何匹配，
 * 以及一笔交易如何翻译成分录。
 *
 * 内核口径已固定，不带版本号：所有交易一律按本文件解释，不再有第二套规则。
 * 转账金额语义：amount = 本金 X、fee = 手续费 f、coupon = 优惠券 c，
 * 转出 = X + f、转入 = X + c、账户总余额变化 = c − f。
 */
import { ZERO_MINOR, add, neg, sub, type Minor } from '../money.js'
import {
  EQUITY_ACCOUNT_ID,
  type LedgerTransaction,
  type Posting,
} from './types.js'

/** 收支两侧。 */
export type FlowKind = 'income' | 'expense'

/** 预算类型：收支两侧 + 转账。 */
export type BudgetKind = FlowKind | 'transfer'

/** 参与「不计收支」判断的最小结构。 */
export interface CountableTransaction {
  excludeFromIncomeExpense?: boolean | null
}

/** 参与预算口径判断的最小结构。 */
export interface BudgetTransaction extends CountableTransaction {
  kind: string
  accountId: string
  toAccountId?: string | null
  categoryId?: string | null
}

/** 统计范围：一条口径的适用范围。 */
export interface BudgetScope {
  /** 统计哪一侧：收入 / 支出 / 转账 */
  kind: BudgetKind
  /** 账户口径：收支只认这个账户；转账只认「转出 + 转入」这一对 */
  accountId: string
  /** 转账预算的转入账户 */
  toAccountId?: string | null
  /** 分类口径：分类子树；未分类的交易不计入 */
  categoryIds: ReadonlySet<string>
}

/**
 * SQL 侧需要的口径参数：领域层给出，API 翻译成 where 条件。
 * 这样「统计哪些类型」这件事也只有一处定义。
 */
export interface ScopeQuery {
  /** 参与统计的正向交易类型 */
  type: string
  /** 退款是否参与冲减（转账预算不计退款） */
  countsRefunds: boolean
  /** 退款的 relatedType：冲减哪一侧 */
  refundRelatedType: string
}

/**
 * 把一笔交易翻译成复式分录。
 *
 * - 收入：账户 +amount，收入分类 −amount
 * - 支出：账户 −amount，支出分类 +amount
 * - 转账：转出 −(X+f)、转入 +(X+c)、平衡分录 +(f−c)，Σ postings 恒为 0
 * - 退款：支出退款 = 账户 +amount；收入退款 = 账户 −amount
 * - 平账：账户 +amount，权益 −amount
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
      const fee = transaction.fee ?? ZERO_MINOR
      const coupon = transaction.coupon ?? ZERO_MINOR
      return [
        { accountId, amount: neg(add(amount, fee)), kind: 'account' },
        { accountId: transaction.toAccountId, amount: add(amount, coupon), kind: 'account' },
        // 平衡分录：−(X+f) + (X+c) + (f−c) = 0；可为负，表示券带来的额外权益
        { accountId: EQUITY_ACCOUNT_ID, amount: sub(fee, coupon), categoryId: postingCategoryId, kind: 'category' },
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

/** 转账中手续费与券对账户总余额的净影响：c − f。 */
export function transferNet(fee?: Minor, coupon?: Minor): Minor {
  return sub(coupon ?? ZERO_MINOR, fee ?? ZERO_MINOR)
}

/** 转账从转出账户流出的现金：本金 + 手续费。 */
export function transferOutflow(principal: Minor, fee?: Minor): Minor {
  return add(principal, fee ?? ZERO_MINOR)
}

/** 转账转入方收到的现金：本金 + 优惠券。 */
export function transferInflow(principal: Minor, coupon?: Minor): Minor {
  return add(principal, coupon ?? ZERO_MINOR)
}

/**
 * 退款冲减哪一侧：由原交易类型决定。
 * 收入退款 = 钱流出去，冲减收入；支出退款 = 钱流回来，冲减支出。
 * 传入无法识别的原类型时返回 null（不参与任何一侧的冲减）。
 */
export function refundOffsetKind(relatedType: string | null | undefined): FlowKind | null {
  if (relatedType === 'income') return 'income'
  if (relatedType === 'expense') return 'expense'
  return null
}

/** 「不计收支」的交易不参与任何收支统计，但仍影响余额。 */
export function isCountable(
  transaction: CountableTransaction,
  includeExcluded = false,
): boolean {
  if (includeExcluded) return true
  return !transaction.excludeFromIncomeExpense
}

/** 范围对应的 SQL 口径参数。 */
export function scopeQuery(scope: BudgetScope): ScopeQuery {
  return {
    type: scope.kind,
    countsRefunds: scope.kind !== 'transfer',
    refundRelatedType: scope.kind,
  }
}

/** 账户 + 分类口径是否覆盖这笔交易（JS 侧判断）。 */
export function matchesBudgetScope(
  transaction: BudgetTransaction,
  scope: BudgetScope,
): boolean {
  if (!isCountable(transaction)) return false
  // 未分类的交易不计入任何分类预算
  if (!transaction.categoryId || !scope.categoryIds.has(transaction.categoryId)) return false

  if (scope.kind === 'transfer') {
    // 转账预算只认绑定的那一对账户
    return (
      transaction.kind === 'transfer' &&
      transaction.accountId === scope.accountId &&
      (scope.toAccountId == null || transaction.toAccountId === scope.toAccountId)
    )
  }
  return transaction.accountId === scope.accountId
}
