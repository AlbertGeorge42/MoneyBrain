import { prisma } from '../../index.js'
import { calculateBalancesBatch } from '../balance.service.js'
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

  const predictedById: Record<string, Decimal> = {}

  if (includePredictions && end > now) {
    const predictionsStart = start > now ? startDate : now.toISOString().split('T')[0]
    const predictions = await generatePredictions(predictionsStart, endDate)

    predictions.forEach(p => {
      if (p.type === 'income') {
        pIncome = pIncome.plus(p.amount)
      } else if (p.type === 'expense') {
        pExpense = pExpense.plus(p.amount)
      }
      if (p.categoryId) {
        predictedById[p.categoryId] = (predictedById[p.categoryId] || ZERO).plus(p.amount)
      }
    })

    if (predictions.length > 0) {
      predictionNote = '含预算预测数据'
    }
  }

  const actualBalance = aIncome.minus(aExpense)
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
  const leafPredictedIncome: Record<string, Decimal> = {}
  const leafPredictedExpense: Record<string, Decimal> = {}

  transactions.forEach(t => {
    if (t.type !== 'income' && t.type !== 'expense') return
    const catId = t.categoryId ?? 'uncategorized'
    const target = t.type === 'income' ? leafActualIncome : leafActualExpense
    target[catId] = (target[catId] || ZERO).plus(t.amount)
  })

  for (const [catId, pAmount] of Object.entries(predictedById)) {
    const cat = categoryMap.get(catId)
    if (!cat) continue
    const target = cat.type === 'income' ? leafPredictedIncome : leafPredictedExpense
    target[catId] = (target[catId] || ZERO).plus(pAmount)
  }

  function buildTree(type: 'income' | 'expense', parentId: string | null): CategoryBreakdownItem[] {
    const kids = childrenOf.get(parentId) ?? []
    const result: CategoryBreakdownItem[] = []

    for (const cat of kids) {
      const childLeaves = buildTree(type, cat.id)
      const hasTransactionChildren = childLeaves.length > 0

      const catActual = (type === 'income' ? leafActualIncome : leafActualExpense)[cat.id] ?? ZERO
      const catPredicted = (type === 'income' ? leafPredictedIncome : leafPredictedExpense)[cat.id] ?? ZERO
      const hasOwnData = !catActual.isZero() || !catPredicted.isZero()

      if (!hasOwnData && !hasTransactionChildren) continue

      const childrenActual = childLeaves.reduce((s, c) => s + c.actual, 0)
      const childrenPredicted = childLeaves.reduce((s, c) => s + c.predicted, 0)

      result.push({
        name: cat.name,
        actual: catActual.toNumber() + childrenActual,
        predicted: catPredicted.toNumber() + childrenPredicted,
        categoryId: cat.id,
        hasChildren: hasTransactionChildren,
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
  for (const [catId, amount] of Object.entries(leafActualExpense)) {
    const cat = categoryMap.get(catId)
    expenseByCategory[cat?.name ?? '未分类'] = (expenseByCategory[cat?.name ?? '未分类'] || ZERO).plus(amount)
  }

  const accounts = await prisma.account.findMany()

  const startDay = new Date(start)
  const endDayNext = new Date(end.getTime() + 86400000)
  const allAccountIds = accounts.map(a => a.id)
  const balanceCache = await calculateBalancesBatch(allAccountIds, [startDay, endDayNext])

  const startBalances = accounts.map(account => balanceCache.get(account.id, startDay))
  const endBalances = accounts.map(account => balanceCache.get(account.id, endDayNext))

  const actualStartAssets = accounts.reduce((sum, account, i) =>
    account.type === 'asset' ? sum + startBalances[i] : sum, 0)
  const actualStartLiabilitiesBalance = accounts.reduce((sum, account, i) =>
    account.type === 'liability' ? sum + startBalances[i] : sum, 0)
  const actualStartLiabilities = Math.abs(actualStartLiabilitiesBalance)
  const actualStartNetWorth = actualStartAssets + actualStartLiabilitiesBalance

  const actualEndAssets = accounts.reduce((sum, account, i) =>
    account.type === 'asset' ? sum + endBalances[i] : sum, 0)
  const actualEndLiabilitiesBalance = accounts.reduce((sum, account, i) =>
    account.type === 'liability' ? sum + endBalances[i] : sum, 0)
  const actualEndLiabilities = Math.abs(actualEndLiabilitiesBalance)
  const actualEndNetWorth = actualEndAssets + actualEndLiabilitiesBalance

  let predictedStartNetWorth = 0
  let predictedEndNetWorth = 0
  let predictedStartAssets = 0
  let predictedEndAssets = 0
  let predictedStartLiabilities = 0
  let predictedEndLiabilities = 0

  if (includePredictions && end > now) {
    const nowStr = now.toISOString().split('T')[0]
    
    if (start > now) {
      const startPredictions = await generatePredictions(nowStr, startDate)
      let pAssetChange = 0
      let pLiabilityChange = 0
      for (const p of startPredictions) {
        const account = accounts.find(a => a.id === p.accountId)
        const toAccount = p.toAccountId ? accounts.find(a => a.id === p.toAccountId) : null
        if (p.type === 'income') {
          if (account?.type === 'asset') pAssetChange += p.amount
          else if (account?.type === 'liability') pLiabilityChange -= p.amount
        } else if (p.type === 'expense') {
          if (account?.type === 'asset') pAssetChange -= p.amount
          else if (account?.type === 'liability') pLiabilityChange -= p.amount
        } else if (p.type === 'transfer') {
          if (account?.type === 'asset') pAssetChange -= p.amount
          else if (account?.type === 'liability') pLiabilityChange -= p.amount
          if (toAccount?.type === 'asset') pAssetChange += p.amount
          else if (toAccount?.type === 'liability') pLiabilityChange += p.amount
        }
      }
      predictedStartAssets = pAssetChange
      predictedStartLiabilities = Math.abs(actualStartLiabilitiesBalance + pLiabilityChange) - actualStartLiabilities
      predictedStartNetWorth = pAssetChange + pLiabilityChange
    }

    const endPredictions = await generatePredictions(nowStr, endDate)
    let pAssetChange = 0
    let pLiabilityChange = 0
    for (const p of endPredictions) {
      const account = accounts.find(a => a.id === p.accountId)
      const toAccount = p.toAccountId ? accounts.find(a => a.id === p.toAccountId) : null
      if (p.type === 'income') {
        if (account?.type === 'asset') pAssetChange += p.amount
        else if (account?.type === 'liability') pLiabilityChange -= p.amount
      } else if (p.type === 'expense') {
        if (account?.type === 'asset') pAssetChange -= p.amount
        else if (account?.type === 'liability') pLiabilityChange -= p.amount
      } else if (p.type === 'transfer') {
        if (account?.type === 'asset') pAssetChange -= p.amount
        else if (account?.type === 'liability') pLiabilityChange -= p.amount
        if (toAccount?.type === 'asset') pAssetChange += p.amount
        else if (toAccount?.type === 'liability') pLiabilityChange += p.amount
      }
    }
    predictedEndAssets = pAssetChange
    predictedEndLiabilities = Math.abs(actualEndLiabilitiesBalance + pLiabilityChange) - actualEndLiabilities
    predictedEndNetWorth = pAssetChange + pLiabilityChange
  }

  const predictedNetWorthChange = predictedBalance.toNumber()
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
    income: { actual: aIncome.toNumber(), predicted: pIncome.toNumber() },
    expense: { actual: aExpense.toNumber(), predicted: pExpense.toNumber() },
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
}
