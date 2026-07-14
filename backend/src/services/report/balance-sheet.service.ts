import { prisma } from '../../index.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { rootLogger } from '../../common/index.js'
import {
  dayEnd,
  nextDay,
  accumulatePredictionChanges,
  sumPredictionByType,
  sumAssetsLiabilities,
  PREDICTION_NOTE_BALANCE_SHEET,
} from './report.utils.js'
import { generatePredictions } from '../budget.service.js'

const logger = rootLogger.child({ module: 'report' })

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
    const targetDate = dayEnd(date)
    const next = nextDay(date)
    return { targetDate, nextDay: next, granularity: 'day' }
  }
  if (/^\d{4}-\d{2}$/.test(date)) {
    const [year, month] = date.split('-').map(Number)
    const lastDay = new Date(year, month, 0).getDate()
    const targetDate = new Date(year, month - 1, lastDay, 23, 59, 59, 999)
    const next = new Date(year, month, 1)
    return { targetDate, nextDay: next, granularity: 'month' }
  }
  if (/^\d{4}$/.test(date)) {
    const targetDate = dayEnd(`${date}-12-31`)
    const next = nextDay(`${date}-12-31`)
    return { targetDate, nextDay: next, granularity: 'year' }
  }
  throw new Error('无效的日期格式，支持格式：YYYY-MM-DD、YYYY-MM、YYYY')
}

export async function generateBalanceSheet(date: string): Promise<BalanceSheetResult> {
  const startTime = Date.now()
  const { targetDate, nextDay: nextDayDate, granularity } = parseDateParam(date)
  const now = new Date()

  const categories = await prisma.accountCategory.findMany({
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })

  const accounts = await prisma.account.findMany({
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
  })

  const allAccountIds = accounts.map(a => a.id)
  const balanceCache = await calculateBalancesBatch(allAccountIds, [nextDayDate])

  const accountBalances = accounts.map(account => ({
    ...account,
    balance: balanceCache.get(account.id, nextDayDate),
  }))

  // 资产/负债/净资产汇总
  const { assets, liabilities, netWorth } = sumAssetsLiabilities(
    accountBalances.map(a => ({ type: a.type, id: a.id })),
    (a) => accountBalances.find(ab => ab.id === a.id)?.balance ?? 0
  )

  // 预测数据
  // 数据约定：predictedAssets / predictedLiabilities / predictedNetWorth 均为"变化量"
  //   predictedLiabilities > 0 → 未来负债金额增加
  //   predictedLiabilities < 0 → 未来负债金额减少（还债等）
  // sumPredictionByType 返回的 liabilityChange 是"负债账户余额的变化"，
  // 由于负债账户余额在数据库中以负数存储，余额变正意味着负债金额减少，
  // 因此需要取负再写入"负债金额变化"这一语义。
  let predictedAssets = 0
  let predictedLiabilities = 0
  let predictionNote: string | undefined
  let predictedChanges: Map<string, number> = new Map()

  if (targetDate > now) {
    const predictions = await generatePredictions(
      now.toISOString().split('T')[0],
      targetDate.toISOString().split('T')[0]
    )

    if (predictions.length > 0) {
      const accountLookup = new Map(accounts.map(a => [a.id, a]))
      predictedChanges = accumulatePredictionChanges(predictions)
      const predicted = sumPredictionByType(predictedChanges, accountLookup)
      predictedAssets = predicted.assetChange
      predictedLiabilities = -predicted.liabilityChange
      predictionNote = PREDICTION_NOTE_BALANCE_SHEET
    }
  }

  const predictedNetWorth = predictedAssets - predictedLiabilities

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
      // 符号约定：负债账户的 actual/predicted 取反，与 liabilities.actual 正数约定一致
      // 数据库中负债账户余额为负（-2500 表示欠 2500），API 统一为正数表示欠款金额
      const isLiability = a.type === 'liability'
      const rawActual = a.balance
      const rawPredicted = predictedChanges.get(a.id) || 0
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        actual: isLiability ? -rawActual : rawActual,
        predicted: isLiability ? -rawPredicted : rawPredicted,
        category: a.category?.name || '未分类',
        categoryId: a.categoryId,
        icon: a.icon,
        color: a.color,
        categoryIcon: cat?.icon || null,
        categoryColor: cat?.color || null,
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
  logger.info({ action: 'generate', report: 'balance-sheet', period: date, durationMs: Date.now() - startTime }, 'report generated')
}
