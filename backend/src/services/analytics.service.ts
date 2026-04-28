import { prisma } from '../index.js'
import { calculateBalanceAtDate } from './balance.service.js'
import { ZERO } from '../common/index.js'

export interface TrendItem {
  label: string
  amount: number
}

export interface CategoryBreakdownItem {
  name: string
  value: number
  categoryId?: string
  hasChildren?: boolean
}

export async function getTrends(type: string): Promise<TrendItem[]> {
  const now = new Date()
  const months: { label: string; startDate: Date; endDate: Date }[] = []

  for (let i = 11; i >= 0; i--) {
    const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
    months.push({
      label: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
      startDate,
      endDate,
    })
  }

  return Promise.all(
    months.map(async ({ label, startDate, endDate }) => {
      const transactions = await prisma.transaction.findMany({
        where: { type, date: { gte: startDate, lte: endDate } },
      })
      let amount = ZERO
      transactions.forEach(t => {
        amount = amount.plus(t.amount)
      })
      return { label, amount: amount.toNumber() }
    })
  )
}

export async function getCategoryBreakdown(
  type: string,
  startDate?: string,
  endDate?: string,
  parentCategoryId?: string,
): Promise<CategoryBreakdownItem[]> {
  const where: any = { type }
  if (startDate && endDate) {
    where.date = {
      gte: new Date(startDate),
      lte: new Date(endDate),
    }
  }

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true },
  })

  if (parentCategoryId) {
    const subBreakdown: Record<string, typeof ZERO> = {}
    transactions.forEach(t => {
      if (t.category?.parentId === parentCategoryId) {
        const categoryName = t.category.name
        subBreakdown[categoryName] = (subBreakdown[categoryName] || ZERO).plus(t.amount)
      }
    })
    return Object.entries(subBreakdown)
      .map(([name, value]) => ({ name, value: value.toNumber() }))
      .sort((a, b) => b.value - a.value)
  }

  const parentCategories = await prisma.transactionCategory.findMany({
    where: { type, parentId: null },
  })
  const parentCategoryMap = new Map(parentCategories.map(c => [c.id, c.name]))

  const breakdown: Record<string, { value: typeof ZERO; categoryId: string }> = {}
  transactions.forEach(t => {
    let parentName = '未分类'
    let parentId = ''

    if (t.category) {
      if (t.category.parentId && parentCategoryMap.has(t.category.parentId)) {
        parentName = parentCategoryMap.get(t.category.parentId)!
        parentId = t.category.parentId
      } else if (!t.category.parentId) {
        parentName = t.category.name
        parentId = t.category.id
      }
    }

    if (!breakdown[parentName]) {
      breakdown[parentName] = { value: ZERO, categoryId: parentId }
    }
    breakdown[parentName].value = breakdown[parentName].value.plus(t.amount)
  })

  return Object.entries(breakdown)
    .map(([name, data]) => ({
      name,
      value: data.value.toNumber(),
      categoryId: data.categoryId,
      hasChildren: transactions.some(t => t.category?.parentId === data.categoryId),
    }))
    .sort((a, b) => b.value - a.value)
}

export async function getAssetTrend(): Promise<Array<{
  label: string
  assets: number
  liabilities: number
  netWorth: number
}>> {
  const now = new Date()
  const months: { label: string; targetDate: Date }[] = []

  for (let i = 11; i >= 0; i--) {
    const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
    months.push({
      label: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
      targetDate: nextMonthStart,
    })
  }

  const accounts = await prisma.account.findMany()

  return Promise.all(
    months.map(async ({ label, targetDate }) => {
      const balances = await Promise.all(
        accounts.map(a => calculateBalanceAtDate(a.id, targetDate))
      )
      const assets = balances
        .filter((_, idx) => accounts[idx].type === 'asset')
        .reduce((sum, b) => sum + b, 0)
      const liabilities = balances
        .filter((_, idx) => accounts[idx].type === 'liability')
        .reduce((sum, b) => sum + b, 0)
      return {
        label,
        assets,
        liabilities: Math.abs(liabilities),
        netWorth: assets + liabilities,
      }
    })
  )
}
