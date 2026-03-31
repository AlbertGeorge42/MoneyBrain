import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'

export interface BalanceSheetAccount {
  id: string
  name: string
  type: string
  balance: number
  category: string
  categoryId: string | null
  icon: string | null
  categoryIcon: string | null
  categorySort: number
  accountSort: number
}

export interface BalanceSheetResult {
  month: string
  date: string
  assets: number
  liabilities: number
  netWorth: number
  assetsByCategory: Record<string, number>
  liabilitiesByCategory: Record<string, number>
  accounts: BalanceSheetAccount[]
}

export async function generateBalanceSheet(month: string): Promise<BalanceSheetResult> {
  const monthStart = new Date(`${month}-01T00:00:00`)

  const categories = await prisma.accountCategory.findMany({
    orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
  })

  const accounts = await prisma.account.findMany({
    include: { category: true },
    orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
  })

  const accountBalances = await Promise.all(
    accounts.map(async (account) => {
      const balance = await calculateBalanceAtDate(account.id, monthStart)
      return { ...account, balance }
    })
  )

  const assets = accountBalances
    .filter(a => a.type === 'asset')
    .reduce((sum, a) => sum + a.balance, 0)

  const liabilities = accountBalances
    .filter(a => a.type === 'liability')
    .reduce((sum, a) => sum + a.balance, 0)

  const netWorth = assets + liabilities

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
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance,
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

  return {
    month,
    date: `${month}-01`,
    assets,
    liabilities,
    netWorth,
    assetsByCategory,
    liabilitiesByCategory,
    accounts: sortedAccounts,
  }
}
