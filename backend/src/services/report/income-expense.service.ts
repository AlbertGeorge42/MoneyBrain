import { prisma } from '../../index.js'
import { calculateBalancesBatch } from '../balance.service.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { ZERO, rootLogger } from '../../common/index.js'
import {
  dayStart,
  dayEnd,
  nextDay,
  getPredictionsIfFuture,
  computePredictedAssetsLiabilities,
  sumAssetsLiabilities,
  PREDICTION_NOTE_DEFAULT,
} from './report.utils.js'

const logger = rootLogger.child({ module: 'report' })

export interface CategoryBreakdownItem {
  name: string
  actual: number
  predicted: number
  categoryId: string
  hasChildren: boolean
  sort: number
  icon?: string | null
  children?: CategoryBreakdownItem[]
}

export interface ReportValue {
  actual: number
  predicted: number
}

export interface IncomeExpenseResult {
  startDate: string
  endDate: string
  income: ReportValue
  expense: ReportValue
  balance: ReportValue
  incomeByCategory: Record<string, number>
  expenseByCategory: Record<string, number>
  incomeCategoryDetails: CategoryBreakdownItem[]
  expenseCategoryDetails: CategoryBreakdownItem[]
  startAssets: ReportValue
  startLiabilities: ReportValue
  startNetWorth: ReportValue
  endAssets: ReportValue
  endLiabilities: ReportValue
  endNetWorth: ReportValue
  assetChange: ReportValue
  predictionNote?: string
}


