import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { ZERO } from '../../common/index.js'

export interface CategoryBreakdownItem {
  name: string
  value: number
  categoryId: string
  hasChildren: boolean
  sort: number
}

export interface IncomeExpenseResult {
  startDate: string
  endDate: string
  income: number
  expense: number
  balance: number
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
  assetChange: number
}

export async function generateIncomeExpense(startDate: string, endDate: string): Promise<IncomeExpenseResult> {
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T23:59:59.999`)

  const transactions = await prisma.transaction.findMany({
    where: {
      date: { gte: start, lte: end },
      isAdjustment: false,
      type: { in: ['income', 'expense'] },
    },
    include: { category: true, account: true },
  })

  let income = ZERO
  let expense = ZERO

  transactions.forEach(t => {
    if (t.type === 'income') {
      income = income.plus(t.amount)
    } else if (t.type === 'expense') {
      expense = expense.plus(t.amount)
    }
  })

  const balance = income.minus(expense)

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

  const incomeCategoryData: Record<string, { value: Decimal; categoryId: string; sort: number }> = {}
  const expenseCategoryData: Record<string, { value: Decimal; categoryId: string; sort: number }> = {}

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
        incomeCategoryData[categoryName] = { value: ZERO, categoryId: parentId, sort: categorySort }
      }
      incomeCategoryData[categoryName].value = incomeCategoryData[categoryName].value.plus(t.amount)
    } else {
      expenseByCategory[categoryName] = (expenseByCategory[categoryName] || ZERO).plus(t.amount)
      if (!expenseCategoryData[categoryName]) {
        expenseCategoryData[categoryName] = { value: ZERO, categoryId: parentId, sort: categorySort }
      }
      expenseCategoryData[categoryName].value = expenseCategoryData[categoryName].value.plus(t.amount)
    }
  })

  const incomeCategoryDetails: CategoryBreakdownItem[] = Object.entries(incomeCategoryData)
    .map(([name, data]) => ({
      name,
      value: data.value.toNumber(),
      categoryId: data.categoryId,
      hasChildren: allCategories.some(c => c.parentId === data.categoryId),
      sort: data.sort,
    }))
    .sort((a, b) => a.sort - b.sort)

  const expenseCategoryDetails: CategoryBreakdownItem[] = Object.entries(expenseCategoryData)
    .map(([name, data]) => ({
      name,
      value: data.value.toNumber(),
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
    income: income.toNumber(),
    expense: expense.toNumber(),
    balance: balance.toNumber(),
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
    assetChange: endNetWorth - startNetWorth,
  }
}
