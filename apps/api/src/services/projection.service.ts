import type { Account } from '@prisma/client'
import type {
  AssetProjectionPoint,
  AssetProjectionResult,
  CashFlowProjectionPoint,
  CashFlowProjectionResult,
  ProjectionAccountValue,
  ProjectionBalance,
  ProjectionCategoryValue,
  ProjectionFlowValue,
  ProjectionGranularity,
} from '../../../../packages/contracts/types/index.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import type { AccountWithCategory } from '../db/repositories/account.repository.js'
import * as transactionCategoryRepo from '../db/repositories/transaction-category.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import {
  ZERO_MINOR,
  addDays,
  fromDate,
  minor,
  postingsOf,
  rulesFor,
  type LedgerTransaction,
  type LocalDate,
  type Minor,
} from '../../../../packages/domain/src/index.js'
import { calculateBalancesBatch } from './balance.service.js'
import { dayEnd, dayStart } from '../common/date.js'
import { toLedgerTransaction } from './ledger.adapter.js'
import { sumAssetsLiabilities } from './report/account-sum.js'
import {
  buildProjectionBuckets,
  type ProjectionBucket,
} from './report/bucket.js'
import { collectTransactions } from './report/cash-flow-collect.js'
import { aggregate } from './report/cash-flow-aggregate.js'
import { buildProjectionActivity, buildSankey } from './report/cash-flow-build.js'
import { PREDICTION_NOTE_DEFAULT } from './report/prediction.js'
import type {
  AccountInfo,
  CategoryInfo,
  PredictionTransaction,
} from './report/cash-flow-types.js'
import {
  coveredInRange,
  loadProjectionEvents,
  type ProjectionEvent,
} from './projection-events.js'

// ===== 四粒度桶（日 / ISO 周 / 自然月 / 自然年） =====

/** 请求窗口：from/to + granularity（唯一入口，默认窗口由路由层补齐）。 */
interface ProjectionQueryParams {
  asOf: LocalDate
  granularity: ProjectionGranularity
  from: LocalDate
  to: LocalDate
  includePlanned: boolean
  includeCommitted: boolean
}

// ===== 资产/负债 =====

function applyEventToBalances(balances: Map<string, number>, event: ProjectionEvent): void {
  for (const posting of postingsOf(event.ledger)) {
    if (posting.kind !== 'account') continue
    balances.set(posting.accountId, (balances.get(posting.accountId) ?? 0) + posting.amount)
  }
}

/**
 * 按账户类型汇总水平：与报表共用 sumAssetsLiabilities
 * （负债为正数欠款，净资产 = 资产 − 负债）。
 * 三个量都是 balances 的线性函数，因此组件可逐项相加。
 */
function aggregateBalances(accounts: Account[], balances: Map<string, number>): ProjectionBalance {
  return sumAssetsLiabilities(
    accounts.map((account) => ({ type: account.type, id: account.id })),
    (account) => minor(balances.get(account.id) ?? 0),
  )
}

function addBalance(a: ProjectionBalance, b: ProjectionBalance): ProjectionBalance {
  return {
    assets: minor(a.assets + b.assets),
    liabilities: minor(a.liabilities + b.liabilities),
    netWorth: minor(a.netWorth + b.netWorth),
  }
}

function zeroBalance(): ProjectionBalance {
  return { assets: minor(0), liabilities: minor(0), netWorth: minor(0) }
}

async function balancesAt(accounts: Account[], dateExclusive: LocalDate): Promise<Map<string, number>> {
  if (accounts.length === 0) return new Map()
  const target = dayStart(dateExclusive)
  const cache = await calculateBalancesBatch(accounts.map((account) => account.id), [target], accounts)
  return new Map(accounts.map((account) => [account.id, cache.get(account.id, target)]))
}

