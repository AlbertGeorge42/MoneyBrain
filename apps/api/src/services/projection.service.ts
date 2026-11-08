import type { Account } from '@prisma/client'
import type {
  AssetProjectionPoint,
  AssetProjectionResult,
  CashFlowProjectionPoint,
  CashFlowProjectionResult,
  ProjectionBalance,
  ProjectionCoveredOccurrence,
  ProjectionFlowValue,
  ProjectionGranularity,
  ProjectionWindowMonths,
} from '../../../../packages/contracts/types/index.js'
import { AppError, ValidationError } from '../common/error.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import {
  CURRENT_RULE_VERSION,
  ZERO_MINOR,
  addDays,
  addMonths,
  fromDate,
  isoWeekLabel,
  minor,
  postingsOf,
  rulesFor,
  startOfMonth,
  startOfNextMonth,
  startOfNextYear,
  startOfWeek,
  startOfYear,
  type LedgerTransaction,
  type LocalDate,
  type Minor,
} from '../../../../packages/domain/src/index.js'
import { calculateBalancesBatch } from './balance.service.js'
import { generatePredictedOccurrences } from './budget.service.js'
import { toLedgerTransaction } from './ledger.adapter.js'
import { sumAssetsLiabilities } from './report/account-sum.js'

// ===== 窗口 =====

interface ProjectionWindow {
  label: string
  start: LocalDate
  /** 下月 1 日（不含）。 */
  endExclusive: LocalDate
  /** 该月最后一个日历日（含）。 */
  end: LocalDate
}

function monthIndex(value: LocalDate): number {
  const [year, month] = value.split('-').map(Number) as [number, number]
  return year * 12 + (month - 1)
}

interface ProjectionWindowPlan {
  /** 从 asOf 所在月起的全部累计窗口（用于累计 planned/committed 与现金流）。 */
  all: ProjectionWindow[]
  /** 实际输出的窗口（从 fromMonth 起）。 */
  output: ProjectionWindow[]
  /** 累计窗口相对输出窗口的前置数量。 */
  skip: number
}

/**
 * 从 asOf 所在自然月起累计；只输出 fromMonth 起的连续 months 个自然月。
 *
 * 累计起点始终是 asOf 所在月，不是 fromMonth：否则 fromMonth 之前发生的
 * planned/committed 会被漏掉，导致净资产与现金期末值偏小。
 */
function projectionWindows(
  asOf: LocalDate,
  fromMonth: string | undefined,
  months: ProjectionWindowMonths,
): ProjectionWindowPlan {
  const asOfMonthStart = startOfMonth(asOf)
  const outputStart = fromMonth ? startOfMonth(`${fromMonth}-01` as LocalDate) : asOfMonthStart
  const skip = monthIndex(outputStart) - monthIndex(asOfMonthStart)
  if (skip < 0) {
    throw new ValidationError('fromMonth 不能早于 asOf 所在月')
  }
  // 未来窗口上限：输出末月不能超过 asOf 所在月之后的第 12 个自然月。
  if (skip + months - 1 > 12) {
    throw new ValidationError('推演窗口最多 12 个未来月')
  }

  const all: ProjectionWindow[] = []
  let start = asOfMonthStart
  for (let i = 0; i < skip + months; i++) {
    const endExclusive = startOfNextMonth(start)
    all.push({
      label: start.slice(0, 7),
      start,
      endExclusive,
      end: addDays(endExclusive, -1),
    })
    start = endExclusive
  }

  return { all, output: all.slice(skip), skip }
}

function toLocalDateDate(value: LocalDate): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

// ===== 四粒度桶（日 / ISO 周 / 自然月 / 自然年） =====

interface ProjectionBucket {
  granularity: ProjectionGranularity
  label: string
  /** 桶起点（含）。 */
  start: LocalDate
  /** 桶终点（含），点位的 date 即此值。 */
  end: LocalDate
  endExclusive: LocalDate
}

