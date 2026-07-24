import { prisma } from '../../index.js'
import { calculateBalancesBatch, BalanceCache } from '../balance.service.js'
import { toDecimal, rootLogger, ZERO } from '../../common/index.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { formatDateLocal, sumAssetsLiabilities, resolveReportPeriod } from './report.utils.js'
import xirr from 'xirr'

const logger = rootLogger.child({ module: 'report' })

interface CashFlow {
  date: Date
  amount: number
  type: 'buy' | 'sell'
  accountId: string
  accountName: string
}

interface AccountWithCategory {
  id: string
  name: string
  categoryId: string | null
  category: { id: string; name: string; icon: string | null; color: string | null } | null
  icon: string | null
  color: string | null
  initialBalance: { toNumber: () => number }
  initialBalanceDate: Date | null
  createdAt: Date
}

interface InvestmentAccountDetail {
  id: string
  name: string
  categoryId: string | null
  categoryName: string
  icon: string | null
  color: string | null
  categoryIcon: string | null
  categoryColor: string | null
  balance: number
  ratio: number
  totalInvested: number
  totalWithdrawn: number
  maxCapitalEmployed: number
  simpleReturnRate: number
  cumulativeReturnRate: number
}

interface InvestmentCategorySummary {
  categoryId: string
  categoryName: string
  icon: string | null
  color: string | null
  balance: number
  ratio: number
  accounts: InvestmentAccountDetail[]
}

interface InvestmentReturnAnalysis {
  startValue: number
  endValue: number
  valueChange: number
  periodInvested: number
  periodWithdrawn: number
  netCashFlow: number
  periodReturn: number
  maxCapitalEmployed: number
  simpleReturnRate: number
  cumulativeReturnRate: number
  xirr: number | null
  twr: number | null
  annualizedTwr: number | null
  investmentDays: number
  cashFlowCount: number
}

interface InvestmentTrendItem {
  month: string
  investment: number
  netWorth: number
  ratio: number
}

interface AccountAllocationItem {
  assetClassId: string
  name: string
  icon: string | null
  color: string | null
  marketValue: number
  ratio: number
  targetRatio: number | null
  deviation: number | null
  rebalanceAmount: number | null
  periodInvested: number
  periodWithdrawn: number
  periodReturn: number | null
  returnRate: number | null
  sort: number
}

interface SnapshotHistoryItem {
  id: string
  date: string
  accountBalance: number
  items: Array<{
    assetClassId: string
    name: string
    marketValue: number
    ratio: number
  }>
}

interface AccountAllocationDetail {
  accountId: string
  accountName: string
  accountIcon: string | null
  accountColor: string | null
  balance: number
  hasAssetClasses: boolean
  latestSnapshotDate: string | null
  returnRate: number | null
  items: AccountAllocationItem[]
  snapshots: SnapshotHistoryItem[]
}

interface StaleAccountInfo {
  accountId: string
  accountName: string
  daysSinceLastSnapshot: number
  balance: number
}

interface InvestmentAnalysisResult {
  startDate: string
  endDate: string
  totalInvestment: number
  totalAssets: number
  investmentRatio: number
  accountCount: number
  returnAnalysis: InvestmentReturnAnalysis
  byCategory: InvestmentCategorySummary[]
  trend: InvestmentTrendItem[]
  byAccountAllocation: AccountAllocationDetail[]
  staleAccounts: StaleAccountInfo[]
}

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

