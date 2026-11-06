import type { Account } from '@prisma/client'
import type {
  AssetProjectionPoint,
  AssetProjectionResult,
  CashFlowProjectionPoint,
  CashFlowProjectionResult,
  ProjectionBalance,
  ProjectionFlowValue,
  ProjectionMonths,
} from '../../../../packages/contracts/types/index.js'
import * as accountCategoryRepo from '../db/repositories/account-category.repository.js'
import * as accountRepo from '../db/repositories/account.repository.js'
import * as transactionRepo from '../db/repositories/transaction.repository.js'
import {
  CURRENT_RULE_VERSION,
  ZERO_MINOR,
  addDays,
  fromDate,
  minor,
  postingsOf,
  rulesFor,
  startOfMonth,
  startOfNextMonth,
  type LedgerTransaction,
  type LocalDate,
  type Minor,
} from '../../../../packages/domain/src/index.js'
import { calculateBalancesBatch } from './balance.service.js'
import { generatePredictions } from './budget.service.js'
import { toLedgerTransaction } from './ledger.adapter.js'

// ===== 窗口 =====

interface ProjectionWindow {
  label: string
  start: LocalDate
  /** 下月 1 日（不含）。 */
  endExclusive: LocalDate
  /** 该月最后一个日历日（含）。 */
  end: LocalDate
}

/** 从 asOf 所在自然月开始，连续 months 个自然月。 */
function projectionWindows(asOf: LocalDate, months: ProjectionMonths): ProjectionWindow[] {
  const windows: ProjectionWindow[] = []
  let start = startOfMonth(asOf)
  for (let i = 0; i < months; i++) {
    const endExclusive = startOfNextMonth(start)
    windows.push({
      label: start.slice(0, 7),
      start,
      endExclusive,
      end: addDays(endExclusive, -1),
    })
    start = endExclusive
  }
  return windows
}

function toLocalDateDate(value: LocalDate): Date {
  const [year, month, day] = value.split('-').map(Number) as [number, number, number]
  return new Date(year, month - 1, day)
}

// ===== 来源事件 =====

type ProjectionSource = 'planned' | 'committed'

interface ProjectionEvent {
  source: ProjectionSource
  date: LocalDate
  ledger: LedgerTransaction
}

function budgetKindOf(value: string): 'income' | 'expense' | 'transfer' {
  if (value === 'income' || value === 'expense' || value === 'transfer') return value
  throw new Error(`未知预算类型: ${value}`)
}
/**
 * 两个互不重叠的未来来源：
 * - committed：date > asOf 的真实交易（不再被余额当作 actual，改由本来源单独累计）
 * - planned：预算展开点位（合成交易，只走预算口径，不读真实交易）
 *
 * 同一笔钱只会出现在其中一个来源里，因此同一月份 planned + committed 不会重复计。
 */
async function loadProjectionEvents(params: {
  asOf: LocalDate
  windowEndExclusive: LocalDate
  includePlanned: boolean
  includeCommitted: boolean
}): Promise<ProjectionEvent[]> {
  const firstFutureDay = addDays(params.asOf, 1)
  const events: ProjectionEvent[] = []

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
      events.push({
        source: 'committed',
        date: fromDate(row.date),
        ledger: toLedgerTransaction(row),
      })
    }
  }

  if (params.includePlanned) {
    // 只展开 [asOf+1, 窗口末日]：已过去的预算点位不会进来
    const predictions = await generatePredictions(
      firstFutureDay,
      addDays(params.windowEndExclusive, -1),
    )
    for (const prediction of predictions) {
      events.push({
        source: 'planned',
        date: fromDate(prediction.date),
        ledger: {
          id: `budget:${prediction.budgetId}:${fromDate(prediction.date)}`,
          ruleVersion: CURRENT_RULE_VERSION,
          kind: budgetKindOf(prediction.type),
          date: fromDate(prediction.date),
          amount: minor(prediction.amount),
          fee: ZERO_MINOR,
          coupon: ZERO_MINOR,
          accountId: prediction.accountId,
          toAccountId: prediction.toAccountId,
          categoryId: prediction.categoryId,
          relatedTransactionId: null,
          relatedType: null,
          excludeFromIncomeExpense: false,
        },
      })
    }
  }

  return events
}

