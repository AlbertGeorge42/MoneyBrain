import { prisma } from '../../prisma.js'
import { toDecimal } from '../../common/index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import type { CashFlow, AccountWithCategory, StaleAccountInfo } from './investment-analysis-types.js'

// ===== 数据收集 / 查询函数 =====

async function getDescendantCategoryIds(parentIds: string[]): Promise<string[]> {
  const children = await prisma.accountCategory.findMany({
    where: { parentId: { in: parentIds } },
    select: { id: true },
  })

  if (children.length === 0) return parentIds

  const childIds = children.map(c => c.id)
  const grandChildIds = await getDescendantCategoryIds(childIds)
  return [...parentIds, ...childIds, ...grandChildIds]
}

export async function getInvestmentAccounts(): Promise<AccountWithCategory[]> {
  const investmentCategories = await prisma.accountCategory.findMany({
    where: { isInvestment: true },
  })

  if (investmentCategories.length === 0) {
    return []
  }

  const allCategoryIds = await getDescendantCategoryIds(
    investmentCategories.map(c => c.id)
  )

  const accounts = await prisma.account.findMany({
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

  const accounts = await prisma.account.findMany({
    where: { id: { in: accountIds } },
  })
  const accountMap = new Map(accounts.map(a => [a.id, a.name]))

  // 仅查询 transfer 类型：本金投入/取出。income/expense 已通过 balanceCache 反映在余额中，不应重复计入现金流
  const transfers = await prisma.transaction.findMany({
    where: {
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
    orderBy: { date: 'asc' },
  })

  for (const t of transfers) {
    const amount = t.amount
    const isToInvestment = accountIds.includes(t.toAccountId || '')
    const isFromInvestment = accountIds.includes(t.accountId)

    // fee/coupon 已合并到 amount 中，直接用 amount
    if (isToInvestment && !isFromInvestment) {
      cashFlows.push({
        date: t.date,
        amount: amount.negated().toNumber(),
        type: 'buy',
        accountId: t.toAccountId!,
        accountName: accountMap.get(t.toAccountId!) || '未知账户',
      })
    } else if (isFromInvestment && !isToInvestment) {
      cashFlows.push({
        date: t.date,
        amount: amount.toNumber(),
        type: 'sell',
        accountId: t.accountId,
        accountName: accountMap.get(t.accountId) || '未知账户',
      })
    }
  }

  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())

  return cashFlows
}

export async function batchGetAssetClasses(accountIds: string[]): Promise<Map<string, Array<{ id: string; accountId: string; name: string; icon: string | null; color: string | null; targetRatio: Decimal | null; sort: number }>>> {
  const allClasses = await prisma.investmentAssetClass.findMany({
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
  const allSnapshots = await prisma.investmentAllocationSnapshot.findMany({
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
  accounts: Array<{ id: string; name: string; balance: number }>,
  endDate: Date,
  staleDays: number = 30
): Promise<StaleAccountInfo[]> {
  const cutoffDate = new Date(endDate)
  cutoffDate.setDate(cutoffDate.getDate() - staleDays)

  const latestSnapshots = await prisma.investmentAllocationSnapshot.findMany({
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
