/**
 * 账务口径 v1（当前版本）。
 *
 * 一旦发布就不再修改：改口径 = 新增 v2 并登记到 rules.ts，
 * 这样历史交易仍按写入时的规则解释。
 */
import { ZERO_MINOR, add, max, neg, sub, type Minor } from '../money.js'
import {
  EQUITY_ACCOUNT_ID,
  type LedgerTransaction,
  type Posting,
} from './types.js'
import type {
  BudgetScope,
  BudgetTransaction,
  CountableTransaction,
  FlowKind,
  RuleSet,
  ScopeQuery,
} from './rules.js'

/** 收支两侧。 */
export type { FlowKind } from './rules.js'

/**
 * 退款冲减哪一侧：由原交易类型决定。
 * 收入退款 = 钱流出去，冲减收入；支出退款 = 钱流回来，冲减支出。
 * 传入无法识别的原类型时返回 null（不参与任何一侧的冲减）。
 */
function refundOffsetKind(relatedType: string | null | undefined): FlowKind | null {
  if (relatedType === 'income') return 'income'
  if (relatedType === 'expense') return 'expense'
  return null
}

/** 「不计收支」的交易不参与任何收支统计，但仍影响余额。 */
function isCountable(
  transaction: CountableTransaction,
  includeExcluded = false,
): boolean {
  if (includeExcluded) return true
  return !transaction.excludeFromIncomeExpense
}

/** 范围对应的 SQL 口径参数。 */
function scopeQuery(scope: BudgetScope): ScopeQuery {
  return {
    type: scope.kind,
    countsRefunds: scope.kind !== 'transfer',
    refundRelatedType: scope.kind,
  }
}

/** 账户 + 分类口径是否覆盖这笔交易（JS 侧判断）。 */
function matchesBudgetScope(
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
function postingsOf(transaction: LedgerTransaction): Posting[] {
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
      const fee = effectiveTransferFee(transaction.fee, transaction.coupon)
      return [
        { accountId, amount: neg(add(amount, fee)), kind: 'account' },
        { accountId: transaction.toAccountId, amount, kind: 'account' },
        { accountId: EQUITY_ACCOUNT_ID, amount: fee, categoryId: postingCategoryId, kind: 'category' },
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
function effectiveTransferFee(
  fee: Minor = ZERO_MINOR,
  coupon: Minor = ZERO_MINOR,
): Minor {
  return max(sub(fee, coupon), ZERO_MINOR)
}

/** 转账从转出账户流出的现金：本金 + 有效手续费。 */
function transferOutflow(
  principal: Minor,
  fee: Minor = ZERO_MINOR,
  coupon: Minor = ZERO_MINOR,
): Minor {
  return add(principal, effectiveTransferFee(fee, coupon))
}

export const V1_RULES: RuleSet = {
  version: 1,
  postingsOf,
  effectiveTransferFee,
  transferOutflow,
  refundOffsetKind,
  isCountable,
  scopeQuery,
  matchesBudgetScope,
}
