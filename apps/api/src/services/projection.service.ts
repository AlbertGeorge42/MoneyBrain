import type { Account } from '@prisma/client'
import type {
  AssetProjectionResult,
  CashFlowProjectionResult,
  ProjectionGranularity,
} from '../../../../packages/contracts/types/index.js'
import { toMinor } from '../common/index.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as transactionCategoryRepo from '../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import {
  addDays,
  aggregate,
  buildAssetProjection,
  buildCashFlowProjection,
  buildProjectionActivity,
  buildSankey,
  fromDate,
  type HistoricalBalanceSnapshot,
  type LocalDate,
  type Minor,
  type ProjectionAccountRef,
  type ProjectionEvent,
} from '../../../../packages/domain/src/index.js'
import { calculateBalancesBatch, type BalanceCache } from './balance.service.js'
import { dayEnd, dayStart } from '../common/date.js'
import { toLedgerTransaction } from './ledger.adapter.js'
import { buildProjectionBuckets } from './report/bucket.js'
import { collectSankeySources, collectTransactions } from './report/cash-flow-collect.js'
import { PREDICTION_NOTE_DEFAULT } from './report/prediction-source.js'
import type {
  AccountInfo,
  CategoryInfo,
  PredictionTransaction,
} from './report/cash-flow-types.js'
import { loadProjectionEvents } from './projection-events.js'

/** 请求窗口：from/to + granularity（唯一入口，默认窗口由路由层补齐）。 */
interface ProjectionQueryParams {
  asOf: LocalDate
  granularity: ProjectionGranularity
  from: LocalDate
  to: LocalDate
  includePlanned: boolean
  includeCommitted: boolean
}

/** Prisma 账户 → 领域引用（展示兜底留在 API 边界）。 */
function toAccountRefs(accounts: { id: string; name: string; type: string; category?: { id: string; name: string; isInvestment: boolean; sort: number } | null }[]): ProjectionAccountRef[] {
  return accounts.map((account) => ({
    id: account.id,
    name: account.name,
    type: account.type,
    categoryId: account.category?.id ?? 'uncategorized',
    categoryName: account.category?.name ?? '未分类',
    isInvestment: account.category?.isInvestment ?? false,
    sort: account.category?.sort ?? Number.MAX_SAFE_INTEGER,
  }))
}

/** BalanceCache 的结果 → 整数分余额 Map。 */
function toMinorBalances(accounts: Account[], cache: BalanceCache, target: Date): Map<string, Minor> {
  return new Map(accounts.map((account) => [account.id, toMinor(cache.get(account.id, target))]))
}

/**
 * 四粒度资产推演：API 只取数、组装领域输入，计算全部交给 Domain。
 */
async function assetProjectionRange(params: ProjectionQueryParams): Promise<AssetProjectionResult> {
  const buckets = buildProjectionBuckets(params.asOf, params.granularity, params.from, params.to)
  const accountRows = await accountRepo.findMany({ include: { category: true } })
  const accounts = toAccountRefs(accountRows)

  const baseCache = await calculateBalancesBatch(
    accountRows.map((account) => account.id),
    [dayStart(addDays(params.asOf, 1))],
    accountRows,
  )
  const baseBalances = toMinorBalances(accountRows, baseCache, dayStart(addDays(params.asOf, 1)))

  const events = await loadProjectionEvents({
    asOf: params.asOf,
    windowEndExclusive: buckets[buckets.length - 1]!.endExclusive,
    includePlanned: params.includePlanned,
    includeCommitted: params.includeCommitted,
  })

  // 历史桶一次批量取真实余额；混合 / 未来桶沿用 asOf 起点累计。
  const historicalBuckets = buckets.filter((bucket) => bucket.end <= params.asOf)
  const historicalTargets = historicalBuckets.map((bucket) => dayStart(addDays(bucket.end, 1)))
  const historicalCache = historicalBuckets.length === 0 || accountRows.length === 0
    ? null
    : await calculateBalancesBatch(accountRows.map((account) => account.id), historicalTargets, accountRows)

  const historicalBalances: HistoricalBalanceSnapshot = new Map(
    historicalBuckets.map((bucket, index) => {
      const target = historicalTargets[index]!
      return [addDays(bucket.end, 1), toMinorBalances(accountRows, historicalCache!, target)]
    }),
  )

  const result = buildAssetProjection({
    asOf: params.asOf,
    buckets,
    accounts,
    baseBalances,
    historicalBalances,
    events,
  })

  return {
    asOf: params.asOf,
    granularity: params.granularity,
    start: buckets[0]!.start,
    end: buckets[buckets.length - 1]!.end,
    bucketCount: buckets.length,
    base: result.base,
    points: result.points,
  }
}

export async function getAssetProjection(params: ProjectionQueryParams): Promise<AssetProjectionResult> {
  return assetProjectionRange(params)
}

/** 现金等价账户（与现金流报表同一份账户分类口径）。 */
async function loadCashAccounts(): Promise<Account[]> {
  const categories = await accountCategoryRepo.findMany({
    where: { isCashEquivalent: true },
    select: { id: true },
  })
  if (categories.length === 0) return []
  return accountRepo.findMany({
    where: { categoryId: { in: categories.map((category) => category.id) } },
  })
}

/**
 * 四粒度现金流推演：API 只取数、组装领域输入与报表图表，点位计算交给 Domain。
 */
