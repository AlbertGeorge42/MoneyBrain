import { prisma } from '../../prisma.js'
import { minor, type Minor } from '../../../../../packages/domain/src/index.js'
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
  startValue: Minor,
  endValue: Minor
): {
  periodInvested: Minor
  periodWithdrawn: Minor
  netCashFlow: Minor
  periodReturn: Minor
  simpleReturnRate: number
  maxCapitalEmployed: Minor
  cumulativeReturn: Minor
  cumulativeReturnRate: number
} {
  const periodInvested = minor(cashFlows
    .filter(cf => cf.type === 'buy')
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0))
  const periodWithdrawn = minor(cashFlows
    .filter(cf => cf.type === 'sell')
    .reduce((sum, cf) => sum + cf.amount, 0))
  const netCashFlow = minor(periodInvested - periodWithdrawn)

  const periodReturn = minor(endValue - startValue - netCashFlow)
  const simpleReturnRate = startValue !== 0 ? (periodReturn / startValue) * 100 : 0

  const maxCapitalEmployed = minor(calculateMaxCapitalEmployed(cashFlows, startValue))
  const cumulativeReturn = minor(endValue + periodWithdrawn - startValue - periodInvested)
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
  account: { id: string; name: string; balance: Minor; icon: string | null; color: string | null },
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

  const startValue = minor(balanceCache.getMany([account.id], startDate))
  const endValue = minor(balanceCache.getMany([account.id], nextDayOfEnd))

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
  const totalMarketValue = minor(latestSnapshot.items.reduce(
    (sum, item) => sum + Number(item.marketValue),
    0,
  ))

  const items: AccountAllocationItem[] = latestSnapshot.items.map(item => {
    // ratio 基于已分类市值总和，不包含未分类
    const itemMarketValue = minor(Number(item.marketValue))
    const ratio = totalMarketValue > 0
      ? (itemMarketValue / totalMarketValue) * 100
      : 0
    const targetRatio = item.assetClass.targetRatio == null ? null : Number(item.assetClass.targetRatio)
    const deviation = targetRatio !== null ? ratio - targetRatio : null
    // rebalanceAmount 基于已分类市值总和（四舍五入到分）
    const rebalanceAmount = targetRatio !== null
      ? minor(Math.round((targetRatio / 100) * totalMarketValue - itemMarketValue))
      : null

    let periodReturn: Minor | null = null
    let returnRate: number | null = null

    if (previousSnapshot) {
      const prevItem = previousSnapshot.items.find(i => i.assetClassId === item.assetClassId)
      if (prevItem) {
        const prevValue = minor(Number(prevItem.marketValue))
        const netContribution = minor(Number(item.periodNetFlow))
        const periodReturnAmount = minor(itemMarketValue - prevValue - netContribution)
        const positiveNetContribution = netContribution > 0 ? netContribution : minor(0)
        const denominator = minor(prevValue + positiveNetContribution)
        periodReturn = periodReturnAmount
        returnRate = denominator > 0
          ? (periodReturnAmount / denominator) * 100
          : null
      }
    }

    const periodNetFlow = minor(Number(item.periodNetFlow))

    return {
      assetClassId: item.assetClassId,
      name: item.assetClass.name,
      icon: item.assetClass.icon,
      color: item.assetClass.color,
      marketValue: itemMarketValue,
      ratio,
      targetRatio,
      deviation,
      rebalanceAmount,
      periodInvested: periodNetFlow > 0 ? periodNetFlow : minor(0),
      periodWithdrawn: periodNetFlow < 0 ? minor(Math.abs(periodNetFlow)) : minor(0),
      periodReturn,
      returnRate,
      sort: item.sort,
    }
  })

  // 计算差额并添加"未分类"项
  const accountBalance = account.balance
  const unclassifiedValue = minor(accountBalance - totalMarketValue)
  if (unclassifiedValue !== 0 && items.length > 0) {
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
      periodInvested: minor(0),
      periodWithdrawn: minor(0),
      periodReturn: null,
      returnRate: null,
      sort: 999,
    })
  }

  const historySnapshots: SnapshotHistoryItem[] = snapshots.map(s => {
    const sAccountBalance = minor(Number(s.accountBalance))
    const sTotalMarketValue = minor(s.items.reduce(
      (sum, item) => sum + Number(item.marketValue),
      0,
    ))
    const sUnclassifiedValue = minor(sAccountBalance - sTotalMarketValue)
    const sItems = s.items.map(item => {
      const mv = minor(Number(item.marketValue))
      return {
        assetClassId: item.assetClassId,
        name: item.assetClass.name,
        marketValue: mv,
        ratio: sAccountBalance > 0 ? (mv / sAccountBalance) * 100 : 0,
      }
    })

    // 添加"未分类"项（如果有差额且已有其他项）
    if (sUnclassifiedValue !== 0 && sItems.length > 0) {
      sItems.push({
        assetClassId: '__unclassified__',
        name: '未分类',
        marketValue: sUnclassifiedValue,
        ratio: sAccountBalance > 0 ? (sUnclassifiedValue / sAccountBalance) * 100 : 0,
      })
    }

    return {
      id: s.id,
      date: formatDateLocal(s.date),
      accountBalance: sAccountBalance,
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
