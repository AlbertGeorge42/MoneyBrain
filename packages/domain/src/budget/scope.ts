import { matchesBudgetScope, scopeQuery, type BudgetScope } from '../ledger/rules.js'
import type { BudgetScopedRow } from './types.js'

/**
 * 预算口径的计入符号：+1 主类型、−1 冲减退款、0 不计入。
 *
 * 账户、分类与「不计收支」由各交易自己版本的口径规则判定（与 SQL 侧同一份规则）；
 * 用量与下钻明细共用这一处判定，因此「下钻条数与合计 == 预算用量」恒成立。
 */
export function budgetContributionSign(row: BudgetScopedRow, scope: BudgetScope): 1 | -1 | 0 {

  const inScope = matchesBudgetScope(
    {
      kind: row.type,
      accountId: row.accountId,
      toAccountId: row.toAccountId,
      categoryId: row.categoryId,
      excludeFromIncomeExpense: row.excludeFromIncomeExpense,
    },
    scope,
  )
  if (!inScope) return 0

  const query = scopeQuery(scope)
  if (row.type === query.type) return 1
  // 退款冲减按退款自身的账户与分类
  if (query.countsRefunds && row.type === 'refund' && row.relatedType === query.refundRelatedType) return -1
  return 0
}
