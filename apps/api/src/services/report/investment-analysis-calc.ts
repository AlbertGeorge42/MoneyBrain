import { prisma } from '../../prisma.js'
import { toDecimal, ZERO } from '../../common/index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { formatDateLocal } from './report.utils.js'
import type { BalanceCache } from '../balance.service.js'
import {
  getCashFlowsInRange,
  batchGetAssetClasses,
  batchGetSnapshots,
} from './investment-analysis-collect.js'
import type {
  CashFlow,
  AccountAllocationItem,
  AccountAllocationDetail,
  SnapshotHistoryItem,
} from './investment-analysis-types.js'
import xirr from 'xirr'

// ===== 计算 / 分析函数 =====

/**
 * 使用 xirr 库计算年化内部收益率（XIRR）
 * 返回百分比值（如 5 表示 5%），无法收敛时返回 null
 */
export function calculateXIRR(
  startValue: number,
  cashFlows: CashFlow[],
  endValue: number,
  startDate: Date,
  endDate: Date
): number | null {
  const transactions = [
    { amount: -startValue, when: startDate },
    ...cashFlows.map(cf => ({ amount: cf.amount, when: cf.date })),
    { amount: endValue, when: endDate },
  ]

  try {
    const rate = xirr(transactions)
    if (!isFinite(rate) || Math.abs(rate) > 10) return null
    return rate * 100
  } catch {
    return null
  }
}

export function calculateMaxCapitalEmployed(cashFlows: CashFlow[], startValue: number = 0): number {
  let maxCapital = startValue
  let currentCapital = startValue

  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const cf of sortedFlows) {
    if (cf.type === 'buy') {
      currentCapital += Math.abs(cf.amount)
    } else {
      currentCapital -= cf.amount
    }
    if (currentCapital < 0) {
      currentCapital = 0
    }
    maxCapital = Math.max(maxCapital, currentCapital)
  }

  return maxCapital
}

/**
 * 计算投资回报相关指标（期间投入/取出、净现金流、期间收益、简单收益率、
 * 最大占用资金、累计收益及累计收益率）
 */
export function calculateReturnMetrics(
  cashFlows: CashFlow[],
  startValue: number,
  endValue: number
): {
  periodInvested: number
  periodWithdrawn: number
  netCashFlow: number
  periodReturn: number
  simpleReturnRate: number
  maxCapitalEmployed: number
  cumulativeReturn: number
  cumulativeReturnRate: number
} {
  const periodInvested = cashFlows
    .filter(cf => cf.type === 'buy')
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0)
  const periodWithdrawn = cashFlows
    .filter(cf => cf.type === 'sell')
    .reduce((sum, cf) => sum + cf.amount, 0)
  const netCashFlow = periodInvested - periodWithdrawn

  const periodReturn = endValue - startValue - netCashFlow
  const simpleReturnRate = startValue !== 0 ? (periodReturn / startValue) * 100 : 0

  const maxCapitalEmployed = calculateMaxCapitalEmployed(cashFlows, startValue)
  const cumulativeReturn = endValue + periodWithdrawn - startValue - periodInvested
  const cumulativeReturnRate = maxCapitalEmployed !== 0 ? (cumulativeReturn / maxCapitalEmployed) * 100 : 0

  return {
    periodInvested,
    periodWithdrawn,
    netCashFlow,
    periodReturn,
    simpleReturnRate,
    maxCapitalEmployed,
    cumulativeReturn,
    cumulativeReturnRate,
  }
}

