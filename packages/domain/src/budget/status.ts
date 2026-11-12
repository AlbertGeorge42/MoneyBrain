import type { BudgetScope } from '../ledger/rules.js'
import { add, max, neg, sub, ZERO_MINOR, type Minor } from '../money.js'
import { budgetContributionSign } from './scope.js'
import type {
  BudgetStatusInput,
  BudgetStatusResult,
  BudgetUsageContribution,
  BudgetUsageRow,
  BudgetUsageSummary,
} from './types.js'

/** 按预算口径从聚合行里算出已用、剩余与百分比。 */
export function computeBudgetStatus(
  input: BudgetStatusInput,
  rows: readonly BudgetUsageRow[],
): BudgetStatusResult {
  let used: Minor = ZERO_MINOR

  for (const row of rows) {
    const sign = budgetContributionSign(row, input.scope)
    if (sign === 0) continue
    used = sign > 0 ? add(used, row.amount) : sub(used, row.amount)
  }

  // 跨期退款会让本期已用为负；下限夹到 0，剩余不得超过额度
  const clamped = max(used, ZERO_MINOR)
  const amount = input.amount
  // 使用率返回真实百分比，超支时 >100 不截断；进度条条宽由展示层自行封顶
  const percentage = amount === 0 ? 0 : Math.round((clamped / amount) * 100)

  return {
    used: clamped,
    remaining: max(sub(amount, clamped), ZERO_MINOR),
    percentage,
    isOverBudget: clamped > amount,
  }
}

/**
 * 下钻明细：与预算用量同源的符号金额、合计与夹零后的已用。
 * 调用方只负责把 index 映射回原始交易对象，不参与金额计算。
 */
export function summarizeBudgetUsage(
  rows: readonly BudgetUsageRow[],
  scope: BudgetScope,
): BudgetUsageSummary {
  const contributions: BudgetUsageContribution[] = []
  let total: Minor = ZERO_MINOR

  rows.forEach((row, index) => {
    const sign = budgetContributionSign(row, scope)
    if (sign === 0) return
    const signedAmount = sign > 0 ? row.amount : neg(row.amount)
    contributions.push({ index, signedAmount })
    total = add(total, signedAmount)
  })

  return {
    contributions,
    count: contributions.length,
    total,
    used: max(total, ZERO_MINOR),
  }
}
