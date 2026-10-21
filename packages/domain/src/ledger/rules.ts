/**
 * 账务口径规则（唯一来源）。
 *
 * 「口径」= 哪些交易参与统计、退款冲减哪一侧、账户与分类如何匹配。
 *
 * 这份规则被两处消费：
 * - 领域层的纯函数直接判断（summarizeFlows / flowByCategory / remainingRefundable）
 * - 后端把规则翻译成 SQL 的 where 条件（预算用量、收支报表）
 *
 * 规则只在这里定义一次，两边不会各写一套而分叉。
 */

/** 收支两侧。 */
export type FlowKind = 'income' | 'expense'

/** 预算类型：收支两侧 + 转账。 */
export type BudgetKind = FlowKind | 'transfer'

/** 参与统计的交易类型（转账不进入收支统计，但进入转账预算）。 */
export const COUNTABLE_KINDS = ['income', 'expense', 'refund', 'transfer'] as const

/**
 * 退款冲减哪一侧：由原交易类型决定。
 * 收入退款 = 钱流出去，冲减收入；支出退款 = 钱流回来，冲减支出。
 * 传入无法识别的原类型时返回 null（不参与任何一侧的冲减）。
 */
export const refundOffsetKind = (
  relatedType: string | null | undefined,
): FlowKind | null => {
  if (relatedType === 'income') return 'income'
  if (relatedType === 'expense') return 'expense'
  return null
}

/** 某一侧的退款在 SQL 里的条件：type=refund 且 relatedType 指向该侧。 */
export const refundQueryFor = (side: FlowKind) => ({
  type: 'refund',
  relatedType: refundOffsetKind(side),
})

/** 「不计收支」的交易不参与任何收支统计，但仍影响余额。 */
export const isCountable = (
  transaction: { excludeFromIncomeExpense?: boolean | null },
  includeExcluded = false,
): boolean => {
  if (includeExcluded) return true
  return !transaction.excludeFromIncomeExpense
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

/** 范围对应的 SQL 口径参数。 */
export const scopeQuery = (scope: BudgetScope): ScopeQuery => ({
  type: scope.kind,
  countsRefunds: scope.kind !== 'transfer',
  refundRelatedType: scope.kind,
})

/** 账户 + 分类口径是否覆盖这笔交易（JS 侧判断）。 */
export const matchesBudgetScope = (
  transaction: {
    kind: string
    accountId: string
    toAccountId?: string | null
    categoryId?: string | null
    excludeFromIncomeExpense?: boolean | null
  },
  scope: BudgetScope,
): boolean => {
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
