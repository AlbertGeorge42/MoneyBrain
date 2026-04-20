import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { toDecimal, ZERO } from '../../utils/decimal.js'

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
      const inAmount = amount.minus(fee).plus(coupon)
      cashFlows.push({
        date: t.date,
        amount: inAmount.negated().toNumber(),
        type: 'buy',
        accountId: t.toAccountId!,
        accountName: accountMap.get(t.toAccountId!) || '未知账户',
      })
    } else if (isFromInvestment && !isToInvestment) {
      const outAmount = amount.plus(fee).minus(coupon)
      cashFlows.push({
        date: t.date,
        amount: outAmount.toNumber(),
        type: 'sell',
        accountId: t.accountId,
        accountName: accountMap.get(t.accountId) || '未知账户',
      })
    }
  }

  cashFlows.sort((a, b) => a.date.getTime() - b.date.getTime())

  return cashFlows
}

function calculateXIRR(
  startValue: number,
  cashFlows: CashFlow[],
  endValue: number,
  startDate: Date,
  endDate: Date
): number | null {
  const allFlows = [
    { date: startDate, amount: -startValue },
    ...cashFlows.map(cf => ({ date: cf.date, amount: cf.amount })),
    { date: endDate, amount: endValue },
  ]

  if (allFlows.length < 2) return null

  const dates = allFlows.map(cf => cf.date)
  const amounts = allFlows.map(cf => cf.amount)
  const firstDate = dates[0]

  const npv = (rate: number): number => {
    return amounts.reduce((sum, amount, i) => {
      const days = (dates[i].getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      const yearFraction = days / 365
      if (yearFraction < 0) return sum
      const discountFactor = Math.pow(1 + rate, yearFraction)
      return sum + amount / discountFactor
    }, 0)
  }

  const npvDerivative = (rate: number): number => {
    return amounts.reduce((sum, amount, i) => {
      const days = (dates[i].getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24)
      const yearFraction = days / 365
      if (yearFraction < 0) return sum
      const discountFactor = Math.pow(1 + rate, yearFraction)
      return sum - (amount * yearFraction) / (discountFactor * (1 + rate))
    }, 0)
  }

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
  if (Math.abs(bestResult) > 10) return null

  return bestResult * 100
}

async function calculateTWR(
  accountIds: string[],
  startValue: number,
  cashFlows: CashFlow[],
  startDate: Date,
  endDate: Date
): Promise<{ twr: number | null; annualizedTwr: number | null }> {
  const investmentDays = Math.max(1, (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

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

  let prevValue = startValue
  let prevDate = startDate

  const sortedFlows = [...cashFlows].sort((a, b) => a.date.getTime() - b.date.getTime())

  for (const currentCF of sortedFlows) {
    const currentDate = currentCF.date

    if (currentDate.getTime() <= prevDate.getTime()) continue

    const balanceBeforeCF = await getBalanceCached(currentDate)

    const endValue = balanceBeforeCF

    if (prevValue > 0 && endValue >= 0) {
      const periodReturn = (endValue - prevValue) / prevValue
      const clampedReturn = Math.max(-0.99, Math.min(10, periodReturn))
      twr *= (1 + clampedReturn)
    }

    prevValue = balanceBeforeCF - currentCF.amount
    prevDate = currentDate
  }

  if (prevDate < endDate) {
    const endValue = await getBalanceCached(endDate)
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

async function getTotalBalanceAtDate(accountIds: string[], targetDate: Date): Promise<number> {
  const balances = await Promise.all(
    accountIds.map(id => calculateBalanceAtDate(id, targetDate))
  )
  return balances.reduce((sum, b) => sum + b, 0)
}

async function calculateAccountCashFlowsInRange(
  accountId: string,
  startDate: Date,
  endDate: Date,
  allInvestmentAccountIds: string[]
): Promise<{ periodInvested: number; periodWithdrawn: number }> {
  let periodInvested = ZERO
  let periodWithdrawn = ZERO

  const transfers = await prisma.transaction.findMany({
    where: {
      type: 'transfer',
      date: {
        gte: startDate,
        lte: endDate,
      },
      OR: [
        { accountId: accountId },
        { toAccountId: accountId },
      ],
    },
  })

  for (const t of transfers) {
    const amount = t.amount
    const fee = toDecimal(t.fee)
    const coupon = toDecimal(t.coupon)
    const isToInvestment = allInvestmentAccountIds.includes(t.toAccountId || '')
    const isFromInvestment = allInvestmentAccountIds.includes(t.accountId)

    if (t.toAccountId === accountId && !isFromInvestment) {
      periodInvested = periodInvested.plus(amount.minus(fee).plus(coupon))
    } else if (t.accountId === accountId && !isToInvestment) {
      periodWithdrawn = periodWithdrawn.plus(amount.plus(fee).minus(coupon))
    }
  }

  return { periodInvested: periodInvested.toNumber(), periodWithdrawn: periodWithdrawn.toNumber() }
}

async function generateTrendData(
  accountIds: string[],
  startDate: Date,
  endDate: Date
): Promise<InvestmentTrendItem[]> {
  const trend: InvestmentTrendItem[] = []
  
  const startMonth = new Date(startDate.getFullYear(), startDate.getMonth(), 1)
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1)
  
  let currentMonth = startMonth
  
  while (currentMonth <= endMonth) {
    const monthStr = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`

    // 计算月末余额：使用下月初，因为 calculateBalanceAtDate 使用 lt: targetDate
    const nextMonthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    const investment = await getTotalBalanceAtDate(accountIds, nextMonthStart)

    const allAccounts = await prisma.account.findMany()
    const allBalances = await Promise.all(
      allAccounts.map(a => calculateBalanceAtDate(a.id, nextMonthStart))
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
    
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
  }

  return trend
}

export async function generateInvestmentAnalysis(startDateStr: string, endDateStr: string): Promise<InvestmentAnalysisResult | null> {
  const startDate = new Date(`${startDateStr}T00:00:00`)
  const endDate = new Date(`${endDateStr}T23:59:59.999`)

  const investmentAccounts = await getInvestmentAccounts()

  if (investmentAccounts.length === 0) {
    return null
  }

  const accountIds = investmentAccounts.map(a => a.id)

  const startBalances = await Promise.all(
    accountIds.map(id => calculateBalanceAtDate(id, startDate))
  )
  const startValue = startBalances.reduce((sum, b) => sum + b, 0)

  // 期末余额计算：使用下一天，因为 calculateBalanceAtDate 使用 lt: targetDate
  const nextDayOfEnd = new Date(endDateStr)
  nextDayOfEnd.setDate(nextDayOfEnd.getDate() + 1)
  const endBalances = await Promise.all(
    accountIds.map(id => calculateBalanceAtDate(id, nextDayOfEnd))
  )
  const endValue = endBalances.reduce((sum, b) => sum + b, 0)

  const allAccounts = await prisma.account.findMany()
  const allBalances = await Promise.all(
    allAccounts.map(a => calculateBalanceAtDate(a.id, nextDayOfEnd))
  )
  const totalAssets = allBalances
    .filter((_, idx) => allAccounts[idx].type === 'asset')
    .reduce((sum, b) => sum + b, 0)
  const totalLiabilities = allBalances
    .filter((_, idx) => allAccounts[idx].type === 'liability')
    .reduce((sum, b) => sum + b, 0)
  const totalNetWorth = totalAssets + totalLiabilities

  const investmentRatio = totalAssets !== 0 ? (endValue / totalAssets) * 100 : 0

  const cashFlows = await getCashFlowsInRange(accountIds, startDate, endDate)

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

        const accStartBalance = idx !== -1 ? startBalances[idx] : 0
        const accEndBalance = balance
        
        const { periodInvested: accInvested, periodWithdrawn: accWithdrawn } =
          await calculateAccountCashFlowsInRange(account.id, startDate, endDate, accountIds)

        const accNetCashFlow = accInvested - accWithdrawn
        const accPeriodReturn = accEndBalance - accStartBalance - accNetCashFlow
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
