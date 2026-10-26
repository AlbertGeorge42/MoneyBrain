import { prisma } from '../../prisma.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { rootLogger } from '../../common/index.js'
import { minor } from '../../../../../packages/domain/src/index.js'
import { sumAssetsLiabilities, resolveReportPeriod, generateMonthRange } from './report.utils.js'
import {
  getInvestmentAccounts,
  getCashFlowsInRange,
  batchGetAssetClasses,
  batchGetSnapshots,
  buildStaleAccounts,
} from './investment-analysis-collect.js'
import {
  buildAccountAllocationDetail,
  calculateXIRR,
  calculateReturnMetrics,
  calculateTWRWithCache,
} from './investment-analysis-calc.js'
import type {
  AccountWithCategory,
  InvestmentAccountDetail,
  InvestmentCategorySummary,
  InvestmentReturnAnalysis,
  InvestmentTrendItem,
  InvestmentAnalysisResult,
} from './investment-analysis-types.js'

const logger = rootLogger.child({ module: 'report' })

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
  const monthDates = generateMonthRange(startDate, endDate)

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
  const startValue = minor(balanceCache.getMany(investmentAccountIds, startDate))
  const endValue = minor(balanceCache.getMany(investmentAccountIds, nextDayOfEnd))

  // 计算总资产和总负债
  const { assets: totalAssets } = sumAssetsLiabilities(
    allAccounts.map(a => ({ type: a.type, id: a.id })),
    (a) => minor(balanceCache.get(a.id, nextDayOfEnd))
  )

  const investmentRatio = totalAssets !== 0 ? (endValue / totalAssets) * 100 : 0

  const valueChange = minor(endValue - startValue)

  const {
    periodInvested,
    periodWithdrawn,
    netCashFlow,
    periodReturn,
    simpleReturnRate,
    maxCapitalEmployed,
    cumulativeReturnRate,
  } = calculateReturnMetrics(cashFlows, startValue, endValue)

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
    const categoryBalance = minor(data.accounts.reduce((sum, a) => {
      return sum + balanceCache.get(a.id, nextDayOfEnd)
    }, 0))

    const ratio = endValue !== 0 ? (categoryBalance / endValue) * 100 : 0

    const accountDetails: InvestmentAccountDetail[] = data.accounts.map((account) => {
      const balance = minor(balanceCache.get(account.id, nextDayOfEnd))
      const accountRatio = endValue !== 0 ? (balance / endValue) * 100 : 0

      const accStartBalance = minor(balanceCache.get(account.id, startDate))
      const accEndBalance = balance

      // 计算单个账户的现金流（简化版，不额外查询）
      const accountCashFlows = cashFlows.filter(cf => cf.accountId === account.id)
      const {
        periodInvested: accInvested,
        periodWithdrawn: accWithdrawn,
        maxCapitalEmployed: accMaxCapital,
        simpleReturnRate: accReturnRate,
        cumulativeReturnRate: accCumulativeReturnRate,
      } = calculateReturnMetrics(accountCashFlows, accStartBalance, accEndBalance)

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

    const investment = minor(balanceCache.getMany(investmentAccountIds, nextMonthStart))

    const { assets, netWorth } = sumAssetsLiabilities(
      allAccounts.map(a => ({ type: a.type, id: a.id })),
      (a) => minor(balanceCache.get(a.id, nextMonthStart))
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
    balance: minor(balanceCache.get(a.id, nextDayOfEnd)),
  }))

  // 批量预取资产分类和快照（消除 N+1 查询）；现金流已在上方获取，直接复用
  const [prefetchedAssetClasses, prefetchedSnapshots] = await Promise.all([
    batchGetAssetClasses(investmentAccountIds),
    batchGetSnapshots(investmentAccountIds, endDate),
  ])

  const prefetched = {
    assetClasses: prefetchedAssetClasses,
    snapshots: prefetchedSnapshots,
    cashFlows,
  }

  const [byAccountAllocation, staleAccounts] = await Promise.all([
    Promise.all(accountDetails.map(account =>
      buildAccountAllocationDetail(account, endDate, startDate, balanceCache, prefetched)
    )),
    buildStaleAccounts(accountDetails, endDate, 30),
  ])

  logger.info({ action: 'generate', report: 'investment-analysis', period: `${startDateStr}~${endDateStr}`, durationMs: Date.now() - startTime }, 'report generated')

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
}
