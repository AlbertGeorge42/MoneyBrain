import { addDays, type LocalDate } from '../date.js'
import { postingsOf } from '../ledger/postings.js'
import type { Minor } from '../money.js'
import {
  aggregateBalances,
  applyEventToBalances,
  balanceAtBucket,
  buildAccountDetail,
  type HistoricalBalanceSnapshot,
} from './balances.js'
import { coveredInRange, mergeFutureEvents } from './events.js'
import { addBalance, zeroBalance } from './sources.js'
import type {
  AssetProjectionPoint,
  ProjectionAccountRef,
  ProjectionBalance,
  ProjectionBucket,
  ProjectionEvents,
} from './types.js'

export interface AssetProjectionInput {
  asOf: LocalDate
  buckets: readonly ProjectionBucket[]
  /** API 已把 Prisma 账户与展示兜底映射成领域引用。 */
  accounts: readonly ProjectionAccountRef[]
  /** asOf 当日（含）的真实余额。 */
  baseBalances: ReadonlyMap<string, Minor>
  /** 历史桶真实余额，按「桶终点 + 1 天」索引；无历史桶时可传空 Map。 */
  historicalBalances: HistoricalBalanceSnapshot
  events: ProjectionEvents
}

export interface AssetProjectionOutput {
  base: ProjectionBalance
  points: AssetProjectionPoint[]
}

/**
 * 四粒度资产推演：
 * - 历史桶（桶末 ≤ asOf）：真实余额，planned / committed 为 0；
 * - 混合 / 未来桶：actual = asOf 真实余额，planned / committed 从 asOf+1 起逐事件累计；
 * - total = actual + planned + committed（后端合成，前端不相加）。
 *
 * plannedDelta / committedDelta / touchedAccounts 跨桶复用，产出的是**累计增量**，
 * 不是桶内增量；账户明细的 actual 用 asOf 起点余额。
 */
export function buildAssetProjection(input: AssetProjectionInput): AssetProjectionOutput {
  const { asOf, buckets, accounts, baseBalances, historicalBalances, events } = input
  const base = aggregateBalances(accounts, baseBalances)
  const futureEvents = mergeFutureEvents(events)

  let eventIndex = 0
  const plannedDelta = new Map<string, Minor>()
  const committedDelta = new Map<string, Minor>()
  const touchedAccounts = new Set<string>()

  const points: AssetProjectionPoint[] = buckets.map((bucket) => {
    if (bucket.end <= asOf) {
      const balances = balanceAtBucket(historicalBalances, addDays(bucket.end, 1), accounts)
      const actual = aggregateBalances(accounts, balances)
      const detail = buildAccountDetail(accounts, balances, new Map(), new Map(), new Set())
      return {
        granularity: bucket.granularity,
        label: bucket.label,
        start: bucket.start,
        end: bucket.end,
        date: bucket.end,
        actual,
        planned: zeroBalance(),
        committed: zeroBalance(),
        total: actual,
        covered: [],
        accounts: detail.accounts,
        categories: detail.categories,
      }
    }

    while (eventIndex < futureEvents.length && futureEvents[eventIndex]!.date <= bucket.end) {
      const event = futureEvents[eventIndex]!
      if (event.source === 'planned') applyEventToBalances(plannedDelta, event)
      else applyEventToBalances(committedDelta, event)
      // touchedAccounts 只关心账户分录；权益 / 分类分录不进入账户明细。
      for (const posting of postingsOf(event.ledger)) {
        if (posting.kind === 'account') touchedAccounts.add(posting.accountId)
      }
      eventIndex += 1
    }

    const planned = aggregateBalances(accounts, plannedDelta)
    const committed = aggregateBalances(accounts, committedDelta)
    const detail = buildAccountDetail(accounts, baseBalances, plannedDelta, committedDelta, touchedAccounts)
    return {
      granularity: bucket.granularity,
      label: bucket.label,
      start: bucket.start,
      end: bucket.end,
      date: bucket.end,
      actual: base,
      planned,
      committed,
      total: addBalance(base, addBalance(planned, committed)),
      covered: coveredInRange(events.covered, bucket.start, bucket.end),
      accounts: detail.accounts,
      categories: detail.categories,
    }
  })

  return { base, points }
}
