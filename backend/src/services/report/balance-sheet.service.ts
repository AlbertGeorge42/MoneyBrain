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

// 资产负债表 - 分类节点
export interface BalanceSheetCategoryNode {
  id: string  // categoryId
  name: string
  type: 'asset' | 'liability'
  sort: number
  icon: string | null
  color: string | null
  actual: number
  predicted: number
  children: BalanceSheetAccountNode[]
}

// 资产负债表 - 账户节点
export interface BalanceSheetAccountNode {
  id: string  // accountId
  name: string
  categoryId: string
  type: 'asset' | 'liability'
  icon: string | null
  color: string | null
  actual: number
  predicted: number
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
  assetNodes: BalanceSheetCategoryNode[]
  liabilityNodes: BalanceSheetCategoryNode[]
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

  // 构建树形结构：按分类分组
  const categoryNodeMap = new Map<string, BalanceSheetCategoryNode>()

  accountBalances.forEach(account => {
    const categoryId = account.category?.id || 'uncategorized'
    const categoryName = account.category?.name || '未分类'
    const categorySort = account.category?.sort ?? 0

    // 创建分类节点（如果不存在）
    if (!categoryNodeMap.has(categoryId)) {
      categoryNodeMap.set(categoryId, {
        id: categoryId,
        name: categoryName,
        type: account.type as 'asset' | 'liability',
        sort: categorySort,
        icon: account.category?.icon || null,
        color: account.category?.color || null,
        actual: 0,
        predicted: 0,
        children: [],
      })
    }

    const categoryNode = categoryNodeMap.get(categoryId)!

    // 创建账户节点
    const isLiability = account.type === 'liability'
    const accountNode: BalanceSheetAccountNode = {
      id: account.id,
      name: account.name,
      categoryId: categoryId,
      type: account.type as 'asset' | 'liability',
      icon: account.icon || null,
      color: account.color || null,
      actual: isLiability ? -account.balance : account.balance,
      predicted: isLiability ? -(predictedChanges.get(account.id) || 0) : predictedChanges.get(account.id) || 0,
    }

    // 添加到分类节点的children中
    categoryNode.children.push(accountNode)

    // 累加分类节点的值
    categoryNode.actual += accountNode.actual
    categoryNode.predicted += accountNode.predicted
  })

  // 排序并分离资产和负债节点
  const assetNodes = Array.from(categoryNodeMap.values())
    .filter(c => c.type === 'asset')
    .sort((a, b) => a.sort - b.sort)

  const liabilityNodes = Array.from(categoryNodeMap.values())
    .filter(c => c.type === 'liability')
    .sort((a, b) => a.sort - b.sort)

  const dateStr = targetDate.toISOString().split('T')[0]

  return {
    date: dateStr,
    granularity,
    assets: { actual: assets, predicted: predictedAssets },
    liabilities: { actual: liabilities, predicted: predictedLiabilities },
    netWorth: { actual: netWorth, predicted: predictedNetWorth },
    assetsByCategory,
    liabilitiesByCategory,
    assetNodes,
    liabilityNodes,
    predictionNote,
  }
  logger.info({ action: 'generate', report: 'balance-sheet', period: date, durationMs: Date.now() - startTime }, 'report generated')
}