function eventsByMonth(events: ProjectionEvent[]): Map<string, ProjectionEvent[]> {
  const groups = new Map<string, ProjectionEvent[]>()
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
 * 按账户类型汇总水平。
 * liabilities 取负债账户余额合计的相反数（正常为正），netWorth = 资产 + 负债（带符号）。
 * 三个量都是 balances 的线性函数，因此组件可逐项相加。
 */
function aggregateBalances(accounts: Account[], balances: Map<string, number>): ProjectionBalance {
  let assets = 0
  let liabilitySigned = 0
  for (const account of accounts) {
    const balance = balances.get(account.id) ?? 0
    if (account.type === 'asset') assets += balance
    else if (account.type === 'liability') liabilitySigned += balance
  }
  return {
    assets: minor(assets),
    liabilities: minor(-liabilitySigned),
    netWorth: minor(assets + liabilitySigned),
  }
}

function addBalance(a: ProjectionBalance, b: ProjectionBalance): ProjectionBalance {
  return {
    assets: minor(a.assets + b.assets),
    liabilities: minor(a.liabilities + b.liabilities),
    netWorth: minor(a.netWorth + b.netWorth),
  }
}

async function balancesAt(accounts: Account[], dateExclusive: LocalDate): Promise<Map<string, number>> {
  if (accounts.length === 0) return new Map()
  const target = toLocalDateDate(dateExclusive)
  const cache = await calculateBalancesBatch(accounts.map((account) => account.id), [target], accounts)
  return new Map(accounts.map((account) => [account.id, cache.get(account.id, target)]))
}

export async function getAssetProjection(params: {
  asOf: LocalDate
  months: ProjectionMonths
  includePlanned: boolean
  includeCommitted: boolean
}): Promise<AssetProjectionResult> {
  const windows = projectionWindows(params.asOf, params.months)
  const accounts = await accountRepo.findMany({})

  // 起点只用当期真实余额：date ≤ asOf；未来日期交易留给 committed
  const baseBalances = await balancesAt(accounts, addDays(params.asOf, 1))
  const base = aggregateBalances(accounts, baseBalances)

  const events = await loadProjectionEvents({
    asOf: params.asOf,
    windowEndExclusive: windows[windows.length - 1]!.endExclusive,
    includePlanned: params.includePlanned,
    includeCommitted: params.includeCommitted,
  })
  const byMonth = eventsByMonth(events)

  const plannedDelta = new Map<string, number>()
  const committedDelta = new Map<string, number>()

  const points: AssetProjectionPoint[] = windows.map((window) => {
    for (const event of byMonth.get(window.label) ?? []) {
      applyEventToBalances(event.source === 'planned' ? plannedDelta : committedDelta, event)
    }
    const planned = aggregateBalances(accounts, plannedDelta)
    const committed = aggregateBalances(accounts, committedDelta)
    return {
      label: window.label,
      date: window.end,
      actual: base,
      planned,
      committed,
      total: addBalance(base, addBalance(planned, committed)),
    }
  })

  return { asOf: params.asOf, months: params.months, base, points }
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

export async function getCashFlowProjection(params: {
  asOf: LocalDate
  months: ProjectionMonths
  includePlanned: boolean
  includeCommitted: boolean
}): Promise<CashFlowProjectionResult> {
  const windows = projectionWindows(params.asOf, params.months)
  const firstWindow = windows[0]!
  const cashAccounts = await loadCashAccounts()
  const cashIds = cashAccounts.map((account) => account.id)
  const cashSet = new Set(cashIds)

  // 首个推演月月初现金：date < 月初，未来日期交易不参与
  const monthStartBalances = await balancesAt(cashAccounts, firstWindow.start)
  const startCash = minor([...monthStartBalances.values()].reduce((sum, value) => sum + value, 0))

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
    windowEndExclusive: windows[windows.length - 1]!.endExclusive,
    includePlanned: params.includePlanned,
    includeCommitted: params.includeCommitted,
  })
  const byMonth = eventsByMonth(events)

  let runningCash = startCash
  const points: CashFlowProjectionPoint[] = windows.map((window, index) => {
    const monthEvents = byMonth.get(window.label) ?? []
    const planned = sumFlows(monthEvents.filter((event) => event.source === 'planned'), cashSet)
    const committed = sumFlows(monthEvents.filter((event) => event.source === 'committed'), cashSet)

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
      label: window.label,
      date: window.end,
      inflow,
      outflow,
      net,
      startCash: start,
      endCash,
    }
  })

  return {
    asOf: params.asOf,
    months: params.months,
    startCash,
    endCash: points[points.length - 1]!.endCash,
    points,
  }
}