/** 账户对外展示值：资产取原值，负债取正数欠款（与资产负债表同一口径）。 */
function accountLevelValue(type: string, balance: number): Minor {
  return type === 'liability' ? minor(Math.abs(balance)) : minor(balance)
}

/** 账户变化量对外展示值：负债账户余额减少 = 欠款减少，所以要取负号。 */
function accountLevelDelta(type: string, delta: number): Minor {
  return type === 'liability' ? minor(-delta) : minor(delta)
}

/**
 * 把账户级余额/增量展开成「账户 → 一级分类」明细。
 * 负债账户的 committed / planned 是欠款变化量，total = actual + committed + planned。
 */
function buildAccountDetail(
  accounts: AccountWithCategory[],
  balances: Map<string, number>,
  plannedDelta: Map<string, number>,
  committedDelta: Map<string, number>,
  touchedAccounts: ReadonlySet<string>,
): { accounts: ProjectionAccountValue[]; categories: ProjectionCategoryValue[] } {
  const accountValues: ProjectionAccountValue[] = []
  for (const account of accounts) {
    const type = account.type
    if (type !== 'asset' && type !== 'liability') continue
    const actual = accountLevelValue(type, balances.get(account.id) ?? 0)
    const committed = accountLevelDelta(type, committedDelta.get(account.id) ?? 0)
    const planned = accountLevelDelta(type, plannedDelta.get(account.id) ?? 0)
    const isInvestment = account.category?.isInvestment ?? false
    accountValues.push({
      accountId: account.id,
      name: account.name,
      type,
      categoryId: account.category?.id ?? 'uncategorized',
      categoryName: account.category?.name ?? '未分类',
      isInvestment,
      actual,
      committed,
      planned,
      total: minor(actual + committed + planned),
      hasFutureEvents: touchedAccounts.has(account.id),
      valuationNote: isInvestment ? 'transfer_schedule_only' : null,
    })
  }

  const categoryMap = new Map<string, ProjectionCategoryValue>()
  for (const value of accountValues) {
    const account = accounts.find((item) => item.id === value.accountId)!
    const key = `${value.type}:${value.categoryId}`
    const existing = categoryMap.get(key)
    if (existing) {
      existing.actual = minor(existing.actual + value.actual)
      existing.committed = minor(existing.committed + value.committed)
      existing.planned = minor(existing.planned + value.planned)
      existing.total = minor(existing.total + value.total)
    } else {
      categoryMap.set(key, {
        categoryId: value.categoryId,
        name: value.categoryName,
        type: value.type,
        sort: account.category?.sort ?? Number.MAX_SAFE_INTEGER,
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
 * 四粒度资产推演。
 * - 历史桶（桶末 ≤ asOf）：真实余额（date < 桶末+1），planned/committed 为 0；
 * - 混合/未来桶：actual = asOf 真实余额，planned/committed 从 asOf+1 起逐事件累计；
 * - total = actual + planned + committed（后端合成，前端不相加）。
 */
async function assetProjectionRange(
  params: ProjectionQueryParams,
  buckets: ProjectionBucket[],
): Promise<AssetProjectionResult> {
  const accounts = await accountRepo.findMany({ include: { category: true } })
  const baseBalances = await balancesAt(accounts, addDays(params.asOf, 1))
  const base = aggregateBalances(accounts, baseBalances)

  const events = await loadProjectionEvents({
    asOf: params.asOf,
    windowEndExclusive: buckets[buckets.length - 1]!.endExclusive,
    includePlanned: params.includePlanned,
    includeCommitted: params.includeCommitted,
  })

  // 历史桶一次批量取真实余额；混合/未来桶沿用 asOf 起点累计。
  const historicalBuckets = buckets.filter((bucket) => bucket.end <= params.asOf)
  const historicalCache = historicalBuckets.length === 0 || accounts.length === 0
    ? null
    : await calculateBalancesBatch(
      accounts.map((account) => account.id),
      historicalBuckets.map((bucket) => dayStart(addDays(bucket.end, 1))),
      accounts,
    )

  const futureEvents = [...events.planned, ...events.committed]
    .sort((left, right) => left.date.localeCompare(right.date))
  let eventIndex = 0
  const plannedDelta = new Map<string, number>()
  const committedDelta = new Map<string, number>()
  const touchedAccounts = new Set<string>()

  const points: AssetProjectionPoint[] = buckets.map((bucket) => {
    if (bucket.end <= params.asOf) {
      const target = dayStart(addDays(bucket.end, 1))
      const balances = new Map(
        accounts.map((account) => [account.id, historicalCache?.get(account.id, target) ?? 0]),
      )
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

  return {
    asOf: params.asOf,
    granularity: params.granularity,
    start: buckets[0]!.start,
    end: buckets[buckets.length - 1]!.end,
    bucketCount: buckets.length,
    base,
    points,
  }
}

export async function getAssetProjection(params: ProjectionQueryParams): Promise<AssetProjectionResult> {
  const buckets = buildProjectionBuckets(params.asOf, params.granularity, params.from, params.to)
  return assetProjectionRange(params, buckets)
}

// ===== 现金流 =====

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
 * 一笔交易对现金集合的流入/流出。
 *
 * 与余额共用同一份复式分录：账户分录的正数计流入、负数计流出，
 * 因此所有来源的 `流入 − 流出` 恒等于该交易对现金余额的净影响。
 * 现金账户之间的互转本金不构成流入/流出，只把手续费计作流出。
 */
function cashFlowOf(ledger: LedgerTransaction, cashAccountIds: ReadonlySet<string>): { inflow: Minor; outflow: Minor } {
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

  let inflow = 0
  let outflow = 0
  for (const posting of postingsOf(ledger)) {
    if (posting.kind !== 'account' || !cashAccountIds.has(posting.accountId)) continue
    if (posting.amount > 0) inflow += posting.amount
    else if (posting.amount < 0) outflow -= posting.amount
  }
  return { inflow: minor(inflow), outflow: minor(outflow) }
}

function flowValue(actual: Minor, planned: Minor, committed: Minor): ProjectionFlowValue {
  return {
    actual,
    planned,
    committed,
    total: minor(actual + planned + committed),
  }
}

function cashBalanceTotal(balances: Map<string, number>): Minor {
  return minor([...balances.values()].reduce((sum, value) => sum + value, 0))
}

/**
 * 四粒度现金流推演。
 * - 历史桶：真实交易逐日求和，期初取桶起点真实余额；
 * - 混合桶：actual 到 asOf 为止，planned/committed 从 asOf+1 起；
 * - 未来桶：期初 = 上一桶期末，必要时先滚入 asOf+1 至桶起点前的计划/已排定净额。
 */
async function cashFlowProjectionRange(
  params: ProjectionQueryParams,
  buckets: ProjectionBucket[],
): Promise<CashFlowProjectionResult> {
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
  const actualEvents = actualRows.map((row) => ({
    date: fromDate(row.date),
    flow: cashFlowOf(toLedgerTransaction(row), cashSet),
  }))
  let actualIndex = 0

  const futureEvents = [...events.planned, ...events.committed]
    .sort((left, right) => left.date.localeCompare(right.date))
  let eventIndex = 0

  let startCash: Minor
  if (firstBucket.start <= params.asOf) {
    const startBalances = await balancesAt(cashAccounts, firstBucket.start)
    startCash = cashBalanceTotal(startBalances)
  } else {
    // 首个桶在 asOf 之后：先取 asOf+1 真实余额，再滚入桶起点前的计划/已排定净额。
    const baseBalances = await balancesAt(cashAccounts, asOfTarget)
    let preNet = 0
    const preEnd = addDays(firstBucket.start, -1)
    while (eventIndex < futureEvents.length && futureEvents[eventIndex]!.date <= preEnd) {
      const flow = cashFlowOf(futureEvents[eventIndex]!.ledger, cashSet)
      preNet += flow.inflow - flow.outflow
      eventIndex += 1
    }
    startCash = minor(cashBalanceTotal(baseBalances) + preNet)
  }

  let runningCash = startCash
  const points: CashFlowProjectionPoint[] = buckets.map((bucket) => {
    let actualInflow = 0
    let actualOutflow = 0
    while (actualIndex < actualEvents.length && actualEvents[actualIndex]!.date <= bucket.end) {
      const item = actualEvents[actualIndex]!
      actualInflow += item.flow.inflow
      actualOutflow += item.flow.outflow
      actualIndex += 1
    }

    let plannedInflow = 0
    let plannedOutflow = 0
    let committedInflow = 0
    let committedOutflow = 0
    while (eventIndex < futureEvents.length && futureEvents[eventIndex]!.date <= bucket.end) {
      const event = futureEvents[eventIndex]!
      const flow = cashFlowOf(event.ledger, cashSet)
      if (event.source === 'planned') {
        plannedInflow += flow.inflow
        plannedOutflow += flow.outflow
      } else {
        committedInflow += flow.inflow
        committedOutflow += flow.outflow
      }
      eventIndex += 1
    }

    const inflow = flowValue(minor(actualInflow), minor(plannedInflow), minor(committedInflow))
    const outflow = flowValue(minor(actualOutflow), minor(plannedOutflow), minor(committedOutflow))
    const net = flowValue(
      minor(inflow.actual - outflow.actual),
      minor(inflow.planned - outflow.planned),
      minor(inflow.committed - outflow.committed),
    )

    const start = runningCash
    const endCash = minor(start + net.total)
    runningCash = endCash

    return {
      granularity: bucket.granularity,
      label: bucket.label,
      start: bucket.start,
      end: bucket.end,
      date: bucket.end,
      inflow,
      outflow,
      net,
      startCash: start,
      endCash,
      covered: coveredInRange(events.covered, bucket.start, bucket.end),
    }
  })

  const windowStart = buckets[0]!.start
  const windowEnd = buckets[buckets.length - 1]!.end
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
  const sankey = buildSankey({
    transactions: actualRows,
    predictions: [...windowCommitted.map(toPrediction), ...windowPlanned.map(toPrediction)],
    cashAccountIds: cashIds,
    categoryMap,
    accountMap,
    start: dayStart(windowStart),
    end: dayEnd(windowEnd),
  })

  const sumFlow = (field: 'inflow' | 'outflow' | 'net'): ProjectionFlowValue =>
    points.reduce(
      (acc, point) => ({
        actual: minor(acc.actual + point[field].actual),
        planned: minor(acc.planned + point[field].planned),
        committed: minor(acc.committed + point[field].committed),
        total: minor(acc.total + point[field].total),
      }),
      { actual: ZERO_MINOR, planned: ZERO_MINOR, committed: ZERO_MINOR, total: ZERO_MINOR },
    )

  return {
    asOf: params.asOf,
    granularity: params.granularity,
    start: windowStart,
    end: windowEnd,
    bucketCount: buckets.length,
    startCash: points[0]!.startCash,
    endCash: points[points.length - 1]!.endCash,
    cashInflow: sumFlow('inflow'),
    cashOutflow: sumFlow('outflow'),
    netCashFlow: sumFlow('net'),
    byActivity,
    sankey,
    covered: coveredInRange(events.covered, windowStart, windowEnd),
    predictionNote: windowPlanned.length > 0 || windowCommitted.length > 0
      ? PREDICTION_NOTE_DEFAULT
      : undefined,
    points,
  }
}

export async function getCashFlowProjection(params: ProjectionQueryParams): Promise<CashFlowProjectionResult> {
  const buckets = buildProjectionBuckets(params.asOf, params.granularity, params.from, params.to)
  return cashFlowProjectionRange(params, buckets)
}
