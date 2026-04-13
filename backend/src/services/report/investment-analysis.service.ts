import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'

/**
 * 现金流记录
 * amount: 负数表示投入（买入），正数表示取出（卖出）
 */
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
  category: { id: string; name: string; icon: string | null } | null
  icon: string | null
  initialBalance: { toNumber: () => number }
  initialBalanceDate: Date | null
  createdAt: Date
}

interface InvestmentAccountDetail {
  id: string
  name: string
  categoryId: string | null
  categoryName: string
  categoryIcon: string | null
  icon: string | null
  balance: number
  ratio: number
  totalInvested: number
  totalWithdrawn: number
  simpleReturnRate: number
}

interface InvestmentCategorySummary {
  categoryId: string
  categoryName: string
  icon: string | null
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
  simpleReturnRate: number
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
}

/**
 * 获取所有投资账户
 */
async function getInvestmentAccounts(): Promise<AccountWithCategory[]> {
  const investmentCategories = await prisma.accountCategory.findMany({
    where: { isInvestment: true },
  })

  if (investmentCategories.length === 0) {
    return []
  }

  const categoryIds = investmentCategories.map(c => c.id)

  const accounts = await prisma.account.findMany({
    where: { categoryId: { in: categoryIds } },
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
  })

  return accounts as AccountWithCategory[]
}

/**
 * 获取指定日期范围内的现金流
 * 
 * 现金流定义：
 * 1. 买入：非投资账户 → 投资账户的转账
 * 2. 卖出：投资账户 → 非投资账户的转账
 * 
 * 不计入现金流：
 * - 投资账户之间的转账（内部资金移动）
 * - 分红（默认再投资，体现在余额中）
 * - 净值变动记录（市场价值变化）
 */
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

  // 处理买入卖出转账（只处理投资账户与非投资账户之间的转账）
  const transfers = await prisma.transaction.findMany({
    where: {
      type: 'transfer',
      date: {
        gte: startDate,
        lt: endDate,
      },
      OR: [
        { accountId: { in: accountIds } },
        { toAccountId: { in: accountIds } },
      ],
    },
    orderBy: { date: 'asc' },
  })

  for (const t of transfers) {
    const tAmount = t.amount.toNumber()
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    const isToInvestment = accountIds.includes(t.toAccountId || '')
    const isFromInvestment = accountIds.includes(t.accountId)

    // 只处理投资账户与非投资账户之间的转账
    if (isToInvestment && !isFromInvestment) {
      // 非投资账户 → 投资账户：买入（投入）
      // 投资账户实际到账 = amount - fee + coupon（与 calculateTransferInAmount 一致）
      const inAmount = tAmount - fee + coupon
      cashFlows.push({
        date: t.date,
        amount: -inAmount,  // 负数表示投入
        type: 'buy',
        accountId: t.toAccountId!,
        accountName: accountMap.get(t.toAccountId!) || '未知账户',
      })
    } else if (isFromInvestment && !isToInvestment) {
      // 投资账户 → 非投资账户：卖出（取出）
      // 投资账户实际扣款 = amount + fee - coupon（与 calculateBalanceChange('transfer') 一致）
      const outAmount = tAmount + fee - coupon
      cashFlows.push({
        date: t.date,
        amount: outAmount,  // 正数表示取出
        type: 'sell',
        accountId: t.accountId,
        accountName: accountMap.get(t.accountId) || '未知账户',
      })
    }
    // 投资账户之间的转账忽略
  }

  // 按日期排序
  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())

  return cashFlows
}

/**
 * 计算 XIRR（年化内部收益率）
 * 
 * 使用牛顿迭代法求解 NPV = 0 时的年化收益率
 * NPV = Σ(CF_i / (1 + r)^((d_i - d_0)/365))
 */