export async function generateIncomeExpense(startDate: string, endDate: string, includePredictions?: boolean): Promise<IncomeExpenseResult> {
  const startTime = Date.now()
  const start = dayStart(startDate)
  const end = dayEnd(endDate)
  const startDay = new Date(start)
  const endDayNext = nextDay(endDate)

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      isAdjustment: false,
      type: { in: ['income', 'expense', 'refund'] },
      amount: { not: 0 },
    },
    include: { category: true, account: true },
  })

  // 收入/支出按交易类型分别累加；退款按 relatedType 单独累加，最后在汇总时从对应侧扣减。
  // 退款金额 = amount - fee，与 transaction.service.ts 的 getTransactionStats 保持一致。
  let aIncome = ZERO
  let aExpense = ZERO
  let aIncomeRefund = ZERO
  let aExpenseRefund = ZERO

  transactions.forEach(t => {
    if (t.type === 'income') {
      aIncome = aIncome.plus(t.amount)
    } else if (t.type === 'expense') {
      aExpense = aExpense.plus(t.amount)
    } else if (t.type === 'refund') {
      const refundAmount = t.amount.minus(t.fee)
      if (t.relatedType === 'income') {
        aIncomeRefund = aIncomeRefund.plus(refundAmount)
      } else if (t.relatedType === 'expense') {
        aExpenseRefund = aExpenseRefund.plus(refundAmount)
      }
    }
  })

  // 净收入/净支出：扣除对应侧的退款
  const netIncome = aIncome.minus(aIncomeRefund)
  const netExpense = aExpense.minus(aExpenseRefund)

  let pIncome = ZERO
  let pExpense = ZERO
  let predictionNote: string | undefined

  const predictedById: Record<string, Decimal> = {}

  // 合并获取预测数据（一次查询替代原来的两次）
  const predictions = await getPredictionsIfFuture(startDate, endDate, !!includePredictions)

  if (predictions.length > 0) {
    // 注意：predictions 来自 getPredictionsIfFuture，覆盖范围是 [now, endDate]，
    // 并不是 [startDate, endDate]。这里必须按 [startDay, endDayNext) 过滤，
    // 否则跨月查询（如 7月→8月）会把前面月份的预测再次累加，
    // 导致 income/expense/balance 表现为"累加值"而非"期内值"。
    const rangeStart = start.getTime()
    const rangeEnd = endDayNext.getTime()
    predictions.forEach(p => {
      const t = p.date.getTime()
      if (t < rangeStart || t >= rangeEnd) return
      // 转账不是收入或支出，不应该计入收入支出报表
      if (p.type === 'transfer') return
      if (p.type === 'income') {
        pIncome = pIncome.plus(p.amount)
      } else if (p.type === 'expense') {
        pExpense = pExpense.plus(p.amount)
      }
      if (p.categoryId) {
        predictedById[p.categoryId] = (predictedById[p.categoryId] || ZERO).plus(p.amount)
      }
    })
    predictionNote = PREDICTION_NOTE_DEFAULT
  }

  const actualBalance = netIncome.minus(netExpense)
  const predictedBalance = pIncome.minus(pExpense)

  const incomeByCategory: Record<string, Decimal> = {}
  const expenseByCategory: Record<string, Decimal> = {}

  const allCategories = await prisma.transactionCategory.findMany({
    orderBy: { sort: 'asc' },
  })

  const categoryMap = new Map(allCategories.map(c => [c.id, c]))
  const childrenOf = new Map<string | null, typeof allCategories>()
  for (const cat of allCategories) {
    const key = cat.parentId ?? null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key)!.push(cat)
  }

  const leafActualIncome: Record<string, Decimal> = {}
  const leafActualExpense: Record<string, Decimal> = {}
  // 退款按原交易类型分桶：在 buildTree 时从对应侧扣减
  const leafActualIncomeRefund: Record<string, Decimal> = {}
  const leafActualExpenseRefund: Record<string, Decimal> = {}
  const leafPredictedIncome: Record<string, Decimal> = {}
  const leafPredictedExpense: Record<string, Decimal> = {}

  transactions.forEach(t => {
    const catId = t.categoryId ?? 'uncategorized'
    if (t.type === 'income') {
      leafActualIncome[catId] = (leafActualIncome[catId] || ZERO).plus(t.amount)
    } else if (t.type === 'expense') {
      leafActualExpense[catId] = (leafActualExpense[catId] || ZERO).plus(t.amount)
    } else if (t.type === 'refund') {
      // 退款继承原交易分类；按 relatedType 计入对应侧的退款桶
      const refundAmount = t.amount.minus(t.fee)
      if (t.relatedType === 'income') {
        leafActualIncomeRefund[catId] = (leafActualIncomeRefund[catId] || ZERO).plus(refundAmount)
      } else if (t.relatedType === 'expense') {
        leafActualExpenseRefund[catId] = (leafActualExpenseRefund[catId] || ZERO).plus(refundAmount)
      }
    }
  })

  for (const [catId, pAmount] of Object.entries(predictedById)) {
    const cat = categoryMap.get(catId)
    if (!cat) continue
    // 转账分类不应该出现在收入支出报表中
    if (cat.type === 'transfer') continue
    const target = cat.type === 'income' ? leafPredictedIncome : leafPredictedExpense
    target[catId] = (target[catId] || ZERO).plus(pAmount)
  }

  function buildTree(type: 'income' | 'expense', parentId: string | null): CategoryBreakdownItem[] {
    const kids = childrenOf.get(parentId) ?? []
    const result: CategoryBreakdownItem[] = []

    for (const cat of kids) {
      // 过滤：只处理匹配类型的分类
      if (cat.type !== type) continue

      const childLeaves = buildTree(type, cat.id)
      // hasChildren 基于真实分类层级：分类表里只要有子分类就视为可下钻
      const hasChildren = (childrenOf.get(cat.id) ?? []).length > 0

      // 自身实际 = 自身收入/支出 - 对应侧退款；预测侧无退款
      const ownActual = (type === 'income' ? leafActualIncome : leafActualExpense)[cat.id] ?? ZERO
      const ownRefund = (type === 'income' ? leafActualIncomeRefund : leafActualExpenseRefund)[cat.id] ?? ZERO
      const catActual = ownActual.minus(ownRefund)
      const catPredicted = (type === 'income' ? leafPredictedIncome : leafPredictedExpense)[cat.id] ?? ZERO
      const hasOwnData = !catActual.isZero() || !catPredicted.isZero()

      // 无自身数据且子树无产出 → 完全空节点，跳过
      if (!hasOwnData && childLeaves.length === 0) continue

      const childrenActual = childLeaves.reduce((s, c) => s + c.actual, 0)
      const childrenPredicted = childLeaves.reduce((s, c) => s + c.predicted, 0)

      result.push({
        name: cat.name,
        actual: catActual.toNumber() + childrenActual,
        predicted: catPredicted.toNumber() + childrenPredicted,
        categoryId: cat.id,
        hasChildren,
        sort: cat.sort,
        icon: cat.icon,
        children: childLeaves.length > 0 ? childLeaves : undefined,
      })
    }

    return result.sort((a, b) => a.sort - b.sort)
  }

  const incomeCategoryDetails: CategoryBreakdownItem[] = buildTree('income', null)
  const expenseCategoryDetails: CategoryBreakdownItem[] = buildTree('expense', null)

  for (const [catId, amount] of Object.entries(leafActualIncome)) {
    const cat = categoryMap.get(catId)
    incomeByCategory[cat?.name ?? '未分类'] = (incomeByCategory[cat?.name ?? '未分类'] || ZERO).plus(amount)
  }
  // 收入侧退款需要从同分类的收入中扣减
  for (const [catId, refund] of Object.entries(leafActualIncomeRefund)) {
    const cat = categoryMap.get(catId)
    incomeByCategory[cat?.name ?? '未分类'] = (incomeByCategory[cat?.name ?? '未分类'] || ZERO).minus(refund)
  }
  for (const [catId, amount] of Object.entries(leafActualExpense)) {
    const cat = categoryMap.get(catId)
    expenseByCategory[cat?.name ?? '未分类'] = (expenseByCategory[cat?.name ?? '未分类'] || ZERO).plus(amount)
  }
  // 支出侧退款需要从同分类的支出中扣减
  for (const [catId, refund] of Object.entries(leafActualExpenseRefund)) {
    const cat = categoryMap.get(catId)
    expenseByCategory[cat?.name ?? '未分类'] = (expenseByCategory[cat?.name ?? '未分类'] || ZERO).minus(refund)
  }

  const accounts = await prisma.account.findMany()

  // 期初/期末余额查询
  const allAccountIds = accounts.map(a => a.id)
  const balanceCache = await calculateBalancesBatch(allAccountIds, [startDay, endDayNext])

  // 期初期末资产/负债/净资产
  const accountGetValue = (account: { id: string; type: string }, date: Date) =>
    balanceCache.get(account.id, date)

  const startResult = sumAssetsLiabilities(
    accounts.map(a => ({ id: a.id, type: a.type })),
    (a) => accountGetValue(a, startDay)
  )
  const endResult = sumAssetsLiabilities(
    accounts.map(a => ({ id: a.id, type: a.type })),
    (a) => accountGetValue(a, endDayNext)
  )

  const actualStartAssets = startResult.assets
  const actualStartLiabilitiesBalance = startResult.liabilities
  const actualStartLiabilities = Math.abs(actualStartLiabilitiesBalance)
  const actualStartNetWorth = startResult.netWorth

  const actualEndAssets = endResult.assets
  const actualEndLiabilitiesBalance = endResult.liabilities
  const actualEndLiabilities = Math.abs(actualEndLiabilitiesBalance)
  const actualEndNetWorth = endResult.netWorth

  // 预测资产/负债变动（统一调用 computePredictedAssetsLiabilities，
  // 历史/当前/未来场景共用同一份逻辑）
  // timePoint 减 1ms：filterPredictionsUpTo 用 <=，而 calculateBalancesBatch 用 <，
  // 减 1ms 使两者语义对齐，避免期初/期末当天的预测被重复计算或遗漏。
  const accountLookup = new Map(accounts.map(a => [a.id, a]))
  const startPredicted = computePredictedAssetsLiabilities(predictions, new Date(start.getTime() - 1), accountLookup)
  const endPredicted = computePredictedAssetsLiabilities(predictions, new Date(endDayNext.getTime() - 1), accountLookup)

  const predictedStartAssets = startPredicted.assets
  const predictedStartLiabilities = startPredicted.liabilities
  const predictedStartNetWorth = startPredicted.netWorth
  const predictedEndAssets = endPredicted.assets
  const predictedEndLiabilities = endPredicted.liabilities
  const predictedEndNetWorth = endPredicted.netWorth

  const predictedNetWorthChange = predictedEndNetWorth - predictedStartNetWorth
  const actualAssetChange = actualEndNetWorth - actualStartNetWorth

  const incomeByCategoryResult: Record<string, number> = {}
  for (const [k, v] of Object.entries(incomeByCategory)) {
    incomeByCategoryResult[k] = v.toNumber()
  }
  const expenseByCategoryResult: Record<string, number> = {}
  for (const [k, v] of Object.entries(expenseByCategory)) {
    expenseByCategoryResult[k] = v.toNumber()
  }

  return {
    startDate,
    endDate,
    income: { actual: netIncome.toNumber(), predicted: pIncome.toNumber() },
    expense: { actual: netExpense.toNumber(), predicted: pExpense.toNumber() },
    balance: { actual: actualBalance.toNumber(), predicted: predictedBalance.toNumber() },
    incomeByCategory: incomeByCategoryResult,
    expenseByCategory: expenseByCategoryResult,
    incomeCategoryDetails,
    expenseCategoryDetails,
    startAssets: { actual: actualStartAssets, predicted: predictedStartAssets },
    startLiabilities: { actual: actualStartLiabilities, predicted: predictedStartLiabilities },
    startNetWorth: { actual: actualStartNetWorth, predicted: predictedStartNetWorth },
    endAssets: { actual: actualEndAssets, predicted: predictedEndAssets },
    endLiabilities: { actual: actualEndLiabilities, predicted: predictedEndLiabilities },
    endNetWorth: { actual: actualEndNetWorth, predicted: predictedEndNetWorth },
    assetChange: { actual: actualAssetChange, predicted: predictedNetWorthChange },
    predictionNote,
  }
  logger.info({ action: 'generate', report: 'income-expense', period: `${startDate}~${endDate}`, durationMs: Date.now() - startTime }, 'report generated')
}
