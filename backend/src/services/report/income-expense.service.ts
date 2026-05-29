import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { ZERO } from '../../common/index.js'
import { generatePredictions } from '../budget.service.js'

export interface CategoryBreakdownItem {
  name: string
  actual: number
  predicted: number
  categoryId: string
  hasChildren: boolean
  sort: number
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
  startAssets: number
  startLiabilities: number
  startNetWorth: number
  endAssets: number
  endLiabilities: number
  endNetWorth: number
  assetChange: ReportValue
  predictionNote?: string
}

function sum(v: ReportValue): number {
  return v.actual + v.predicted
}

export async function generateIncomeExpense(startDate: string, endDate: string, includePredictions?: boolean): Promise<IncomeExpenseResult> {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)
  const now = new Date()

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      isAdjustment: false,
      type: { in: ['income', 'expense'] },
    },
    include: { category: true, account: true },
  })

  let aIncome = ZERO
  let aExpense = ZERO

  transactions.forEach(t => {
    if (t.type === 'income') {
      aIncome = aIncome.plus(t.amount)
    } else if (t.type === 'expense') {
      aExpense = aExpense.plus(t.amount)
    }
  })

  let pIncome = ZERO
  let pExpense = ZERO
  let predictionNote: string | undefined

  const predictedByCategory: Record<string, Decimal> = {}

  if (includePredictions && end > now) {
    const predictionsStart = start > now ? startDate : now.toISOString().split('T')[0]
    const predictions = await generatePredictions(predictionsStart, endDate)

    predictions.forEach(p => {
      if (p.type === 'income') {
        pIncome = pIncome.plus(p.amount)
      } else if (p.type === 'expense') {
        pExpense = pExpense.plus(p.amount)
      }
    })

    if (predictions.length > 0) {
      predictionNote = '含预算预测数据'
    }
  }

  // 汇总预测交易的分类
  if (includePredictions && end > now) {
    const allCategories = await prisma.transactionCategory.findMany()
    const categoryMap = new Map(allCategories.map(c => [c.id, c]))

    const predictions = await generatePredictions(
      start > now ? startDate : now.toISOString().split('T')[0],
      endDate
    )

    predictions.forEach(p => {
      if (!p.categoryId) return
      const cat = categoryMap.get(p.categoryId)
      if (!cat) return

      let categoryName = cat.name
      if (cat.parentId) {
        const parent = cat.parentId ? categoryMap.get(cat.parentId) : undefined
        if (parent) {
          categoryName = parent.name
        }
      }

      predictedByCategory[categoryName] = (predictedByCategory[categoryName] || ZERO).plus(p.amount)
    })
  }

  const actualBalance = aIncome.minus(aExpense)
  const predictedBalance = pIncome.minus(pExpense)

  const incomeByCategory: Record<string, Decimal> = {}
  const expenseByCategory: Record<string, Decimal> = {}

  const allCategories = await prisma.transactionCategory.findMany({
    orderBy: { sort: 'asc' },
  })
  const categorySortMap = new Map(allCategories.map(c => [c.id, c.sort]))

  const childCategoryIds = transactions
    .filter(t => t.category?.parentId)
    .map(t => t.category!.parentId)
  const uniqueParentIds = [...new Set(childCategoryIds)] as string[]

  let parentMap: Record<string, { name: string; sort: number }> = {}
  if (uniqueParentIds.length > 0) {
    const parentCats = await prisma.transactionCategory.findMany({
      where: { id: { in: uniqueParentIds } },
    })
    parentMap = Object.fromEntries(parentCats.map(p => [p.id, { name: p.name, sort: p.sort }]))
  }

  const incomeCategoryData: Record<string, { actual: Decimal; predicted: Decimal; categoryId: string; sort: number }> = {}
  const expenseCategoryData: Record<string, { actual: Decimal; predicted: Decimal; categoryId: string; sort: number }> = {}

  transactions.forEach(t => {
    let categoryName = '未分类'
    let parentId = ''
    let categorySort = 0

    if (t.category) {
      if (t.category.parentId) {
        const parentInfo = parentMap[t.category.parentId]
        categoryName = parentInfo?.name || t.category.name
        parentId = t.category.parentId
        categorySort = parentInfo?.sort ?? categorySortMap.get(t.category.parentId) ?? 0
      } else {
        categoryName = t.category.name
        parentId = t.category.id
        categorySort = categorySortMap.get(t.category.id) ?? t.category.sort
      }
    }

    if (t.type === 'income') {
      incomeByCategory[categoryName] = (incomeByCategory[categoryName] || ZERO).plus(t.amount)
      if (!incomeCategoryData[categoryName]) {
        incomeCategoryData[categoryName] = { actual: ZERO, predicted: ZERO, categoryId: parentId, sort: categorySort }
      }
      incomeCategoryData[categoryName].actual = incomeCategoryData[categoryName].actual.plus(t.amount)
    } else {
      expenseByCategory[categoryName] = (expenseByCategory[categoryName] || ZERO).plus(t.amount)
      if (!expenseCategoryData[categoryName]) {
        expenseCategoryData[categoryName] = { actual: ZERO, predicted: ZERO, categoryId: parentId, sort: categorySort }
      }
      expenseCategoryData[categoryName].actual = expenseCategoryData[categoryName].actual.plus(t.amount)
    }
  })

  // 合并预测分类数据
  for (const [catName, pAmount] of Object.entries(predictedByCategory)) {
    // 判断收入还是支出分类
    const cat = allCategories.find(c => {
      let name = c.name
      if (c.parentId) {
        const parent = allCategories.find(p => p.id === c.parentId)
        if (parent) name = parent.name
      }
      return name === catName
    })

    if (cat?.type === 'income') {
      if (!incomeCategoryData[catName]) {
        const sort = categorySortMap.get(cat.id) ?? cat.sort
        incomeCategoryData[catName] = { actual: ZERO, predicted: ZERO, categoryId: cat.id, sort }
      }
      incomeCategoryData[catName].predicted = incomeCategoryData[catName].predicted.plus(pAmount)
    } else if (cat?.type === 'expense') {
      if (!expenseCategoryData[catName]) {
        const sort = categorySortMap.get(cat.id) ?? cat.sort
        expenseCategoryData[catName] = { actual: ZERO, predicted: ZERO, categoryId: cat.id, sort }
      }
      expenseCategoryData[catName].predicted = expenseCategoryData[catName].predicted.plus(pAmount)
    }
  }

  const incomeCategoryDetails: CategoryBreakdownItem[] = Object.entries(incomeCategoryData)
    .map(([name, data]) => ({
      name,
      actual: data.actual.toNumber(),
      predicted: data.predicted.toNumber(),
      categoryId: data.categoryId,
      hasChildren: allCategories.some(c => c.parentId === data.categoryId),
      sort: data.sort,
    }))
    .sort((a, b) => a.sort - b.sort)

  const expenseCategoryDetails: CategoryBreakdownItem[] = Object.entries(expenseCategoryData)
    .map(([name, data]) => ({
      name,
      actual: data.actual.toNumber(),
      predicted: data.predicted.toNumber(),
      categoryId: data.categoryId,
      hasChildren: allCategories.some(c => c.parentId === data.categoryId),
      sort: data.sort,
    }))
    .sort((a, b) => a.sort - b.sort)

  const accounts = await prisma.account.findMany()

  const startBalances = await Promise.all(
    accounts.map(account => calculateBalanceAtDate(account.id, start))
  )
  const endBalances = await Promise.all(
    accounts.map(account => calculateBalanceAtDate(account.id, new Date(end.getTime() + 86400000)))
  )

  const startAssets = accounts.reduce((sum, account, i) =>
    account.type === 'asset' ? sum + startBalances[i] : sum, 0)
  const startLiabilitiesBalance = accounts.reduce((sum, account, i) =>
    account.type === 'liability' ? sum + startBalances[i] : sum, 0)
  const startLiabilities = Math.abs(startLiabilitiesBalance)
  const startNetWorth = startAssets + startLiabilitiesBalance

  const endAssets = accounts.reduce((sum, account, i) =>
    account.type === 'asset' ? sum + endBalances[i] : sum, 0)
  const endLiabilitiesBalance = accounts.reduce((sum, account, i) =>
    account.type === 'liability' ? sum + endBalances[i] : sum, 0)
  const endLiabilities = Math.abs(endLiabilitiesBalance)
  const endNetWorth = endAssets + endLiabilitiesBalance

  // 预测净资产变化 = 预测收入 - 预测支出
  const predictedNetWorthChange = predictedBalance.toNumber()
  const actualAssetChange = endNetWorth - startNetWorth

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
    income: { actual: aIncome.toNumber(), predicted: pIncome.toNumber() },
    expense: { actual: aExpense.toNumber(), predicted: pExpense.toNumber() },
    balance: { actual: actualBalance.toNumber(), predicted: predictedBalance.toNumber() },
    incomeByCategory: incomeByCategoryResult,
    expenseByCategory: expenseByCategoryResult,
    incomeCategoryDetails,
    expenseCategoryDetails,
    startAssets,
    startLiabilities,
    startNetWorth,
    endAssets,
    endLiabilities,
    endNetWorth,
    assetChange: { actual: actualAssetChange, predicted: predictedNetWorthChange },
    predictionNote,
  }
}