async function getInvestmentAccounts(): Promise<AccountWithCategory[]> {
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

async function getCashFlowsInRange(
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
    const fee = toDecimal(t.fee)
    const coupon = toDecimal(t.coupon)
    const isToInvestment = accountIds.includes(t.toAccountId || '')
    const isFromInvestment = accountIds.includes(t.accountId)

    if (isToInvestment && !isFromInvestment) {
      const investedAmount = amount.plus(fee)
      cashFlows.push({
        date: t.date,
        amount: investedAmount.negated().toNumber(),
        type: 'buy',
        accountId: t.toAccountId!,
        accountName: accountMap.get(t.toAccountId!) || '未知账户',
      })
    } else if (isFromInvestment && !isToInvestment) {
      const withdrawnAmount = amount.minus(coupon)
      cashFlows.push({
        date: t.date,
        amount: withdrawnAmount.toNumber(),
        type: 'sell',
        accountId: t.accountId,
        accountName: accountMap.get(t.accountId) || '未知账户',
      })
    }
  }

  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())

  return cashFlows
}

/**
 * 使用 xirr 库计算年化内部收益率（XIRR）
 * 返回百分比值（如 5 表示 5%），无法收敛时返回 null
 */
function calculateXIRR(
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

function calculateMaxCapitalEmployed(cashFlows: CashFlow[], startValue: number = 0): number {
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

// ===== 批量查询辅助函数（消除 N+1） =====

async function batchGetAssetClasses(accountIds: string[]): Promise<Map<string, Array<{ id: string; accountId: string; name: string; icon: string | null; color: string | null; targetRatio: Decimal | null; sort: number }>>> {
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

async function batchGetSnapshots(accountIds: string[], endDate: Date) {
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

async function buildAccountAllocationDetail(
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

  const periodInvested = accountCashFlows
    .filter(cf => cf.type === 'buy')
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0)
  const periodWithdrawn = accountCashFlows
    .filter(cf => cf.type === 'sell')
    .reduce((sum, cf) => sum + cf.amount, 0)

  const maxCapitalEmployed = calculateMaxCapitalEmployed(accountCashFlows, startValue)
  const cumulativeReturn = endValue + periodWithdrawn - startValue - periodInvested
  const cumulativeReturnRate = maxCapitalEmployed !== 0 ? (cumulativeReturn / maxCapitalEmployed) * 100 : 0

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

async function buildStaleAccounts(
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
    if (!latestDate) {
      const daysSince = Math.floor(
        (endDate.getTime() - new Date(0).getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSince > staleDays) {
        staleAccountMap.set(account.id, {
          accountId: account.id,
          accountName: account.name,
          daysSinceLastSnapshot: daysSince,
          balance: account.balance,
        })
      }
    } else {
      const daysSince = Math.floor(
        (endDate.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24)
      )
      if (daysSince > staleDays) {
        staleAccountMap.set(account.id, {
          accountId: account.id,
          accountName: account.name,
          daysSinceLastSnapshot: daysSince,
          balance: account.balance,
        })
      }
    }
  }

  return Array.from(staleAccountMap.values())
}

export async function generateInvestmentAnalysis(startDateStr: string, endDateStr: string): Promise<InvestmentAnalysisResult | null> {
  const startTime = Date.now()
  const { startDate, endDate, nextDay: nextDayOfEnd } = resolveReportPeriod(startDateStr, endDateStr)

  const investmentAccounts = await getInvestmentAccounts()

  if (investmentAccounts.length === 0) {
    return null
  }

  const investmentAccountIds = investmentAccounts.map(a => a.id)

  // 获取所有账户（用于计算总资产）
  const allAccounts = await prisma.account.findMany()
  const allAccountIds = allAccounts.map(a => a.id)

  // 获取现金流数据
  const cashFlows = await getCashFlowsInRange(investmentAccountIds, startDate, endDate)

  // 计算趋势数据需要的月份日期
  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  const monthDates: Date[] = []
  let currentMonth = startMonth
  while (currentMonth <= endMonth) {
    monthDates.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
  }

  // 收集所有需要计算余额的日期
  const requiredDates: Date[] = [
    startDate,
    nextDayOfEnd,
    ...monthDates,
    ...cashFlows.map(cf => cf.date),
  ]

  // 批量计算所有账户在所有日期的余额
  const balanceCache = await calculateBalancesBatch(allAccountIds, requiredDates)

  // 计算投资账户的期初和期末余额
  const startValue = balanceCache.getMany(investmentAccountIds, startDate)
  const endValue = balanceCache.getMany(investmentAccountIds, nextDayOfEnd)

  // 计算总资产和总负债
  const { assets: totalAssets } = sumAssetsLiabilities(
    allAccounts.map(a => ({ type: a.type, id: a.id })),
    (a) => balanceCache.get(a.id, nextDayOfEnd)
  )

  const investmentRatio = totalAssets !== 0 ? (endValue / totalAssets) * 100 : 0

  const periodInvested = cashFlows
    .filter(cf => cf.type === 'buy')
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0)
  const periodWithdrawn = cashFlows
    .filter(cf => cf.type === 'sell')
    .reduce((sum, cf) => sum + cf.amount, 0)
  const netCashFlow = periodInvested - periodWithdrawn

  const valueChange = endValue - startValue
  const periodReturn = valueChange - netCashFlow
  const simpleReturnRate = startValue !== 0 ? (periodReturn / startValue) * 100 : 0

  const maxCapitalEmployed = calculateMaxCapitalEmployed(cashFlows, startValue)
  const cumulativeReturn = endValue + periodWithdrawn - startValue - periodInvested
  const cumulativeReturnRate = maxCapitalEmployed !== 0 ? (cumulativeReturn / maxCapitalEmployed) * 100 : 0

  const investmentDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  let xirr: number | null = null
  let twrResult: { twr: number | null; annualizedTwr: number | null } = { twr: null, annualizedTwr: null }

  if (investmentDays >= 1) {
    xirr = calculateXIRR(startValue, cashFlows, endValue, startDate, endDate)
    twrResult = calculateTWRWithCache(investmentAccountIds, startValue, cashFlows, startDate, nextDayOfEnd, balanceCache)
  }

  const returnAnalysis: InvestmentReturnAnalysis = {
    startValue,
    endValue,
    valueChange,
    periodInvested,
    periodWithdrawn,
    netCashFlow,
    periodReturn,
    maxCapitalEmployed,
    simpleReturnRate,
    cumulativeReturnRate,
    xirr,
    twr: twrResult.twr,
    annualizedTwr: twrResult.annualizedTwr,
    investmentDays: Math.floor(investmentDays),
    cashFlowCount: cashFlows.length,
  }

  // 按分类汇总
  const categoryMap = new Map<string, { category: { id: string; name: string; icon: string | null; color: string | null }; accounts: AccountWithCategory[] }>()

  for (const account of investmentAccounts) {
    if (account.category) {
      if (!categoryMap.has(account.category.id)) {
        categoryMap.set(account.category.id, {
          category: account.category,
          accounts: [],
        })
      }
      categoryMap.get(account.category.id)!.accounts.push(account)
    }
  }

  const byCategory: InvestmentCategorySummary[] = []

  for (const [categoryId, data] of categoryMap) {
    const categoryBalance = data.accounts.reduce((sum, a) => {
      return sum + balanceCache.get(a.id, nextDayOfEnd)
    }, 0)

    const ratio = endValue !== 0 ? (categoryBalance / endValue) * 100 : 0

    const accountDetails: InvestmentAccountDetail[] = data.accounts.map((account) => {
      const balance = balanceCache.get(account.id, nextDayOfEnd)
      const accountRatio = endValue !== 0 ? (balance / endValue) * 100 : 0

      const accStartBalance = balanceCache.get(account.id, startDate)
      const accEndBalance = balance

      // 计算单个账户的现金流（简化版，不额外查询）
      const accountCashFlows = cashFlows.filter(cf => cf.accountId === account.id)
      const accInvested = accountCashFlows
        .filter(cf => cf.type === 'buy')
        .reduce((sum, cf) => sum + Math.abs(cf.amount), 0)
      const accWithdrawn = accountCashFlows
        .filter(cf => cf.type === 'sell')
        .reduce((sum, cf) => sum + cf.amount, 0)

      const accNetCashFlow = accInvested - accWithdrawn
      const accPeriodReturn = accEndBalance - accStartBalance - accNetCashFlow
      const accReturnRate = accStartBalance !== 0 ? (accPeriodReturn / accStartBalance) * 100 : 0

      const accMaxCapital = calculateMaxCapitalEmployed(accountCashFlows, accStartBalance)
      const accCumulativeReturn = accEndBalance + accWithdrawn - accStartBalance - accInvested
      const accCumulativeReturnRate = accMaxCapital !== 0 ? (accCumulativeReturn / accMaxCapital) * 100 : 0

      return {
        id: account.id,
        name: account.name,
        categoryId: account.categoryId,
        categoryName: account.category?.name || '未分类',
        icon: account.icon || null,
        color: account.color || null,
        categoryIcon: account.category?.icon || null,
        categoryColor: account.category?.color || null,
        balance,
        ratio: accountRatio,
        totalInvested: accInvested,
        totalWithdrawn: accWithdrawn,
        maxCapitalEmployed: accMaxCapital,
        simpleReturnRate: accReturnRate,
        cumulativeReturnRate: accCumulativeReturnRate,
      }
    })

    byCategory.push({
      categoryId,
      categoryName: data.category.name,
      icon: data.category.icon,
      color: data.category.color,
      balance: categoryBalance,
      ratio,
      accounts: accountDetails,
    })
  }

  byCategory.sort((a, b) => b.balance - a.balance)

  // 生成趋势数据（使用缓存）
  const trend: InvestmentTrendItem[] = []
  for (let i = 0; i < monthDates.length; i++) {
    const nextMonthStart = monthDates[i]
    const monthStr = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}`

    const investment = balanceCache.getMany(investmentAccountIds, nextMonthStart)

    const { assets, netWorth } = sumAssetsLiabilities(
      allAccounts.map(a => ({ type: a.type, id: a.id })),
      (a) => balanceCache.get(a.id, nextMonthStart)
    )

    const ratio = assets !== 0 ? (investment / assets) * 100 : 0

    trend.push({
      month: monthStr,
      investment,
      netWorth,
      ratio,
    })
  }

  // 构建每个投资账户的资产细分数据
  const accountDetails = investmentAccounts.map(a => ({
    id: a.id,
    name: a.name,
    icon: a.icon,
    color: a.color,
    balance: balanceCache.get(a.id, nextDayOfEnd),
  }))

  // 批量预取资产分类、快照和现金流（消除 N+1 查询）
  const [prefetchedAssetClasses, prefetchedSnapshots, prefetchedCashFlows] = await Promise.all([
    batchGetAssetClasses(investmentAccountIds),
    batchGetSnapshots(investmentAccountIds, endDate),
    getCashFlowsInRange(investmentAccountIds, startDate, endDate),
  ])

  const prefetched = {
    assetClasses: prefetchedAssetClasses,
    snapshots: prefetchedSnapshots,
    cashFlows: prefetchedCashFlows,
  }

  const [byAccountAllocation, staleAccounts] = await Promise.all([
    Promise.all(accountDetails.map(account =>
      buildAccountAllocationDetail(account, endDate, startDate, balanceCache, prefetched)
    )),
    buildStaleAccounts(accountDetails, endDate, 30),
  ])

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalInvestment: endValue,
    totalAssets,
    investmentRatio,
    accountCount: investmentAccounts.length,
    returnAnalysis,
    byCategory,
    trend,
    byAccountAllocation,
    staleAccounts,
  }
  logger.info({ action: 'generate', report: 'investment-analysis', period: `${startDateStr}~${endDateStr}`, durationMs: Date.now() - startTime }, 'report generated')
}

function calculateTWRWithCache(
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
