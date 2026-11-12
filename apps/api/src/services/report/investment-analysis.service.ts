import { calculateBalancesBatch } from '../balance.service.js'
import { rootLogger } from '../../common/index.js'
import { minor, sum, neg, sub, type Minor } from '../../../../../packages/domain/src/index.js'
import { sumAssetsLiabilities, sumPositiveAssets } from './account-sum.js'
import { resolveReportPeriod } from './period.js'
import * as accountRepo from '../../db/repositories/account.repository.js'
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
  mergeCategoryItems,
} from './investment-analysis-calc.js'
import type {
  AccountWithCategory,
  InvestmentAccountDetail,
  InvestmentCategorySummary,
  InvestmentReturnAnalysis,
  InvestmentTrendItem,
  InvestmentAnalysisResult,
} from './investment-analysis-types.js'

function generateMonthRange(start: Date, end: Date): Date[] {
  const months: Date[] = []
  const current = new Date(start.getFullYear(), start.getMonth(), 1)
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1)
  while (current <= endMonth) {
    months.push(new Date(current))
    current.setMonth(current.getMonth() + 1)
  }
  return months
}

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
  const allAccounts = await accountRepo.findMany({})
  const allAccountIds = allAccounts.map(a => a.id)
  const accountTypeList = () => allAccounts.map(a => ({ type: a.type, id: a.id }))

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

  // 总资产（含负余额资产）保留给「总资产」展示；
  // 投资占比的分母改为正余额资产合计：负余额资产不是可配置资产，
  // 计入分母会把占比推过 100%（真实库 105.18% → 89.94%）。
  const { assets: totalAssets } = sumAssetsLiabilities(
    accountTypeList(),
    (a) => minor(balanceCache.get(a.id, nextDayOfEnd))
  )
  const ratioBase = sumPositiveAssets(
    accountTypeList(),
    (a) => minor(balanceCache.get(a.id, nextDayOfEnd))
  )
  const negativeAssetBalances = allAccounts
    .filter(a => a.type === 'asset')
    .map(a => balanceCache.get(a.id, nextDayOfEnd))
    .filter(balance => balance < 0)
  const excludedNegativeAssetCount = negativeAssetBalances.length
  const excludedNegativeAssets = neg(sum(negativeAssetBalances.map((balance) => balance as Minor)))

  const investmentRatio = ratioBase !== 0 ? (endValue / ratioBase) * 100 : 0

  const valueChange = sub(endValue, startValue)

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

  // 构建每个投资账户的资产细分数据（先算，供账户/分类明细复用 items）
  const accountDetails = investmentAccounts.map(a => ({
    id: a.id,
    name: a.name,
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
    buildStaleAccounts(accountDetails, endDate),
  ])

  // 账户持仓明细索引：账户无资产类别/无快照时 items 为空数组，不用缺字段表达
  const itemsByAccount = new Map(byAccountAllocation.map(detail => [detail.accountId, detail.items]))

  // 按分类汇总
  const categoryMap = new Map<string, { category: { id: string; name: string }; accounts: AccountWithCategory[] }>()

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
    const categoryBalance = sum(data.accounts.map((a) => (balanceCache.get(a.id, nextDayOfEnd) ?? 0) as Minor))

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
        balance,
        ratio: accountRatio,
        totalInvested: accInvested,
        totalWithdrawn: accWithdrawn,
        maxCapitalEmployed: accMaxCapital,
        simpleReturnRate: accReturnRate,
        cumulativeReturnRate: accCumulativeReturnRate,
        items: itemsByAccount.get(account.id) ?? [],
      }
    })

    byCategory.push({
      categoryId,
      categoryName: data.category.name,
      balance: categoryBalance,
      ratio,
      accounts: accountDetails,
      items: mergeCategoryItems(accountDetails.flatMap(detail => detail.items)),
    })
  }

  byCategory.sort((a, b) => b.balance - a.balance)

  // 生成趋势数据（使用缓存）
  const trend: InvestmentTrendItem[] = []
  for (let i = 0; i < monthDates.length; i++) {
    const nextMonthStart = monthDates[i]
    const monthStr = `${nextMonthStart.getFullYear()}-${String(nextMonthStart.getMonth() + 1).padStart(2, '0')}`

    const investment = minor(balanceCache.getMany(investmentAccountIds, nextMonthStart))

    const { netWorth } = sumAssetsLiabilities(
      accountTypeList(),
      (a) => minor(balanceCache.get(a.id, nextMonthStart))
    )
    // 与报表头部的投资占比同口径：分母只取正余额资产。
    const ratioBase = sumPositiveAssets(
      accountTypeList(),
      (a) => minor(balanceCache.get(a.id, nextMonthStart))
    )

    const ratio = ratioBase !== 0 ? (investment / ratioBase) * 100 : 0

    trend.push({
      month: monthStr,
      investment,
      netWorth,
      ratio,
    })
  }

  logger.info({ action: 'generate', report: 'investment-analysis', period: `${startDateStr}~${endDateStr}`, durationMs: Date.now() - startTime }, 'report generated')

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    totalInvestment: endValue,
    totalAssets,
    ratioBase,
    excludedNegativeAssetCount,
    excludedNegativeAssets,
    investmentRatio,
    accountCount: investmentAccounts.length,
    returnAnalysis,
    byCategory,
    trend,
    byAccountAllocation,
    staleAccounts,
  }
}
