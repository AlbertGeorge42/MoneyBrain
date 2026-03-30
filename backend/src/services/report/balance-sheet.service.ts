import { prisma } from '../../index.js'
import { calculateBalanceAtDate } from '../balance.service.js'

export interface BalanceSheetAccount {
  id: string
  name: string
  type: string
  balance: number
  category: string
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

  const accounts = await prisma.account.findMany({
    include: { category: true },
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

  return {
    month,
    date: `${month}-01`,
    assets,
    liabilities,
    netWorth,
    assetsByCategory,
    liabilitiesByCategory,
    accounts: accountBalances.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      balance: a.balance,
      category: a.category?.name || '未分类',
    })),
  }
}