async function cashFlowProjectionRange(params: ProjectionQueryParams): Promise<CashFlowProjectionResult> {
  const buckets = buildProjectionBuckets(params.asOf, params.granularity, params.from, params.to)
  const firstBucket = buckets[0]!
  const lastBucket = buckets[buckets.length - 1]!
  const cashAccounts = await loadCashAccounts()
  const cashIds = cashAccounts.map((account) => account.id)
  const cashSet = new Set(cashIds)

  const events = await loadProjectionEvents({
    asOf: params.asOf,
    windowEndExclusive: lastBucket.endExclusive,
    includePlanned: params.includePlanned,
    includeCommitted: params.includeCommitted,
  })

  // 真实交易只取到 asOf（含）；未来日期交易走 committed，避免双计。
  const asOfTarget = addDays(params.asOf, 1)
  const lastTarget = addDays(lastBucket.end, 1)
  const actualEndExclusive = lastTarget <= asOfTarget ? lastTarget : asOfTarget
  const actualRows = cashIds.length > 0 && firstBucket.start < actualEndExclusive
    ? await transactionRepo.findActive(
      {
        OR: [
          { accountId: { in: cashIds } },
          { toAccountId: { in: cashIds } },
        ],
        date: {
          gte: dayStart(firstBucket.start),
          lt: dayStart(actualEndExclusive),
        },
      },
      {
        orderBy: { date: 'asc' },
        include: { account: true, toAccount: true, category: true },
      },
    )
    : []

  const actualTransactions = actualRows.map((row) => ({
    date: fromDate(row.date),
    ledger: toLedgerTransaction(row),
  }))

  // 期初余额：首桶起点 ≤ asOf 取该日真实余额，否则取 asOf+1 真实余额
  // （桶起点前的计划 / 已排定净额由 Domain 滚入）。
  const openingDate = firstBucket.start <= params.asOf ? firstBucket.start : asOfTarget
  const openingCache = await calculateBalancesBatch(cashIds, [dayStart(openingDate)], cashAccounts)
  const openingBalances = toMinorBalances(cashAccounts, openingCache, dayStart(openingDate))

  const result = buildCashFlowProjection({
    asOf: params.asOf,
    buckets,
    cashAccountIds: cashSet,
    actualTransactions,
    openingBalances,
    events,
  })

  const windowStart = firstBucket.start
  const windowEnd = lastBucket.end
  const windowPlanned = events.planned.filter(
    (event) => event.date >= windowStart && event.date <= windowEnd,
  )
  const windowCommitted = events.committed.filter(
    (event) => event.date >= windowStart && event.date <= windowEnd,
  )

  let categoryMap = new Map<string, CategoryInfo>()
  let accountMap = new Map<string, AccountInfo>()
  if (windowPlanned.length > 0 || windowCommitted.length > 0) {
    const categories = await transactionCategoryRepo.findMany({ include: { parent: true } })
    categoryMap = new Map(categories.map((category) => [category.id, {
      cashFlowType: category.cashFlowType,
      name: category.name,
      parentId: category.parentId,
      level: category.parentId ? 2 : 1,
    }]))
    const allAccounts = await accountRepo.findMany({})
    accountMap = new Map(allAccounts.map((account) => [account.id, { name: account.name }]))
  }

  const toPrediction = (event: ProjectionEvent): PredictionTransaction => ({
    date: dayStart(event.date),
    type: event.ledger.kind,
    amount: event.ledger.amount,
    note: null,
    accountId: event.ledger.accountId ?? null,
    toAccountId: event.ledger.toAccountId ?? null,
    categoryId: event.ledger.categoryId ?? null,
    budgetId: event.source === 'planned' ? event.occurrence.budgetId : event.transactionId,
    budgetName: event.source === 'planned' ? event.occurrence.budgetName : '已排定',
  })

  const collectParams = {
    cashAccountIds: cashIds,
    categoryMap,
    accountMap,
    start: dayStart(windowStart),
    end: dayEnd(windowEnd),
  }
  const actualItems = collectTransactions({ ...collectParams, transactions: actualRows, predictions: [] }).actualItems
  const committedItems = collectTransactions({
    ...collectParams,
    transactions: [],
    predictions: windowCommitted.map(toPrediction),
  }).predictedItems
  const plannedItems = collectTransactions({
    ...collectParams,
    transactions: [],
    predictions: windowPlanned.map(toPrediction),
  }).predictedItems

  const byActivity = buildProjectionActivity(
    aggregate(actualItems),
    aggregate(committedItems),
    aggregate(plannedItems),
  )
  const sankey = buildSankey(collectSankeySources({
    transactions: actualRows,
    predictions: [...windowCommitted.map(toPrediction), ...windowPlanned.map(toPrediction)],
    cashAccountIds: cashIds,
    categoryMap,
    accountMap,
    start: dayStart(windowStart),
    end: dayEnd(windowEnd),
  }))

  return {
    asOf: params.asOf,
    granularity: params.granularity,
    start: windowStart,
    end: windowEnd,
    bucketCount: buckets.length,
    startCash: result.startCash,
    endCash: result.endCash,
    cashInflow: result.cashInflow,
    cashOutflow: result.cashOutflow,
    netCashFlow: result.netCashFlow,
    byActivity,
    sankey,
    covered: result.covered,
    predictionNote: windowPlanned.length > 0 || windowCommitted.length > 0
      ? PREDICTION_NOTE_DEFAULT
      : undefined,
    points: result.points,
  }
}

export async function getCashFlowProjection(params: ProjectionQueryParams): Promise<CashFlowProjectionResult> {
  return cashFlowProjectionRange(params)
}