function calculateXIRR(
  startValue: number,
  cashFlows: CashFlow[],
  endValue: number,
  startDate: Date,
  endDate: Date
): number | null {
  // 构建现金流序列：期初值（负）+ 期间现金流 + 期末值（正）
  const allFlows = [
    { date: startDate, amount: -startValue },  // 期初投入
    ...cashFlows.map(cf => ({ date: cf.date, amount: cf.amount })),
    { date: endDate, amount: endValue },  // 期末价值
  ]

  if (allFlows.length < 2) return null

  const dates = allFlows.map(cf => cf.date)
  const amounts = allFlows.map(cf => cf.amount)
  const firstDate = dates[0]

  // NPV 函数
  const npv = (rate: number): number => {
    return amounts.reduce((sum, amount, i) => {
      const days = (dates[i].getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      const yearFraction = days / 365
      if (yearFraction < 0) return sum
      const discountFactor = Math.pow(1 + rate, yearFraction)
      return sum + amount / discountFactor
    }, 0)
  }

  // NPV 对 rate 的导数
  const npvDerivative = (rate: number): number => {
    return amounts.reduce((sum, amount, i) => {
      const days = (dates[i].getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      const yearFraction = days / 365
      if (yearFraction < 0) return sum
      const discountFactor = Math.pow(1 + rate, yearFraction)
      return sum - (amount * yearFraction) / (discountFactor * (1 + rate))
    }, 0)
  }

  // 尝试多个初始猜测值
  const guesses = [-0.9, -0.5, -0.1, 0.0, 0.05, 0.1, 0.2, 0.5, 1.0]
  let bestResult: number | null = null
  let bestNpv = Infinity

  for (const guess of guesses) {
    let rate = guess

    for (let iter = 0; iter < 200; iter++) {
      const npvValue = npv(rate)
      const derivative = npvDerivative(rate)

      if (!isFinite(npvValue) || !isFinite(derivative)) break
      if (Math.abs(derivative) < 1e-12) break

      const newRate = rate - npvValue / derivative

      // 防止发散
      if (!isFinite(newRate) || Math.abs(newRate) > 50) break

      if (Math.abs(newRate - rate) < 1e-8) {
        const finalNpv = Math.abs(npv(newRate))
        if (finalNpv < bestNpv && finalNpv < 1) {
          bestNpv = finalNpv
          bestResult = newRate
        }
        break
      }

      rate = newRate
    }
  }

  if (bestResult === null || !isFinite(bestResult)) return null
  if (Math.abs(bestResult) > 10) return null  // 年化收益率超过 1000% 视为异常

  return bestResult * 100
}

/**
 * 计算 TWR（时间加权收益率）
 * 
 * TWR = (1 + r1) × (1 + r2) × ... × (1 + rn) - 1
 * 
 * 期初值作为投资起点，期间现金流作为分割点
 */
async function calculateTWR(
  accountIds: string[],
  startValue: number,
  cashFlows: CashFlow[],
  startDate: Date,
  endDate: Date
): Promise<{ twr: number | null; annualizedTwr: number | null }> {
  const investmentDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  // 余额缓存
  const balanceCache = new Map<string, number>()
  
  const getBalanceCached = async (d: Date): Promise<number> => {
    const key = d.toISOString()
    if (!balanceCache.has(key)) {
      const bal = await getTotalBalanceAtDate(accountIds, d)
      balanceCache.set(key, bal)
    }
    return balanceCache.get(key) || 0
  }

  let twr = 1

  // 期初值作为投资起点
  let prevValue = startValue
  let prevDate = startDate

  // 按日期排序的现金流
  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())

  // 现金流作为子期间分割点
  for (const currentCF of sortedFlows) {
    const currentDate = currentCF.date

    if (currentDate.getTime() <= prevDate.getTime()) continue

    // 当天余额（使用 lt: currentDate，即现金流发生前的余额）
    const balanceBeforeCF = await getBalanceCached(currentDate)

    // 期末值 = 现金流发生前的余额
    const endValue = balanceBeforeCF

    // 计算子期间收益率
    if (prevValue > 0 && endValue >= 0) {
      const periodReturn = (endValue - prevValue) / prevValue
      const clampedReturn = Math.max(-0.99, Math.min(10, periodReturn))
      twr *= (1 + clampedReturn)
    }

    // 下一期的期初值 = 现金流发生后的余额
    // 买入：CF.amount 为负数，portfolio += |CF.amount|，故 after = before - CF.amount
    // 卖出：CF.amount 为正数，portfolio -= CF.amount，故 after = before - CF.amount
    prevValue = balanceBeforeCF - currentCF.amount
    prevDate = currentDate
  }

  // 最后一个子期间：从最后一笔现金流到结束日期
  if (prevDate < endDate) {
    const endValue = await getBalanceCached(endDate)
    if (prevValue > 0 && endValue >= 0) {
      const periodReturn = (endValue - prevValue) / prevValue
      const clampedReturn = Math.max(-0.99, Math.min(10, periodReturn))
      twr *= (1 + clampedReturn)
    }
  }

  twr = twr - 1

  // 边界检查
  if (!isFinite(twr) || Math.abs(twr) > 50) {
    return { twr: null, annualizedTwr: null }
  }

  // 年化 TWR
  const annualizedTwr = Math.pow(1 + twr, 365 / investmentDays) - 1

  if (!isFinite(annualizedTwr) || Math.abs(annualizedTwr) > 50) {
    return { twr: twr * 100, annualizedTwr: null }
  }

  return {
    twr: twr * 100,
    annualizedTwr: annualizedTwr * 100,
  }
}

/**
 * 获取指定日期的投资账户总余额
 */
async function getTotalBalanceAtDate(accountIds: string[], targetDate: Date): Promise<number> {
  const balances = await Promise.all(
    accountIds.map(id => calculateBalanceAtDate(id, targetDate))
  )
  return balances.reduce((sum, b) => sum + b, 0)
}

/**
 * 计算单个账户的现金流统计
 */
async function calculateAccountCashFlowsInRange(
  accountId: string,
  startDate: Date,
  endDate: Date,
  allInvestmentAccountIds: string[]
): Promise<{ periodInvested: number; periodWithdrawn: number }> {
  let periodInvested = 0
  let periodWithdrawn = 0

  // 处理买入卖出转账
  const transfers = await prisma.transaction.findMany({
    where: {
      type: 'transfer',
      date: {
        gte: startDate,
        lt: endDate,
      },
      OR: [
        { accountId: accountId },
        { toAccountId: accountId },
      ],
    },
  })

  for (const t of transfers) {
    const tAmount = t.amount.toNumber()
    const fee = t.fee?.toNumber() || 0
    const coupon = t.coupon?.toNumber() || 0
    const isToInvestment = allInvestmentAccountIds.includes(t.toAccountId || '')
    const isFromInvestment = allInvestmentAccountIds.includes(t.accountId)

    if (t.toAccountId === accountId && !isFromInvestment) {
      // 买入：投资账户实际到账 = amount - fee + coupon
      periodInvested += tAmount - fee + coupon
    } else if (t.accountId === accountId && !isToInvestment) {
      // 卖出：投资账户实际扣款 = amount + fee - coupon
      periodWithdrawn += tAmount + fee - coupon
    }
  }

  return { periodInvested, periodWithdrawn }
}

/**
 * 生成趋势数据
 */
async function generateTrendData(
  accountIds: string[],
  startDate: Date,
  endDate: Date
): Promise<InvestmentTrendItem[]> {
  const trend: InvestmentTrendItem[] = []
  
  // 生成从开始月份到结束月份的趋势
  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  
  let currentMonth = startMonth
  
  while (currentMonth <= endMonth) {
    const monthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`

    const investment = await getTotalBalanceAtDate(accountIds, currentMonth)

    const allAccounts = await prisma.account.findMany()
    const allBalances = await Promise.all(
      allAccounts.map(a => calculateBalanceAtDate(a.id, currentMonth))
    )
    const assets = allBalances
      .filter((_, idx) => allAccounts[idx].type === 'asset')
      .reduce((sum, b) => sum + b, 0)
    const liabilities = allBalances
      .filter((_, idx) => allAccounts[idx].type === 'liability')
      .reduce((sum, b) => sum + b, 0)
    const netWorth = assets + liabilities

    const ratio = assets !== 0 ? (investment / assets) * 100 : 0

    trend.push({
      month: monthStr,
      investment,
      netWorth,
      ratio,
    })
    
    // 移动到下个月
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
  }

  return trend
}

/**
 * 生成投资分析报告
 */
export async function generateInvestmentAnalysis(startDateStr: string, endDateStr: string): Promise<InvestmentAnalysisResult | null> {
  const startDate = new Date(`${startDateStr}T00:00:00`)
  const endDate = new Date(`${endDateStr}T00:00:00`)

  const investmentAccounts = await getInvestmentAccounts()

  if (investmentAccounts.length === 0) {
    return null
  }

  const accountIds = investmentAccounts.map(a => a.id)

  // 计算期初余额
  const startBalances = await Promise.all(
    accountIds.map(id => calculateBalanceAtDate(id, startDate))
  )
  const startValue = startBalances.reduce((sum, b) => sum + b, 0)

  // 计算期末余额
  const endBalances = await Promise.all(
    accountIds.map(id => calculateBalanceAtDate(id, endDate))
  )
  const endValue = endBalances.reduce((sum, b) => sum + b, 0)

  // 计算总资产和净资产（期末）
  const allAccounts = await prisma.account.findMany()
  const allBalances = await Promise.all(
    allAccounts.map(a => calculateBalanceAtDate(a.id, endDate))
  )
  const totalAssets = allBalances
    .filter((_, idx) => allAccounts[idx].type === 'asset')
    .reduce((sum, b) => sum + b, 0)
  const totalLiabilities = allBalances
    .filter((_, idx) => allAccounts[idx].type === 'liability')
    .reduce((sum, b) => sum + b, 0)
  const totalNetWorth = totalAssets + totalLiabilities

  const investmentRatio = totalAssets !== 0 ? (endValue / totalAssets) * 100 : 0

  // 获取期间现金流
  const cashFlows = await getCashFlowsInRange(accountIds, startDate, endDate)

  // 计算期间投入和取出
  const periodInvested = cashFlows
    .filter(cf => cf.type === 'buy')
    .reduce((sum, cf) => sum + Math.abs(cf.amount), 0)
  const periodWithdrawn = cashFlows
    .filter(cf => cf.type === 'sell')
    .reduce((sum, cf) => sum + cf.amount, 0)
  const netCashFlow = periodInvested - periodWithdrawn

  // 计算期间收益
  const valueChange = endValue - startValue
  const periodReturn = valueChange - netCashFlow  // 收益 = 价值变化 - 净现金流
  const simpleReturnRate = startValue !== 0 ? (periodReturn / startValue) * 100 : 0

  const investmentDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

  let xirr: number | null = null
  let twrResult: { twr: number | null; annualizedTwr: number | null } = { twr: null, annualizedTwr: null }

  if (investmentDays >= 1) {
    xirr = calculateXIRR(startValue, cashFlows, endValue, startDate, endDate)
    twrResult = await calculateTWR(accountIds, startValue, cashFlows, startDate, endDate)
  }

  const returnAnalysis: InvestmentReturnAnalysis = {
    startValue,
    endValue,
    valueChange,
    periodInvested,
    periodWithdrawn,
    netCashFlow,
    periodReturn,
    simpleReturnRate,
    xirr,
    twr: twrResult.twr,
    annualizedTwr: twrResult.annualizedTwr,
    investmentDays: Math.floor(investmentDays),
    cashFlowCount: cashFlows.length,
  }

  // 按分类汇总（期末）
  const categoryMap = new Map<string, { category: { id: string; name: string; icon: string | null }; accounts: AccountWithCategory[] }>()

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
      const idx = investmentAccounts.findIndex(ia => ia.id === a.id)
      return sum + (idx !== -1 ? endBalances[idx] : 0)
    }, 0)

    const ratio = endValue !== 0 ? (categoryBalance / endValue) * 100 : 0

    const accountDetails: InvestmentAccountDetail[] = await Promise.all(
      data.accounts.map(async (account) => {
        const idx = investmentAccounts.findIndex(ia => ia.id === account.id)
        const balance = idx !== -1 ? endBalances[idx] : 0
        const accountRatio = endValue !== 0 ? (balance / endValue) * 100 : 0

        // 计算该账户的期初和期末余额
        const accStartBalance = idx !== -1 ? startBalances[idx] : 0
        const accEndBalance = balance
        
        // 计算期间现金流
        const { periodInvested: accInvested, periodWithdrawn: accWithdrawn } =
          await calculateAccountCashFlowsInRange(account.id, startDate, endDate, accountIds)

        const accNetCashFlow = accInvested - accWithdrawn
        const accPeriodReturn = accEndBalance - accStartBalance - accNetCashFlow
        // 分母 = 期初余额 + 期间投入，即全部投入的本金
        const totalCapital = accStartBalance + accInvested
        const accReturnRate = totalCapital !== 0 ? (accPeriodReturn / totalCapital) * 100 : 0

        return {
          id: account.id,
          name: account.name,
          categoryId: account.categoryId,
          categoryName: account.category?.name || '未分类',
          categoryIcon: account.category?.icon || null,
          icon: account.icon,
          balance,
          ratio: accountRatio,
          totalInvested: accInvested,
          totalWithdrawn: accWithdrawn,
          simpleReturnRate: accReturnRate,
        }
      })
    )

    byCategory.push({
      categoryId,
      categoryName: data.category.name,
      icon: data.category.icon,
      balance: categoryBalance,
      ratio,
      accounts: accountDetails,
    })
  }

  byCategory.sort((a, b) => b.balance - a.balance)

  const trend = await generateTrendData(accountIds, startDate, endDate)

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
  }
}
