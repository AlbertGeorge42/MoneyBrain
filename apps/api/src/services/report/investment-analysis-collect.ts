import { Decimal } from '@prisma/client/runtime/library.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
import * as accountCategoryRepo from '../../db/repositories/account-category.repository.js'
import * as assetClassRepo from '../../db/repositories/investment-asset-class.repository.js'
import * as snapshotRepo from '../../db/repositories/investment-allocation-snapshot.repository.js'
import * as transactionRepo from '../../db/repositories/transaction.repository.js'
import {
  buildAllocationItems,
  buildSnapshotHistory,
  calculateReturnMetrics,
  fromDate,
  minor,
  neg,
  transferInflow,
  type AllocationSnapshot,
  type AllocationSnapshotItem,
  type InvestmentCashFlow,
  type Minor,
} from '../../../../../packages/domain/src/index.js'
import type { BalanceCache } from '../balance.service.js'
import { toMinor } from '../../common/index.js'
import type {
  AccountAllocationDetail,
  CashFlow,
  AccountWithCategory,
  StaleAccountInfo,
} from './investment-analysis-types.js'

// ===== 数据收集 / 查询函数 =====

async function getDescendantCategoryIds(parentIds: string[]): Promise<string[]> {
  const children = await accountCategoryRepo.findMany({
    where: { parentId: { in: parentIds } },
    select: { id: true },
  })

  if (children.length === 0) return parentIds

  const childIds = children.map(c => c.id)
  const grandChildIds = await getDescendantCategoryIds(childIds)
  return [...parentIds, ...childIds, ...grandChildIds]
}

export async function getInvestmentAccounts(): Promise<AccountWithCategory[]> {
  const investmentCategories = await accountCategoryRepo.findMany({
    where: { isInvestment: true },
  })

  if (investmentCategories.length === 0) {
    return []
  }

  const allCategoryIds = await getDescendantCategoryIds(
    investmentCategories.map(c => c.id)
  )

  const accounts = await accountRepo.findMany({
    where: { categoryId: { in: allCategoryIds } },
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
  })

  return accounts as AccountWithCategory[]
}

export async function getCashFlowsInRange(
  accountIds: string[],
  startDate: Date,
  endDate: Date
): Promise<CashFlow[]> {
  const cashFlows: CashFlow[] = []

  const accounts = await accountRepo.findMany({
    where: { id: { in: accountIds } },
  })
  const accountMap = new Map(accounts.map(a => [a.id, a.name]))

  // 仅查询 transfer 类型：本金投入/取出。income/expense 已通过 balanceCache 反映在余额中，不应重复计入现金流
  const transfers = await transactionRepo.findActive(
    {
      type: 'transfer',
      date: {
        gte: startDate,
        lte: endDate,
      },
      OR: [
        { accountId: { in: accountIds } },
        { toAccountId: { in: accountIds } },
      ],
    },
    { orderBy: { date: 'asc' } },
  )

  for (const t of transfers) {
    const isToInvestment = accountIds.includes(t.toAccountId || '')
    const isFromInvestment = accountIds.includes(t.accountId)

    // 转账本金只经领域层规则取值（A0：不得在报表里直接解释 transfer.amount）；
    // 手续费属于费用，不计入投资现金流
    const principal = transferInflow(toMinor(t.amount), toMinor(t.coupon))

    if (isToInvestment && !isFromInvestment) {
      cashFlows.push({
        date: t.date,
        amount: neg(principal),
        type: 'buy',
        accountId: t.toAccountId!,
        accountName: accountMap.get(t.toAccountId!) || '未知账户',
      })
    } else if (isFromInvestment && !isToInvestment) {
      cashFlows.push({
        date: t.date,
        amount: principal,
        type: 'sell',
        accountId: t.accountId,
        accountName: accountMap.get(t.accountId) || '未知账户',
      })
    }
  }

  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())

  return cashFlows
}

export async function batchGetAssetClasses(accountIds: string[]): Promise<Map<string, Array<{ id: string; accountId: string; name: string; targetRatio: Decimal | null; sort: number }>>> {
  const allClasses = await assetClassRepo.findMany({
    where: { accountId: { in: accountIds } },
    orderBy: { sort: 'asc' },
  })
  const map = new Map<string, typeof allClasses>()
  for (const cls of allClasses) {
    if (!map.has(cls.accountId)) map.set(cls.accountId, [])
    map.get(cls.accountId)!.push(cls)
  }
  return map
}

export async function batchGetSnapshots(accountIds: string[], endDate: Date) {
  const allSnapshots = await snapshotRepo.findMany({
    where: {
      accountId: { in: accountIds },
      date: { lte: endDate },
    },
    include: {
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' },
      },
    },
    orderBy: { date: 'asc' },
  })
  const map = new Map<string, typeof allSnapshots>()
  for (const snap of allSnapshots) {
    if (!map.has(snap.accountId)) map.set(snap.accountId, [])
    map.get(snap.accountId)!.push(snap)
  }
  return map
}