/** 请求窗口：from/to + granularity；不传时走旧的 fromMonth/months。 */
interface ProjectionQueryParams {
  asOf: LocalDate
  granularity: ProjectionGranularity
  from?: LocalDate
  to?: LocalDate
  fromMonth?: string
  months: ProjectionWindowMonths
  includePlanned: boolean
  includeCommitted: boolean
}

function bucketStartOf(granularity: ProjectionGranularity, value: LocalDate): LocalDate {
  switch (granularity) {
    case 'day':
      return value
    case 'week':
      return startOfWeek(value)
    case 'month':
      return startOfMonth(value)
    case 'year':
      return startOfYear(value)
  }
}

function nextBucketStart(granularity: ProjectionGranularity, start: LocalDate): LocalDate {
  switch (granularity) {
    case 'day':
      return addDays(start, 1)
    case 'week':
      return addDays(start, 7)
    case 'month':
      return startOfNextMonth(start)
    case 'year':
      return startOfNextYear(start)
  }
}

function bucketLabelOf(granularity: ProjectionGranularity, start: LocalDate): string {
  switch (granularity) {
    case 'day':
      return start
    case 'week':
      return isoWeekLabel(start)
    case 'month':
      return start.slice(0, 7)
    case 'year':
      return start.slice(0, 4)
  }
}

const GRANULARITY_NAME: Record<ProjectionGranularity, string> = {
  day: '日',
  week: '周',
  month: '月',
  year: '年',
}

/**
 * 未来查看上限（只约束结束日期 `to`；过去区间不设限）。
 * 日 3 个月 / 周 6 个月 / 月 12 个月 / 年 3 年——年粒度不放到 5 年，
 * 避免日预算在极端情况下展开过多 occurrence 后只能报错。
 */
function futureLimitOf(granularity: ProjectionGranularity, asOf: LocalDate): LocalDate {
  switch (granularity) {
    case 'day':
      return addMonths(asOf, 3)
    case 'week':
      return addMonths(asOf, 6)
    case 'month':
      return addDays(startOfNextMonth(addMonths(startOfMonth(asOf), 12)), -1)
    case 'year':
      return `${Number(asOf.slice(0, 4)) + 3}-12-31` as LocalDate
  }
}

/**
 * 向外对齐生成桶，不拆桶：
 * - 日：from..to 的每一天
 * - 周：ISO 周一起，首尾桶可能有 from/to 之外的日期
 * - 月：自然月；年：自然年
 */
function buildProjectionBuckets(
  asOf: LocalDate,
  granularity: ProjectionGranularity,
  from: LocalDate,
  to: LocalDate,
): ProjectionBucket[] {
  const limit = futureLimitOf(granularity, asOf)
  if (to > limit) {
    const coarser = granularity === 'day'
      ? '；也可改用更粗的粒度（周 / 月 / 年）'
      : granularity === 'week'
        ? '；也可改用更粗的粒度（月 / 年）'
        : granularity === 'month'
          ? '；也可改用更粗的粒度（年）'
          : ''
    throw new ValidationError(
      `按${GRANULARITY_NAME[granularity]}粒度，未来最多查看至 ${limit}：请把结束日期 to 调早${coarser}后重试`,
    )
  }

  const buckets: ProjectionBucket[] = []
  let start = bucketStartOf(granularity, from)
  while (start <= to) {
    const endExclusive = nextBucketStart(granularity, start)
    buckets.push({
      granularity,
      label: bucketLabelOf(granularity, start),
      start,
      end: addDays(endExclusive, -1),
      endExclusive,
    })
    start = endExclusive
  }
  return buckets
}

/** 推演事件保护阈值：超过后不再继续计算，并给可操作的下一步。 */
const MAX_PROJECTION_EVENTS = 20_000

function assertEventBudget(count: number): void {
  if (count <= MAX_PROJECTION_EVENTS) return
  throw new AppError(
    `推演范围过大（已展开 ${count} 个事件，上限 ${MAX_PROJECTION_EVENTS}）：请缩小 from/to 范围，或改用更粗的粒度后重试`,
    'VALIDATION_ERROR',
    422,
    { eventCount: count, limit: MAX_PROJECTION_EVENTS },
  )
}

// ===== 来源事件 =====

