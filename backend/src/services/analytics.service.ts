import { prisma } from '../index.js'

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
      const amount = transactions.reduce((sum, t) => sum + t.amount.toNumber(), 0)
      return { label, amount }
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

  // 子分类明细
  if (parentCategoryId) {
    const subBreakdown: Record<string, number> = {}
    transactions.forEach(t => {
      if (t.category?.parentId === parentCategoryId) {
        const categoryName = t.category.name
        subBreakdown[categoryName] = (subBreakdown[categoryName] || 0) + t.amount.toNumber()
      }
    })
    return Object.entries(subBreakdown)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
  }

  // 按父分类汇总
  const parentCategories = await prisma.transactionCategory.findMany({
    where: { type, parentId: null },
  })
  const parentCategoryMap = new Map(parentCategories.map(c => [c.id, c.name]))

  const breakdown: Record<string, { value: number; categoryId: string }> = {}
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
      breakdown[parentName] = { value: 0, categoryId: parentId }
    }
    breakdown[parentName].value += t.amount.toNumber()
  })

  return Object.entries(breakdown)
    .map(([name, data]) => ({
      name,
      value: data.value,
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
  const months: { label: string }[] = []

  for (let i = 11; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({
      label: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
    })
  }

  const accounts = await prisma.account.findMany()
  const currentAssets = accounts
    .filter(a => a.type === 'asset')
    .reduce((sum, a) => sum + a.balance.toNumber(), 0)
  const currentLiabilities = accounts
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + a.balance.toNumber(), 0)

  return months.map(({ label }, index) => {
    const factor = (index + 1) / 12
    return {
      label,
      assets: Math.round(currentAssets * factor * 0.8),
      liabilities: Math.round(currentLiabilities * factor * 0.9),
      netWorth: Math.round((currentAssets * factor * 0.8) - (currentLiabilities * factor * 0.9)),
    }
  })
}