export async function buildStaleAccounts(
  accounts: Array<{ id: string; name: string; balance: Minor }>,
  endDate: Date,
  staleDays: number = 30
): Promise<StaleAccountInfo[]> {
  const latestSnapshots = await snapshotRepo.findMany({
    where: {
      accountId: { in: accounts.map(a => a.id) },
    },
    orderBy: { date: 'desc' },
  })

  const staleAccountMap = new Map<string, StaleAccountInfo>()
  const latestSnapshotMap = new Map<string, Date>()

  for (const snap of latestSnapshots) {
    if (!latestSnapshotMap.has(snap.accountId)) {
      latestSnapshotMap.set(snap.accountId, snap.date)
    }
  }

  for (const account of accounts) {
    const latestDate = latestSnapshotMap.get(account.id)
    // 无快照账户使用 staleDays + 1 视为过期，避免基于 Unix 纪元（new Date(0)）的无意义天数计算
    const daysSince = latestDate
      ? Math.floor(
        (endDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      : staleDays + 1
    if (daysSince > staleDays) {
      staleAccountMap.set(account.id, {
        accountId: account.id,
        accountName: account.name,
        daysSinceLastSnapshot: daysSince,
        balance: account.balance,
      })
    }
  }

  return Array.from(staleAccountMap.values())
}

/** 取数边界的字段搬运：DB 的 Date / 裸整数分 → 领域输入类型。 */
export function toDomainCashFlows(flows: readonly CashFlow[]): InvestmentCashFlow[] {
  return flows.map(cf => ({
    day: fromDate(cf.date),
    timestamp: cf.date.getTime(),
    amount: cf.amount as Minor,
    kind: cf.type,
    accountId: cf.accountId,
  }))
}

function toSnapshotItem(item: {
  assetClassId: string
  marketValue: bigint
  periodNetFlow: bigint
  sort: number
  assetClass: { name: string; targetRatio: { toString(): string } | number | null }
}, previousMarketValue: Minor | null): AllocationSnapshotItem {
  return {
    assetClassId: item.assetClassId,
    name: item.assetClass.name,
    marketValue: toMinor(item.marketValue),
    periodNetFlow: toMinor(item.periodNetFlow),
    targetRatio: item.assetClass.targetRatio == null ? null : Number(item.assetClass.targetRatio),
    sort: item.sort,
    previousMarketValue,
  }
}

/**
 * 账户资产配置明细：这里只做取数、Prisma → 领域输入映射与 DTO 组装，
 * 占比 / 再平衡 / 期间收益 / 历史快照全部由 Domain 计算。
 */
export async function buildAccountAllocationDetail(
  account: { id: string; name: string; balance: Minor },
  endDate: Date,
  startDate: Date,
  balanceCache: BalanceCache,
  prefetched: {
    assetClasses: Awaited<ReturnType<typeof batchGetAssetClasses>>
    snapshots: Awaited<ReturnType<typeof batchGetSnapshots>>
    cashFlows: CashFlow[]
  },
): Promise<AccountAllocationDetail> {
  const assetClasses = prefetched.assetClasses.get(account.id) ?? await assetClassRepo.findMany({
    where: { accountId: account.id },
    orderBy: { sort: 'asc' },
  })
  const hasAssetClasses = assetClasses.length > 0

  const accountCashFlows = prefetched.cashFlows.filter(cf => cf.accountId === account.id)
  const nextDayOfEnd = new Date(endDate)
  nextDayOfEnd.setDate(nextDayOfEnd.getDate() + 1)

  const startValue = minor(balanceCache.getMany([account.id], startDate))
  const endValue = minor(balanceCache.getMany([account.id], nextDayOfEnd))
  const { cumulativeReturnRate } = calculateReturnMetrics(
    toDomainCashFlows(accountCashFlows), startValue, endValue,
  )

  const emptyDetail = (withAssetClasses: boolean): AccountAllocationDetail => ({
    accountId: account.id,
    accountName: account.name,
    balance: account.balance,
    hasAssetClasses: withAssetClasses,
    latestSnapshotDate: null,
    returnRate: cumulativeReturnRate,
    items: [],
    snapshots: [],
  })

  if (!hasAssetClasses) return emptyDetail(false)

  const snapshots = prefetched.snapshots.get(account.id) ?? await snapshotRepo.findMany({
    where: {
      accountId: account.id,
      date: { lte: endDate },
    },
    include: {
      items: {
        include: { assetClass: true },
        orderBy: { sort: 'asc' },
      },
    },
    orderBy: { date: 'asc' },
  })

  if (snapshots.length === 0) return emptyDetail(true)

  const latestSnapshot = snapshots[snapshots.length - 1]!
  const previousSnapshot = latestSnapshot.previousSnapshotId
    ? snapshots.find(s => s.id === latestSnapshot.previousSnapshotId) ?? null
    : null

  const latestItems: AllocationSnapshotItem[] = latestSnapshot.items.map(item => {
    const prevItem = previousSnapshot?.items.find(i => i.assetClassId === item.assetClassId)
    return toSnapshotItem(item, prevItem ? toMinor(prevItem.marketValue) : null)
  })

  const history: AllocationSnapshot[] = snapshots.map(s => ({
    id: s.id,
    date: fromDate(s.date),
    accountBalance: toMinor(s.accountBalance),
    items: s.items.map(item => toSnapshotItem(item, null)),
  }))

  return {
    accountId: account.id,
    accountName: account.name,
    balance: account.balance,
    hasAssetClasses: true,
    latestSnapshotDate: fromDate(latestSnapshot.date),
    returnRate: cumulativeReturnRate,
    items: buildAllocationItems(latestItems, account.balance),
    snapshots: buildSnapshotHistory(history),
  }
}
