import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'

export interface CategoryBreakdownItem {
  name: string
  value: number
  categoryId: string
  hasChildren: boolean
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

  const income = transactions
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0)
  const expense = transactions
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount.toNumber(), 0)
  const balance = income - expense

  const incomeByCategory: Record<string, number> = {}
  const expenseByCategory: Record<string, number> = {}

  const allCategories = await prisma.transactionCategory.findMany()

  // 获取子分类的父分类映射
  const childCategoryIds = transactions
    .filter(t => t.category?.parentId)
    .map(t => t.category!.parentId)
  const uniqueParentIds = [...new Set(childCategoryIds)] as string[]

  let parentMap: Record<string, string> = {}
  if (uniqueParentIds.length > 0) {
    const parentCats = await prisma.transactionCategory.findMany({
      where: { id: { in: uniqueParentIds } },
    })
    parentMap = Object.fromEntries(parentCats.map(p => [p.id, p.name]))
  }

  const incomeCategoryData: Record<string, { value: number; categoryId: string }> = {}
  const expenseCategoryData: Record<string, { value: number; categoryId: string }> = {}

  transactions.forEach(t => {
    let categoryName = '未分类'
    let parentId = ''

    if (t.category) {
      if (t.category.parentId) {
        categoryName = parentMap[t.category.parentId] || t.category.name
        parentId = t.category.parentId
      } else {
        categoryName = t.category.name
        parentId = t.category.id
      }
    }

    if (t.type === 'income') {
      incomeByCategory[categoryName] = (incomeByCategory[categoryName] || 0) + t.amount.toNumber()
      if (!incomeCategoryData[categoryName]) {
        incomeCategoryData[categoryName] = { value: 0, categoryId: parentId }
      }
      incomeCategoryData[categoryName].value += t.amount.toNumber()
    } else {
      expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + t.amount.toNumber()
      if (!expenseCategoryData[categoryName]) {
        expenseCategoryData[categoryName] = { value: 0, categoryId: parentId }
      }
      expenseCategoryData[categoryName].value += t.amount.toNumber()
    }
  })

  const incomeCategoryDetails: CategoryBreakdownItem[] = Object.entries(incomeCategoryData)
    .map(([name, data]) => ({
      name,
      value: data.value,
      categoryId: data.categoryId,
      hasChildren: allCategories.some(c => c.parentId === data.categoryId),
    }))
    .sort((a, b) => b.value - a.value)

  const expenseCategoryDetails: CategoryBreakdownItem[] = Object.entries(expenseCategoryData)
    .map(([name, data]) => ({
      name,
      value: data.value,
      categoryId: data.categoryId,
      hasChildren: allCategories.some(c => c.parentId === data.categoryId),
    }))
    .sort((a, b) => b.value - a.value)

  // 计算期初和期末资产
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

  return {
    startDate,
    endDate,
    income,
    expense,
    balance,
    incomeByCategory,
    expenseByCategory,
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