export async function buildAccountAllocationDetail(
  account: { id: string; name: string; balance: number; icon: string | null; color: string | null },
  endDate: Date,
  startDate: Date,
  balanceCache: BalanceCache,
  // 可选预取数据（批量查询传入以消除 N+1）
  prefetched?: {
    assetClasses: Awaited<ReturnType<typeof batchGetAssetClasses>>
    snapshots: Awaited<ReturnType<typeof batchGetSnapshots>>
    cashFlows: CashFlow[]  // 全部账户的现金流，函数内按 accountId 过滤
  }
): Promise<AccountAllocationDetail> {
  const assetClasses = prefetched?.assetClasses.get(account.id) ?? await prisma.investmentAssetClass.findMany({
    where: { accountId: account.id },
    orderBy: { sort: 'asc' },
  })

  const hasAssetClasses = assetClasses.length > 0

  // 计算账户收益率（使用累计收益率计算方式）
  const accountCashFlows = prefetched
    ? prefetched.cashFlows.filter(cf => cf.accountId === account.id)
    : await getCashFlowsInRange([account.id], startDate, endDate)
  const nextDayOfEnd = new Date(endDate)
  nextDayOfEnd.setDate(nextDayOfEnd.getDate() + 1)

  const startValue = balanceCache.getMany([account.id], startDate)
  const endValue = balanceCache.getMany([account.id], nextDayOfEnd)

  const { cumulativeReturnRate } = calculateReturnMetrics(accountCashFlows, startValue, endValue)

  if (!hasAssetClasses) {
    return {
      accountId: account.id,
      accountName: account.name,
      accountIcon: account.icon,
      accountColor: account.color,
      balance: account.balance,
      hasAssetClasses: false,
      latestSnapshotDate: null,
      returnRate: cumulativeReturnRate,
      items: [],
      snapshots: [],
    }
  }

  const snapshots = prefetched?.snapshots.get(account.id) ?? await prisma.investmentAllocationSnapshot.findMany({
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

  if (snapshots.length === 0) {
    return {
      accountId: account.id,
      accountName: account.name,
      accountIcon: account.icon,
      accountColor: account.color,
      balance: account.balance,
      hasAssetClasses: true,
      latestSnapshotDate: null,
      returnRate: cumulativeReturnRate,
      items: [],
      snapshots: [],
    }
  }

  const latestSnapshot = snapshots[snapshots.length - 1]

  const previousSnapshot = latestSnapshot.previousSnapshotId
    ? snapshots.find(s => s.id === latestSnapshot.previousSnapshotId)
    : null

  // 先计算已分类市值总和
  const totalMarketValue = latestSnapshot.items.reduce(
    (sum, item) => sum.plus(toDecimal(item.marketValue)),
    ZERO,
  )

  const items: AccountAllocationItem[] = latestSnapshot.items.map(item => {
    // ratio 基于已分类市值总和，不包含未分类
    const itemMarketValue = toDecimal(item.marketValue)
    const ratio = totalMarketValue.greaterThan(ZERO)
      ? itemMarketValue.dividedBy(totalMarketValue).times(100).toNumber()
      : 0
    const targetRatio = item.assetClass.targetRatio == null ? null : toDecimal(item.assetClass.targetRatio)
    const deviation = targetRatio !== null ? ratio - targetRatio.toNumber() : null
    // rebalanceAmount 基于已分类市值总和
    const rebalanceAmount = targetRatio !== null
      ? targetRatio.dividedBy(100).times(totalMarketValue).minus(itemMarketValue).toNumber()
      : null

    let periodReturn: number | null = null
    let returnRate: number | null = null

    if (previousSnapshot) {
      const prevItem = previousSnapshot.items.find(i => i.assetClassId === item.assetClassId)
      if (prevItem) {
        const prevValue = toDecimal(prevItem.marketValue)
        const netContribution = toDecimal(item.periodNetFlow)
        const periodReturnDecimal = itemMarketValue.minus(prevValue).minus(netContribution)
        const positiveNetContribution = netContribution.greaterThan(ZERO) ? netContribution : ZERO
        const denominator = prevValue.plus(positiveNetContribution)
        periodReturn = periodReturnDecimal.toNumber()
        returnRate = denominator.greaterThan(ZERO)
          ? periodReturnDecimal.dividedBy(denominator).times(100).toNumber()
          : null
      }
    }

    return {
      assetClassId: item.assetClassId,
      name: item.assetClass.name,
      icon: item.assetClass.icon,
      color: item.assetClass.color,
      marketValue: itemMarketValue.toNumber(),
      ratio,
      targetRatio: targetRatio?.toNumber() ?? null,
      deviation,
      rebalanceAmount,
      periodInvested: toDecimal(item.periodNetFlow).greaterThan(ZERO) ? toDecimal(item.periodNetFlow).toNumber() : 0,
      periodWithdrawn: toDecimal(item.periodNetFlow).lessThan(ZERO) ? toDecimal(item.periodNetFlow).abs().toNumber() : 0,
      periodReturn,
      returnRate,
      sort: item.sort,
    }
  })

  // 计算差额并添加"未分类"项
  const accountBalance = toDecimal(account.balance)
  const unclassifiedValueDecimal = accountBalance.minus(totalMarketValue)
  const unclassifiedValue = unclassifiedValueDecimal.toNumber()
  if (unclassifiedValueDecimal.abs().greaterThan(new Decimal('0.01')) && items.length > 0) {
    items.push({
      assetClassId: '__unclassified__',
      name: '未分类',
      icon: null,
      color: null,
      marketValue: unclassifiedValue,
      ratio: 0, // 未分类不参与比例计算
      targetRatio: null,
      deviation: null,
      rebalanceAmount: null,
      periodInvested: 0,
      periodWithdrawn: 0,
      periodReturn: null,
      returnRate: null,
      sort: 999,
    })
  }

  const historySnapshots: SnapshotHistoryItem[] = snapshots.map(s => {
    const sAccountBalance = toDecimal(s.accountBalance)
    const sTotalMarketValue = s.items.reduce(
      (sum, item) => sum.plus(toDecimal(item.marketValue)),
      ZERO,
    )
    const sUnclassifiedValueDecimal = sAccountBalance.minus(sTotalMarketValue)
    const sUnclassifiedValue = sUnclassifiedValueDecimal.toNumber()
    const sItems = s.items.map(item => {
      const mv = toDecimal(item.marketValue)
      return {
        assetClassId: item.assetClassId,
        name: item.assetClass.name,
        marketValue: mv.toNumber(),
        ratio: sAccountBalance.greaterThan(ZERO) ? mv.dividedBy(sAccountBalance).times(100).toNumber() : 0,
      }
    })

    // 添加"未分类"项（如果有差额且已有其他项）
    if (sUnclassifiedValueDecimal.abs().greaterThan(new Decimal('0.01')) && sItems.length > 0) {
      sItems.push({
        assetClassId: '__unclassified__',
        name: '未分类',
        marketValue: sUnclassifiedValue,
        ratio: sAccountBalance.greaterThan(ZERO) ? sUnclassifiedValueDecimal.dividedBy(sAccountBalance).times(100).toNumber() : 0,
      })
    }

    return {
      id: s.id,
      date: formatDateLocal(s.date),
      accountBalance: sAccountBalance.toNumber(),
      items: sItems,
    }
  })

  return {
    accountId: account.id,
    accountName: account.name,
    accountIcon: account.icon,
    accountColor: account.color,
    balance: account.balance,
    hasAssetClasses: true,
    latestSnapshotDate: formatDateLocal(latestSnapshot.date),
    returnRate: cumulativeReturnRate,
    items,
    snapshots: historySnapshots,
  }
}

export function calculateTWRWithCache(
  accountIds: string[],
  startValue: number,
  cashFlows: CashFlow[],
  startDate: Date,
  endDate: Date,
  balanceCache: BalanceCache
): { twr: number | null; annualizedTwr: number | null } {
  const investmentDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  let twr = 1

  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())

  const cashFlowsByDate = new Map<string, number>()
  for (const cf of sortedFlows) {
    const dateKey = formatDateLocal(cf.date)
    cashFlowsByDate.set(dateKey, (cashFlowsByDate.get(dateKey) || 0) + cf.amount)
  }

  const firstDayBalance = startValue

  let prevValue = firstDayBalance
  let prevDate = startDate

  for (const [dateKey, totalAmount] of cashFlowsByDate) {
    const currentDate = new Date(dateKey)
    if (currentDate.getTime() <= prevDate.getTime()) continue

    const balanceBeforeCF = balanceCache.getMany(accountIds, new Date(dateKey))

    if (prevValue > 0 && balanceBeforeCF >= 0) {
      const periodReturn = (balanceBeforeCF - prevValue) / prevValue
      const clampedReturn = Math.max(-0.99, Math.min(10, periodReturn))
      twr *= (1 + clampedReturn)
    }

    prevValue = balanceBeforeCF - totalAmount
    prevDate = currentDate
  }

  if (prevDate < endDate) {
    const endValue = balanceCache.getMany(accountIds, endDate)
    if (prevValue > 0 && endValue >= 0) {
      const periodReturn = (endValue - prevValue) / prevValue
      const clampedReturn = Math.max(-0.99, Math.min(10, periodReturn))
      twr *= (1 + clampedReturn)
    }
  }

  twr = twr - 1

  if (!isFinite(twr) || Math.abs(twr) > 50) {
    return { twr: null, annualizedTwr: null }
  }

  const annualizedTwr = Math.pow(1 + twr, 365 / investmentDays) - 1

  if (!isFinite(annualizedTwr) || Math.abs(annualizedTwr) > 50) {
    return { twr: twr * 100, annualizedTwr: null }
  }

  return {
    twr: twr * 100,
    annualizedTwr: annualizedTwr * 100,
  }
}
