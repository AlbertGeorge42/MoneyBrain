import { postingsOf } from '../ledger/postings.js'
import type { LedgerTransaction } from '../ledger/types.js'
import { ZERO_MINOR, add, type Minor } from '../money.js'

/**
 * 预算预测点位的领域输入：API 把预算展开结果转成复式分录交易后传入。
 * time 为 `Date.getTime()`，用于时点比较（闭区间含等号）。
 */
export interface PredictedEvent {
  time: number
  ledger: LedgerTransaction
}

interface AccountTypeLookup {
  get(id: string): { type: string } | undefined
}

/**
 * 预算点位 → 每账户余额变化。
 *
 * 与推演链路共用 `postingsOf` 这一套解释引擎，不再手写 income/expense/transfer 符号表：
 * 预算点位 fee / coupon 恒为 0，income = +amount、expense = −amount、
 * transfer = −amount / +amount，与基础报表 predicted 字段的既有口径数值一致。
 */
export function accumulatePredictedChanges(events: readonly PredictedEvent[]): Map<string, Minor> {
  const changes = new Map<string, Minor>()
  for (const event of events) {
    for (const posting of postingsOf(event.ledger)) {
      if (posting.kind !== 'account') continue
      changes.set(posting.accountId, add(changes.get(posting.accountId) ?? ZERO_MINOR, posting.amount))
    }
  }
  return changes
}

/** 按账户类型汇总资产 / 负债的余额变化（负债尚未取负，由报表负责对外符号）。 */
export function sumPredictedByType(
  changes: ReadonlyMap<string, Minor>,
  accountLookup: AccountTypeLookup,
): { assetChange: Minor; liabilityChange: Minor } {
  let assetChange = ZERO_MINOR
  let liabilityChange = ZERO_MINOR
  for (const [accountId, change] of changes) {
    const type = accountLookup.get(accountId)?.type
    if (type === 'asset') assetChange = add(assetChange, change)
    else if (type === 'liability') liabilityChange = add(liabilityChange, change)
  }
  return { assetChange, liabilityChange }
}

/**
 * 指定时点（含）之前、指定账户集合内的预测余额变动。
 * 集合内的转账两笔分录自然相消；时点口径与余额批量查询的 `-1ms` 对齐由 API 负责。
 */
export function predictedAccountTotal(
  events: readonly PredictedEvent[],
  timePoint: number,
  accountIds: ReadonlySet<string>,
): Minor {
  let total = ZERO_MINOR
  for (const event of events) {
    if (event.time > timePoint) continue
    for (const posting of postingsOf(event.ledger)) {
      if (posting.kind !== 'account' || !accountIds.has(posting.accountId)) continue
      total = add(total, posting.amount)
    }
  }
  return total
}