interface PlannedOccurrenceMeta {
  budgetId: string
  budgetName: string
  type: 'income' | 'expense' | 'transfer'
  amount: Minor
  accountId: string
  toAccountId: string | null
  /** 点位所属预算周期的第一天（含），用于 occurrence 匹配。 */
  periodStart: LocalDate
  /** 点位所属预算周期的最后一天（含），用于 occurrence 匹配。 */
  periodEnd: LocalDate
}

interface PlannedEvent {
  source: 'planned'
  date: LocalDate
  ledger: LedgerTransaction
  occurrence: PlannedOccurrenceMeta
}

interface CommittedEvent {
  source: 'committed'
  date: LocalDate
  ledger: LedgerTransaction
  transactionId: string
}

type ProjectionEvent = PlannedEvent | CommittedEvent

/** 一次覆盖：某个预算点位被哪一笔真实交易替代。 */
interface CoveredOccurrence {
  event: PlannedEvent
  transactionId: string
  transactionDate: LocalDate
}

interface LoadedProjectionEvents {
  /** 已剔除被真实交易覆盖的点位。 */
  planned: PlannedEvent[]
  /** date > asOf 的真实交易，按日期升序。 */
  committed: CommittedEvent[]
  /** 窗口内被覆盖的点位，按点位日期升序。 */
  covered: CoveredOccurrence[]
}

function budgetKindOf(value: string): 'income' | 'expense' | 'transfer' {
  if (value === 'income' || value === 'expense' || value === 'transfer') return value
  throw new Error(`未知预算类型: ${value}`)
}

/**
 * 同一 occurrence 的互斥判定。
 *
 * 预算点位与其周期内的真实交易视为「同一笔计划」需同时满足：
 * - 类型相同（income / expense / transfer）；
 * - 来源账户相同；
 * - 转入账户相同（非转账两侧都为 null，转账必须同源同目标）；
 * - 真实交易日期落在点位所属预算周期 [periodStart, periodEnd] 内。
 *
 * 金额与分类不参与匹配：周期内同类型同账户的交易即视为该计划已兑现，
 * 否则「预算 2000、实际只花 800」会被算成两份。
 */
function occurrenceMatches(planned: PlannedEvent, transaction: CommittedEvent): boolean {
  const meta = planned.occurrence
  if (meta.type !== transaction.ledger.kind) return false
  if (meta.accountId !== transaction.ledger.accountId) return false
  if (meta.toAccountId !== transaction.ledger.toAccountId) return false
  return transaction.date >= meta.periodStart && transaction.date <= meta.periodEnd
}

/**
 * committed 按日期升序贪心匹配：一笔真实交易最多覆盖一个预算点位。
 */
function matchOccurrences(planned: PlannedEvent[], committed: CommittedEvent[]): CoveredOccurrence[] {
  const matched = new Set<PlannedEvent>()
  const covered: CoveredOccurrence[] = []

  for (const transaction of committed) {
    const event = planned.find(
      (candidate) => !matched.has(candidate) && occurrenceMatches(candidate, transaction),
    )
    if (!event) continue
    matched.add(event)
    covered.push({
      event,
      transactionId: transaction.transactionId,
      transactionDate: transaction.date,
    })
  }

  covered.sort((a, b) => a.event.date.localeCompare(b.event.date))
  return covered
}

/**
 * 两个未来来源 + occurrence 互斥：
 * - committed：date > asOf 的真实交易（不再被余额当作 actual，改由本来源单独累计）
 * - planned：预算展开点位（合成交易，只走预算口径，不读真实交易）
 *
 * 预算点位在其周期内存在同类型同账户（转账还需同目标账户）的真实交易时，
 * 视为同一 occurrence 已由真实交易兑现：点位从 planned 剔除，金额只留在 committed，
 * 并通过 `covered` 输出。调用方据此保持 total = actual + planned + committed。
 *
 * 只有两者都纳入时才做匹配：单独请求 planned 时返回未兑现的原始预算展开。
 */
