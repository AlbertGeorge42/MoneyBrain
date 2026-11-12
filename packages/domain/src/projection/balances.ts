import { ZERO_MINOR, abs, add, neg, sum, type Minor } from '../money.js'
import { postingsOf } from '../ledger/postings.js'
import { rulesFor } from '../ledger/rules.js'
import type { LedgerTransaction } from '../ledger/types.js'
import type { LocalDate } from '../date.js'
import { sumAssetsLiabilities } from '../statements/aggregates.js'
import type {
  ProjectionAccountRef,
  ProjectionAccountValue,
  ProjectionBalance,
  ProjectionCategoryValue,
  ProjectionEvent,
} from './types.js'

/** 把一笔复式分录的账户分量累加进余额 Map。 */
export function applyEventToBalances(balances: Map<string, Minor>, event: ProjectionEvent): void {
  for (const posting of postingsOf(event.ledger)) {
    if (posting.kind !== 'account') continue
    balances.set(posting.accountId, add(balances.get(posting.accountId) ?? ZERO_MINOR, posting.amount))
  }
}

/** 按账户类型汇总水平（负债为正数欠款，净资产 = 资产 − 负债）。 */
export function aggregateBalances(
  accounts: readonly ProjectionAccountRef[],
  balances: ReadonlyMap<string, Minor>,
): ProjectionBalance {
  return sumAssetsLiabilities(accounts, (account) => balances.get(account.id) ?? ZERO_MINOR)
}

/** 账户对外展示值：资产取原值，负债取正数欠款（与资产负债表同一口径）。 */
function accountLevelValue(type: string, balance: Minor): Minor {
  return type === 'liability' ? abs(balance) : balance
}

/** 账户变化量对外展示值：负债账户余额减少 = 欠款减少，取负号。 */
function accountLevelDelta(type: string, delta: Minor): Minor {
  return type === 'liability' ? neg(delta) : delta
}

/**
 * 把账户级余额/增量展开成「账户 → 一级分类」明细。
 * 负债账户的 committed / planned 是欠款变化量，total = actual + committed + planned。
 */
export function buildAccountDetail(
  accounts: readonly ProjectionAccountRef[],
  balances: ReadonlyMap<string, Minor>,
  plannedDelta: ReadonlyMap<string, Minor>,
  committedDelta: ReadonlyMap<string, Minor>,
  touchedAccounts: ReadonlySet<string>,
): { accounts: ProjectionAccountValue[]; categories: ProjectionCategoryValue[] } {
  const accountValues: ProjectionAccountValue[] = []
  for (const account of accounts) {
    const type = account.type
    if (type !== 'asset' && type !== 'liability') continue
    const actual = accountLevelValue(type, balances.get(account.id) ?? ZERO_MINOR)
    const committed = accountLevelDelta(type, committedDelta.get(account.id) ?? ZERO_MINOR)
    const planned = accountLevelDelta(type, plannedDelta.get(account.id) ?? ZERO_MINOR)
    accountValues.push({
      accountId: account.id,
      name: account.name,
      type,
      categoryId: account.categoryId,
      categoryName: account.categoryName,
      isInvestment: account.isInvestment,
      actual,
      committed,
      planned,
      total: sum([actual, committed, planned]),
      hasFutureEvents: touchedAccounts.has(account.id),
      valuationNote: account.isInvestment ? 'transfer_schedule_only' : null,
    })
  }

  const categoryMap = new Map<string, ProjectionCategoryValue>()
  for (const value of accountValues) {
    const account = accounts.find((item) => item.id === value.accountId)!
    const key = `${value.type}:${value.categoryId}`
    const existing = categoryMap.get(key)
    if (existing) {
      existing.actual = add(existing.actual, value.actual)
      existing.committed = add(existing.committed, value.committed)
      existing.planned = add(existing.planned, value.planned)
      existing.total = add(existing.total, value.total)
    } else {
      categoryMap.set(key, {
        categoryId: value.categoryId,
        name: value.categoryName,
        type: value.type,
        sort: account.sort,
        actual: value.actual,
        committed: value.committed,
        planned: value.planned,
        total: value.total,
      })
    }
  }

  const categories = [...categoryMap.values()].sort((left, right) => {
    if (left.sort !== right.sort) return left.sort - right.sort
    return left.name.localeCompare(right.name)
  })
  return { accounts: accountValues, categories }
}

/**
 * 一笔交易对现金集合的流入/流出。
 * 与余额共用同一份复式分录：账户分录正数计流入、负数计流出，
 * 因此「流入 − 流出」恒等于该交易对现金余额的净影响。
 * 现金账户之间的互转本金不构成流入/流出，只把手续费计作流出。
 */
export function cashFlowOf(
  ledger: LedgerTransaction,
  cashAccountIds: ReadonlySet<string>,
): { inflow: Minor; outflow: Minor } {
  if (
    ledger.kind === 'transfer'
    && ledger.toAccountId
    && cashAccountIds.has(ledger.accountId)
    && cashAccountIds.has(ledger.toAccountId)
  ) {
    return {
      inflow: ZERO_MINOR,
      outflow: rulesFor(ledger.ruleVersion).effectiveTransferFee(ledger.fee, ledger.coupon),
    }
  }

  const cashPostings = postingsOf(ledger).filter(
    (posting) => posting.kind === 'account' && cashAccountIds.has(posting.accountId),
  )
  const inflow = sum(cashPostings.filter((posting) => posting.amount > 0).map((posting) => posting.amount))
  const outflow = neg(sum(cashPostings.filter((posting) => posting.amount < 0).map((posting) => posting.amount)))
  return { inflow, outflow }
}

/** 现金集合的余额合计。 */
export function cashBalanceTotal(balances: ReadonlyMap<string, Minor>): Minor {
  return sum([...balances.values()])
}

/** 历史桶余额快照：按桶终点索引，供资产推演取真实余额。 */
export type HistoricalBalanceSnapshot = ReadonlyMap<string, ReadonlyMap<string, Minor>>

/** 从快照里取某个桶的余额；缺快照时全为 0（与旧实现 `?? 0` 一致）。 */
export function balanceAtBucket(
  snapshot: HistoricalBalanceSnapshot,
  bucketEnd: LocalDate,
  accounts: readonly ProjectionAccountRef[],
): Map<string, Minor> {
  const source = snapshot.get(bucketEnd)
  return new Map(accounts.map((account) => [account.id, source?.get(account.id) ?? ZERO_MINOR]))
}
