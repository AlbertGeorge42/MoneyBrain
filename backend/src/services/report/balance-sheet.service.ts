import { prisma } from '../../index.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { generatePredictions } from '../budget.service.js'

export type DateGranularity = 'day' | 'month' | 'year'

export interface BalanceSheetAccount {
  id: string
  name: string
  type: string
  actual: number
  predicted: number
  category: string
  categoryId: string | null
  icon: string | null
  categoryIcon: string | null
  categorySort: number
  accountSort: number
}

export interface ReportValue {
  actual: number
  predicted: number
}

export interface BalanceSheetResult {
  date: string
  granularity: DateGranularity
  assets: ReportValue
  liabilities: ReportValue
  netWorth: ReportValue
  assetsByCategory: Record<string, number>
  liabilitiesByCategory: Record<string, number>
  accounts: BalanceSheetAccount[]
  predictionNote?: string
}

function parseDateParam(date: string): { targetDate: Date; nextDay: Date; granularity: DateGranularity } {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // 日：当天结束
    const targetDate = new Date(`${date}T23:59:59.999`)
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    return { targetDate, nextDay, granularity: 'day' }
  }
  if (/^\d{4}-\d{2}$/.test(date)) {
    // 月：月末
    const [year, month] = date.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const targetDate = new Date(year, month - 1, lastDay, 23, 59, 59, 999)
    const nextDay = new Date(year, month, 1)
    return { targetDate, nextDay, granularity: 'month' }
  }
  if (/^\d{4}$/.test(date)) {
    // 年：年末
    const targetDate = new Date(`${date}-12-31T23:59:59.999`)
    const nextDay = new Date(`${Number(date) + 1}-01-01`)
    return { targetDate, nextDay, granularity: 'year' }
  }
  throw new Error('无效的日期格式，支持格式：YYYY-MM-DD、YYYY-MM、YYYY')
}

export async function generateBalanceSheet(date: string): Promise<BalanceSheetResult> {
  const { targetDate, nextDay, granularity } = parseDateParam(date)
  const now = new Date()

  const categories = await prisma.accountCategory.findMany({
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })

  const accounts = await prisma.account.findMany({
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
  })

  const allAccountIds = accounts.map(a => a.id)
  const balanceCache = await calculateBalancesBatch(allAccountIds, [nextDay])

  const accountBalances = accounts.map(account => ({
    ...account,
    balance: balanceCache.get(account.id, nextDay),
  }))

  const assets = accountBalances
    .filter(a => a.type === 'asset')
    .reduce((sum, a) => sum + a.balance, 0)

  const liabilities = accountBalances
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + a.balance, 0)

  // 预测数据：当目标日期在未来时，计算预测变化
  const predictedChanges: Map<string, number> = new Map()
  let predictionNote: string | undefined

  if (targetDate > now) {
    const predictions = await generatePredictions(
      now.toISOString().split('T')[0],
      targetDate.toISOString().split('T')[0]
    )

    predictions.forEach(p => {
      if (p.type === 'income') {
        predictedChanges.set(p.accountId,
          (predictedChanges.get(p.accountId) || 0) + p.amount)
      }
      if (p.type === 'expense') {
        predictedChanges.set(p.accountId,
          (predictedChanges.get(p.accountId) || 0) - p.amount)
      }
      if (p.type === 'transfer') {
        predictedChanges.set(p.accountId,
          (predictedChanges.get(p.accountId) || 0) - p.amount)
        if (p.toAccountId) {
          predictedChanges.set(p.toAccountId,
            (predictedChanges.get(p.toAccountId) || 0) + p.amount)
        }
      }
    })

    if (predictions.length > 0) {
      predictionNote = '预算影响后的预测值，不含投资收益、资产增值等'
    }
  }

  const netWorth = assets + liabilities

  const predictedAssets = Array.from(predictedChanges.entries())
    .reduce((sum, [accountId, change]) => {
      const account = accounts.find(a => a.id === accountId)
      if (account?.type === 'asset') return sum + change
      return sum
    }, 0)

  const predictedLiabilities = Array.from(predictedChanges.entries())
    .reduce((sum, [accountId, change]) => {
      const account = accounts.find(a => a.id === accountId)
      if (account?.type === 'liability') return sum + change
      return sum
    }, 0)

  const predictedNetWorth = predictedAssets + predictedLiabilities

  const assetsByCategory: Record<string, number> = {}
  const liabilitiesByCategory: Record<string, number> = {}

  accountBalances.forEach(account => {
    const categoryName = account.category?.name || '未分类'
    if (account.type === 'asset') {
      assetsByCategory[categoryName] = (assetsByCategory[categoryName] || 0) + account.balance
    } else {
      liabilitiesByCategory[categoryName] = (liabilitiesByCategory[categoryName] || 0) + Math.abs(account.balance)
    }
  })

  const categoryMap = new Map(categories.map(c => [c.id, c]))

  const sortedAccounts = accountBalances
    .map(a => {
      const cat = a.category ? categoryMap.get(a.category.id) : null
      const predicted = predictedChanges.get(a.id) || 0
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        actual: a.balance,
        predicted,
        category: a.category?.name || '未分类',
        categoryId: a.categoryId,
        icon: a.icon,
        categoryIcon: cat?.icon || null,
        categorySort: cat?.sort ?? 0,
        accountSort: a.sort,
      }
    })
    .sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'asset' ? -1 : 1
      }
      if (a.categorySort !== b.categorySort) {
        return a.categorySort - b.categorySort
      }
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category, 'zh-CN')
      }
      return a.accountSort - b.accountSort
    })

  const dateStr = targetDate.toISOString().split('T')[0]

  return {
    date: dateStr,
    granularity,
    assets: { actual: assets, predicted: predictedAssets },
    liabilities: { actual: liabilities, predicted: predictedLiabilities },
    netWorth: { actual: netWorth, predicted: predictedNetWorth },
    assetsByCategory,
    liabilitiesByCategory,
    accounts: sortedAccounts,
    predictionNote,
  }
}