async function loadProjectionEvents(params: {
  asOf: LocalDate
  windowEndExclusive: LocalDate
  includePlanned: boolean
  includeCommitted: boolean
}): Promise<LoadedProjectionEvents> {
  const firstFutureDay = addDays(params.asOf, 1)
  // 整段区间都在 asOf 之前：没有未来来源，不必查询/展开。
  if (params.windowEndExclusive <= firstFutureDay) {
    return { planned: [], committed: [], covered: [] }
  }
  const committed: CommittedEvent[] = []
  const plannedAll: PlannedEvent[] = []

  if (params.includeCommitted) {
    const rows = await transactionRepo.findActive(
      {
        date: {
          gte: toLocalDateDate(firstFutureDay),
          lt: toLocalDateDate(params.windowEndExclusive),
        },
      },
      { orderBy: { date: 'asc' } },
    )
    for (const row of rows) {
      const date = fromDate(row.date)
      committed.push({
        source: 'committed',
        date,
        ledger: toLedgerTransaction(row),
        transactionId: row.id,
      })
    }
  }

  if (params.includePlanned) {
    // 只展开 [asOf+1, 窗口末日]：已过去的预算点位不会进来
    const occurrences = await generatePredictedOccurrences(
      firstFutureDay,
      addDays(params.windowEndExclusive, -1),
    )
    for (const occurrence of occurrences) {
      const date = fromDate(occurrence.date)
      const type = budgetKindOf(occurrence.type)
      plannedAll.push({
        source: 'planned',
        date,
        ledger: {
          id: `budget:${occurrence.budgetId}:${date}`,
          ruleVersion: CURRENT_RULE_VERSION,
          kind: type,
          date,
          amount: minor(occurrence.amount),
          fee: ZERO_MINOR,
          coupon: ZERO_MINOR,
          accountId: occurrence.accountId,
          toAccountId: occurrence.toAccountId,
          categoryId: occurrence.categoryId,
          relatedTransactionId: null,
          relatedType: null,
          excludeFromIncomeExpense: false,
        },
        occurrence: {
          budgetId: occurrence.budgetId,
          budgetName: occurrence.budgetName,
          type,
          amount: minor(occurrence.amount),
          accountId: occurrence.accountId,
          toAccountId: occurrence.toAccountId,
          periodStart: fromDate(occurrence.periodStart),
          periodEnd: fromDate(occurrence.periodEnd),
        },
      })
    }
  }

  // 先于 O(n²) 的 occurrence 匹配检查总量，避免超范围请求把 CPU 打满。
  assertEventBudget(plannedAll.length + committed.length)
  const covered = matchOccurrences(plannedAll, committed)
  const coveredEvents = new Set(covered.map((item) => item.event))
  return {
    planned: plannedAll.filter((event) => !coveredEvents.has(event)),
    committed,
    covered,
  }
}

/** 区间 [start, end] 内被真实交易覆盖的预算点位。 */
function coveredInRange(
  covered: CoveredOccurrence[],
  start: LocalDate,
  end: LocalDate,
): ProjectionCoveredOccurrence[] {
  return covered
    .filter((item) => item.event.date >= start && item.event.date <= end)
    .map((item) => ({
      budgetId: item.event.occurrence.budgetId,
      budgetName: item.event.occurrence.budgetName,
      type: item.event.occurrence.type,
      date: item.event.date,
      amount: item.event.occurrence.amount,
      transactionId: item.transactionId,
      transactionDate: item.transactionDate,
    }))
}

function eventsByMonth<T extends ProjectionEvent>(events: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const event of events) {
    const label = event.date.slice(0, 7)
    const group = groups.get(label)
    if (group) group.push(event)
    else groups.set(label, [event])
  }
  return groups
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
  const target = toLocalDateDate(dateExclusive)
  const cache = await calculateBalancesBatch(accounts.map((account) => account.id), [target], accounts)
  return new Map(accounts.map((account) => [account.id, cache.get(account.id, target)]))
}

