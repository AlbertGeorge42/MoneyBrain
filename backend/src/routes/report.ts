import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error } from '../utils/response.js'
import { calculateBalanceAtDate } from '../services/balance.service.js'

const router = Router()

router.get('/balance-sheet', async (req, res, next) => {
  try {
    const { month } = req.query
    if (!month) {
      return error(res, '请提供月份参数', 'BAD_REQUEST', 400)
    }

    const monthStart = new Date(`${month}-01T00:00:00.000Z`)

    const accounts = await prisma.account.findMany({
      include: { category: true },
    })

    const accountBalances = await Promise.all(
      accounts.map(async (account) => {
        const calculatedBalance = await calculateBalanceAtDate(account.id, monthStart)
        
        const snapshot = await prisma.balanceSnapshot.findUnique({
          where: {
            month_accountId: {
              month: month as string,
              accountId: account.id,
            },
          },
        })

        const balance = snapshot ? snapshot.balance.toNumber() : calculatedBalance
        const isManual = snapshot?.isManual || false

        return {
          ...account,
          calculatedBalance,
          balance,
          isManual,
        }
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

    return success(res, {
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
        calculatedBalance: a.calculatedBalance,
        category: a.category?.name || '未分类',
        isManual: a.isManual,
      })),
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/income-expense', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400)
    }

    const start = new Date(startDate as string)
    const end = new Date(endDate as string)
    end.setHours(23, 59, 59, 999)

    const transactions = await prisma.transaction.findMany({
      where: {
        date: {
          gte: start,
          lte: end,
        },
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

    const childCategoryIds = transactions
      .filter(t => t.category?.parentId)
      .map(t => t.category!.parentId)
    
    const uniqueParentIds = [...new Set(childCategoryIds)] as string[]
    
    let parentMap: Record<string, string> = {}
    if (uniqueParentIds.length > 0) {
      const parentCategories = await prisma.category.findMany({
        where: { id: { in: uniqueParentIds } }
      })
      parentMap = Object.fromEntries(parentCategories.map(p => [p.id, p.name]))
    }

    transactions.forEach(t => {
      let categoryName = '未分类'
      if (t.category) {
        if (t.category.parentId) {
          categoryName = parentMap[t.category.parentId] || t.category.name
        } else {
          categoryName = t.category.name
        }
      }
      
      if (t.type === 'income') {
        incomeByCategory[categoryName] = (incomeByCategory[categoryName] || 0) + t.amount.toNumber()
      } else {
        expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + t.amount.toNumber()
      }
    })

    const accounts = await prisma.account.findMany()
    
    const startBalances = await Promise.all(
      accounts.map(async (account) => {
        return calculateBalanceAtDate(account.id, start)
      })
    )
    
    const endBalances = await Promise.all(
      accounts.map(async (account) => {
        return calculateBalanceAtDate(account.id, new Date(end.getTime() + 86400000))
      })
    )

    const startAssets = accounts.reduce((sum, account, index) => {
      return account.type === 'asset' ? sum + startBalances[index] : sum
    }, 0)
    const startLiabilitiesBalance = accounts.reduce((sum, account, index) => {
      return account.type === 'liability' ? sum + startBalances[index] : sum
    }, 0)
    const startLiabilities = Math.abs(startLiabilitiesBalance)
    const startNetWorth = startAssets + startLiabilitiesBalance

    const endAssets = accounts.reduce((sum, account, index) => {
      return account.type === 'asset' ? sum + endBalances[index] : sum
    }, 0)
    const endLiabilitiesBalance = accounts.reduce((sum, account, index) => {
      return account.type === 'liability' ? sum + endBalances[index] : sum
    }, 0)
    const endLiabilities = Math.abs(endLiabilitiesBalance)
    const endNetWorth = endAssets + endLiabilitiesBalance

    return success(res, {
      startDate,
      endDate,
      income,
      expense,
      balance,
      incomeByCategory,
      expenseByCategory,
      startAssets,
      startLiabilities,
      startNetWorth,
      endAssets,
      endLiabilities,
      endNetWorth,
      assetChange: endNetWorth - startNetWorth,
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/cash-flow', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query
    if (!startDate || !endDate) {
      return error(res, '请提供开始日期和结束日期', 'BAD_REQUEST', 400)
    }

    const start = new Date(startDate as string)
    const end = new Date(endDate as string)
    end.setHours(23, 59, 59, 999)

    const cashCategories = await prisma.accountCategory.findMany({
      where: { isCashEquivalent: true },
      select: { id: true },
    })
    const cashCategoryIds = cashCategories.map(c => c.id)

    const cashAccounts = await prisma.account.findMany({
      where: {
        categoryId: { in: cashCategoryIds },
      },
      select: { id: true, name: true },
    })
    const cashAccountIds = cashAccounts.map(a => a.id)

    const transactions = await prisma.transaction.findMany({
      where: {
        date: { gte: start, lte: end },
        isAdjustment: false,
        OR: [
          { accountId: { in: cashAccountIds } },
          { toAccountId: { in: cashAccountIds } },
        ],
      },
      include: { 
        account: true, 
        toAccount: true, 
        category: true,
      },
    })

    const operating = { inflow: 0, outflow: 0, items: [] as any[] }
    const investing = { inflow: 0, outflow: 0, items: [] as any[] }
    const financing = { inflow: 0, outflow: 0, items: [] as any[] }
    const uncategorized = { inflow: 0, outflow: 0, items: [] as any[] }

    const getTargetByType = (cashFlowType: string | null) => {
      return cashFlowType === 'investing' ? investing :
             cashFlowType === 'financing' ? financing :
             cashFlowType === 'operating' ? operating : uncategorized
    }

    transactions.forEach(t => {
      const isFromCash = cashAccountIds.includes(t.accountId)
      const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
      const cashFlowType = t.category?.cashFlowType || null
      
      if (t.type === 'income' && isFromCash) {
        const target = getTargetByType(cashFlowType)
        target.inflow += t.amount.toNumber()
        target.items.push({
          categoryName: t.category?.name || '未分类',
          amount: t.amount.toNumber(),
          type: 'income',
          direction: 'inflow',
        })
      } else if (t.type === 'expense' && isFromCash) {
        const target = getTargetByType(cashFlowType)
        target.outflow += t.amount.toNumber()
        target.items.push({
          categoryName: t.category?.name || '未分类',
          amount: t.amount.toNumber(),
          type: 'expense',
          direction: 'outflow',
        })
      } else if (t.type === 'transfer') {
        if (isFromCash && !isToCash) {
          const target = getTargetByType(cashFlowType)
          target.outflow += t.amount.toNumber()
          target.items.push({
            categoryName: t.category?.name || '转账转出',
            amount: t.amount.toNumber(),
            type: 'transfer_out',
            direction: 'outflow',
          })
        } else if (!isFromCash && isToCash) {
          const target = getTargetByType(cashFlowType)
          target.inflow += t.amount.toNumber()
          target.items.push({
            categoryName: t.category?.name || '转账转入',
            amount: t.amount.toNumber(),
            type: 'transfer_in',
            direction: 'inflow',
          })
        }
      }
    })

    const cashInflow = operating.inflow + investing.inflow + financing.inflow + uncategorized.inflow
    const cashOutflow = operating.outflow + investing.outflow + financing.outflow + uncategorized.outflow
    const netCashFlow = cashInflow - cashOutflow

    const flowByAccount: Record<string, { inflow: number; outflow: number }> = {}
    
    transactions.forEach(t => {
      const isFromCash = cashAccountIds.includes(t.accountId)
      const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
      
      if (t.type === 'income' && isFromCash) {
        const accountName = t.account?.name || '未知账户'
        if (!flowByAccount[accountName]) {
          flowByAccount[accountName] = { inflow: 0, outflow: 0 }
        }
        flowByAccount[accountName].inflow += t.amount.toNumber()
      } else if (t.type === 'expense' && isFromCash) {
        const accountName = t.account?.name || '未知账户'
        if (!flowByAccount[accountName]) {
          flowByAccount[accountName] = { inflow: 0, outflow: 0 }
        }
        flowByAccount[accountName].outflow += t.amount.toNumber()
      } else if (t.type === 'transfer') {
        if (isFromCash && !isToCash) {
          const accountName = t.account?.name || '未知账户'
          if (!flowByAccount[accountName]) {
            flowByAccount[accountName] = { inflow: 0, outflow: 0 }
          }
          flowByAccount[accountName].outflow += t.amount.toNumber()
        } else if (!isFromCash && isToCash && t.toAccount) {
          const accountName = t.toAccount.name
          if (!flowByAccount[accountName]) {
            flowByAccount[accountName] = { inflow: 0, outflow: 0 }
          }
          flowByAccount[accountName].inflow += t.amount.toNumber()
        }
      }
    })

    const startCashBalances = await Promise.all(
      cashAccountIds.map(id => calculateBalanceAtDate(id, start))
    )
    const endCashBalances = await Promise.all(
      cashAccountIds.map(id => calculateBalanceAtDate(id, new Date(end.getTime() + 86400000)))
    )

    const startCash = startCashBalances.reduce((sum, b) => sum + b, 0)
    const endCash = endCashBalances.reduce((sum, b) => sum + b, 0)

    const sourceNodes: Map<string, number> = new Map()
    const targetNodes: Map<string, number> = new Map()
    const cashNodeNames = cashAccounts.map(a => a.name)
    
    const sourceToCashLinks: Map<string, Map<string, number>> = new Map()
    const cashToTargetLinks: Map<string, Map<string, number>> = new Map()

    transactions.forEach(t => {
      const isFromCash = cashAccountIds.includes(t.accountId)
      const isToCash = t.toAccountId && cashAccountIds.includes(t.toAccountId)
      const amount = t.amount.toNumber()
      
      if (t.type === 'income' && isFromCash) {
        const categoryName = t.category?.name || '其他收入'
        const cashAccountName = t.account?.name || '现金账户'
        
        sourceNodes.set(categoryName, (sourceNodes.get(categoryName) || 0) + amount)
        
        if (!sourceToCashLinks.has(categoryName)) {
          sourceToCashLinks.set(categoryName, new Map())
        }
        sourceToCashLinks.get(categoryName)!.set(
          cashAccountName, 
          (sourceToCashLinks.get(categoryName)!.get(cashAccountName) || 0) + amount
        )
      } else if (t.type === 'expense' && isFromCash) {
        const categoryName = t.category?.name || '其他支出'
        const cashAccountName = t.account?.name || '现金账户'
        
        targetNodes.set(categoryName, (targetNodes.get(categoryName) || 0) + amount)
        
        if (!cashToTargetLinks.has(cashAccountName)) {
          cashToTargetLinks.set(cashAccountName, new Map())
        }
        cashToTargetLinks.get(cashAccountName)!.set(
          categoryName,
          (cashToTargetLinks.get(cashAccountName)!.get(categoryName) || 0) + amount
        )
      } else if (t.type === 'transfer') {
        if (!isFromCash && isToCash && t.toAccount && t.account) {
          const fromAccountName = t.account.name
          const toCashAccountName = t.toAccount.name
          
          sourceNodes.set(fromAccountName, (sourceNodes.get(fromAccountName) || 0) + amount)
          
          if (!sourceToCashLinks.has(fromAccountName)) {
            sourceToCashLinks.set(fromAccountName, new Map())
          }
          sourceToCashLinks.get(fromAccountName)!.set(
            toCashAccountName,
            (sourceToCashLinks.get(fromAccountName)!.get(toCashAccountName) || 0) + amount
          )
        } else if (isFromCash && !isToCash && t.account && t.toAccount) {
          const fromCashAccountName = t.account.name
          const toAccountName = t.toAccount.name
          
          targetNodes.set(toAccountName, (targetNodes.get(toAccountName) || 0) + amount)
          
          if (!cashToTargetLinks.has(fromCashAccountName)) {
            cashToTargetLinks.set(fromCashAccountName, new Map())
          }
          cashToTargetLinks.get(fromCashAccountName)!.set(
            toAccountName,
            (cashToTargetLinks.get(fromCashAccountName)!.get(toAccountName) || 0) + amount
          )
        }
      }
    })

    const sankeyNodes: Array<{ name: string; category: string }> = []
    const sankeyLinks: Array<{ source: string; target: string; value: number }> = []

    sourceNodes.forEach((_, name) => {
      sankeyNodes.push({ name, category: 'source' })
    })

    cashNodeNames.forEach(name => {
      sankeyNodes.push({ name, category: 'cash' })
    })

    targetNodes.forEach((_, name) => {
      sankeyNodes.push({ name, category: 'target' })
    })

    sourceToCashLinks.forEach((cashMap, sourceName) => {
      cashMap.forEach((amount, cashName) => {
        if (amount > 0) {
          sankeyLinks.push({ source: sourceName, target: cashName, value: amount })
        }
      })
    })

    cashToTargetLinks.forEach((targetMap, cashName) => {
      targetMap.forEach((amount, targetName) => {
        if (amount > 0) {
          sankeyLinks.push({ source: cashName, target: targetName, value: amount })
        }
      })
    })

    return success(res, {
      startDate,
      endDate,
      cashInflow,
      cashOutflow,
      netCashFlow,
      flowByAccount,
      cashAccounts: cashAccounts.map(a => a.name),
      startCash,
      endCash,
      cashChange: endCash - startCash,
      byActivity: {
        operating: { ...operating, net: operating.inflow - operating.outflow },
        investing: { ...investing, net: investing.inflow - investing.outflow },
        financing: { ...financing, net: financing.inflow - financing.outflow },
        uncategorized: { ...uncategorized, net: uncategorized.inflow - uncategorized.outflow },
      },
      sankey: {
        nodes: sankeyNodes,
        links: sankeyLinks,
      },
    })
  } catch (err) {
    return next(err)
  }
})

export default router