/** 旧入口（fromMonth/months）：逐月累计，数值保持与阶段 3 之前完全一致。 */
async function assetProjectionLegacy(params: ProjectionQueryParams): Promise<AssetProjectionResult> {
  const plan = projectionWindows(params.asOf, params.fromMonth, params.months)
  const accounts = await accountRepo.findMany({})

  // 起点只用当期真实余额：date ≤ asOf；未来日期交易留给 committed
  const baseBalances = await balancesAt(accounts, addDays(params.asOf, 1))
  const base = aggregateBalances(accounts, baseBalances)

  const events = await loadProjectionEvents({
    asOf: params.asOf,
    windowEndExclusive: plan.all[plan.all.length - 1]!.endExclusive,
    includePlanned: params.includePlanned,
    includeCommitted: params.includeCommitted,
  })
  const plannedByMonth = eventsByMonth(events.planned)
  const committedByMonth = eventsByMonth(events.committed)

  const plannedDelta = new Map<string, number>()
  const committedDelta = new Map<string, number>()

  // 先累计全部窗口（从 asOf 起），再按 fromMonth 截取输出，保证累计不丢失前置月份。
  const allPoints: AssetProjectionPoint[] = plan.all.map((window) => {
    for (const event of plannedByMonth.get(window.label) ?? []) {
      applyEventToBalances(plannedDelta, event)
    }
    for (const event of committedByMonth.get(window.label) ?? []) {
      applyEventToBalances(committedDelta, event)
    }
    const planned = aggregateBalances(accounts, plannedDelta)
    const committed = aggregateBalances(accounts, committedDelta)
    return {
      granularity: 'month',
      label: window.label,
      start: window.start,
      end: window.end,
      date: window.end,
      actual: base,
      planned,
      committed,
      total: addBalance(base, addBalance(planned, committed)),
      covered: coveredInRange(events.covered, window.start, window.end),
    }
  })

  const points = allPoints.slice(plan.skip)
  return {
    asOf: params.asOf,
    granularity: 'month',
    start: points[0]!.start,
    end: points[points.length - 1]!.end,
    bucketCount: points.length,
    fromMonth: plan.output[0]!.label,
    months: params.months,
    base,
    points,
  }
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
  const accounts = await accountRepo.findMany({})
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
      historicalBuckets.map((bucket) => toLocalDateDate(addDays(bucket.end, 1))),
      accounts,
    )

  const futureEvents = [...events.planned, ...events.committed]
    .sort((left, right) => left.date.localeCompare(right.date))
  let eventIndex = 0
  const plannedDelta = new Map<string, number>()
  const committedDelta = new Map<string, number>()

  const points: AssetProjectionPoint[] = buckets.map((bucket) => {
    if (bucket.end <= params.asOf) {
      const target = toLocalDateDate(addDays(bucket.end, 1))
      const balances = new Map(
        accounts.map((account) => [account.id, historicalCache?.get(account.id, target) ?? 0]),
      )
      const actual = aggregateBalances(accounts, balances)
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
      }
    }

    while (eventIndex < futureEvents.length && futureEvents[eventIndex]!.date <= bucket.end) {
      const event = futureEvents[eventIndex]!
      if (event.source === 'planned') applyEventToBalances(plannedDelta, event)
      else applyEventToBalances(committedDelta, event)
      eventIndex += 1
    }

    const planned = aggregateBalances(accounts, plannedDelta)
    const committed = aggregateBalances(accounts, committedDelta)
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
  if (params.from && params.to) {
    const buckets = buildProjectionBuckets(params.asOf, params.granularity, params.from, params.to)
    return assetProjectionRange(params, buckets)
  }
  return assetProjectionLegacy(params)
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

interface FlowTotals {
  inflow: Minor
  outflow: Minor
}

function sumFlows(events: ProjectionEvent[], cashAccountIds: ReadonlySet<string>): FlowTotals {
  let inflow = 0
  let outflow = 0
  for (const event of events) {
    const flow = cashFlowOf(event.ledger, cashAccountIds)
    inflow += flow.inflow
    outflow += flow.outflow
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

/** 旧入口（fromMonth/months）：逐月现金流，数值保持与阶段 3 之前完全一致。 */
async function cashFlowProjectionLegacy(params: ProjectionQueryParams): Promise<CashFlowProjectionResult> {
  const plan = projectionWindows(params.asOf, params.fromMonth, params.months)
  const firstWindow = plan.all[0]!
  const cashAccounts = await loadCashAccounts()
  const cashIds = cashAccounts.map((account) => account.id)
  const cashSet = new Set(cashIds)

  // 首个累计月月初现金：date < 月初，未来日期交易不参与
  const monthStartBalances = await balancesAt(cashAccounts, firstWindow.start)
  let runningCash = cashBalanceTotal(monthStartBalances)

  // 本月已发生部分：date ∈ [月初, asOf]（asOf 之后留给 committed）
  let actualInflow = 0
  let actualOutflow = 0
  if (cashIds.length > 0) {
    const actualRows = await transactionRepo.findActive(
      {
        OR: [
          { accountId: { in: cashIds } },
          { toAccountId: { in: cashIds } },
        ],
        date: {
          gte: toLocalDateDate(firstWindow.start),
          lt: toLocalDateDate(addDays(params.asOf, 1)),
        },
      },
      { orderBy: { date: 'asc' } },
    )
    for (const row of actualRows) {
      const flow = cashFlowOf(toLedgerTransaction(row), cashSet)
      actualInflow += flow.inflow
      actualOutflow += flow.outflow
    }
  }

  const events = await loadProjectionEvents({
    asOf: params.asOf,
    windowEndExclusive: plan.all[plan.all.length - 1]!.endExclusive,
    includePlanned: params.includePlanned,
    includeCommitted: params.includeCommitted,
  })
  const plannedByMonth = eventsByMonth(events.planned)
  const committedByMonth = eventsByMonth(events.committed)

  // 先累计全部窗口（从 asOf 起），再按 fromMonth 截取输出；startCash 取首个输出月月初。
  const allPoints: CashFlowProjectionPoint[] = plan.all.map((window, index) => {
    const planned = sumFlows(plannedByMonth.get(window.label) ?? [], cashSet)
    const committed = sumFlows(committedByMonth.get(window.label) ?? [], cashSet)

    const actual: FlowTotals = index === 0
      ? { inflow: minor(actualInflow), outflow: minor(actualOutflow) }
      : { inflow: ZERO_MINOR, outflow: ZERO_MINOR }

    const inflow = flowValue(actual.inflow, planned.inflow, committed.inflow)
    const outflow = flowValue(actual.outflow, planned.outflow, committed.outflow)
    const net = flowValue(
      minor(inflow.actual - outflow.actual),
      minor(inflow.planned - outflow.planned),
      minor(inflow.committed - outflow.committed),
    )

    const start = runningCash
    const endCash = minor(start + net.total)
    runningCash = endCash

    return {
      granularity: 'month',
      label: window.label,
      start: window.start,
      end: window.end,
      date: window.end,
      inflow,
      outflow,
      net,
      startCash: start,
      endCash,
      covered: coveredInRange(events.covered, window.start, window.end),
    }
  })

  const points = allPoints.slice(plan.skip)
  return {
    asOf: params.asOf,
    granularity: 'month',
    start: points[0]!.start,
    end: points[points.length - 1]!.end,
    bucketCount: points.length,
    fromMonth: plan.output[0]!.label,
    months: params.months,
    startCash: points[0]!.startCash,
    endCash: points[points.length - 1]!.endCash,
    points,
  }
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
          gte: toLocalDateDate(firstBucket.start),
          lt: toLocalDateDate(actualEndExclusive),
        },
      },
      { orderBy: { date: 'asc' } },
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

  return {
    asOf: params.asOf,
    granularity: params.granularity,
    start: buckets[0]!.start,
    end: buckets[buckets.length - 1]!.end,
    bucketCount: buckets.length,
    startCash: points[0]!.startCash,
    endCash: points[points.length - 1]!.endCash,
    points,
  }
}

export async function getCashFlowProjection(params: ProjectionQueryParams): Promise<CashFlowProjectionResult> {
  if (params.from && params.to) {
    const buckets = buildProjectionBuckets(params.asOf, params.granularity, params.from, params.to)
    return cashFlowProjectionRange(params, buckets)
  }
  return cashFlowProjectionLegacy(params)
}
