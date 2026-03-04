import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error } from '../utils/response.js'

const router = Router()

router.get('/balance-sheet', async (req, res, next) => {
  try {
    const { date } = req.query
    const targetDate = date ? new Date(date as string) : new Date()
    targetDate.setHours(23, 59, 59, 999)

    const accounts = await prisma.account.findMany({
      include: { category: true },
    })

    const assets = accounts
      .filter(a => a.type === 'asset')
      .reduce((sum, a) => sum + a.balance.toNumber(), 0)
    const liabilities = accounts
      .filter(a => a.type === 'liability')
      .reduce((sum, a) => sum + a.balance.toNumber(), 0)
    const netWorth = assets - liabilities

    const assetsByCategory: Record<string, number> = {}
    const liabilitiesByCategory: Record<string, number> = {}

    accounts.forEach(account => {
      const categoryName = account.category?.name || '未分类'
      if (account.type === 'asset') {
        assetsByCategory[categoryName] = (assetsByCategory[categoryName] || 0) + account.balance.toNumber()
      } else {
        liabilitiesByCategory[categoryName] = (liabilitiesByCategory[categoryName] || 0) + account.balance.toNumber()
      }
    })

    return success(res, {
      date: targetDate.toISOString().split('T')[0],
      assets,
      liabilities,
      netWorth,
      assetsByCategory,
      liabilitiesByCategory,
      accounts: accounts.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        balance: a.balance.toNumber(),
        category: a.category?.name || '未分类',
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

    const transactions = await prisma.transaction.findMany({
      where: {
        date: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        },
      },
      include: { category: true },
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

    transactions.forEach(t => {
      const categoryName = t.category?.name || '未分类'
      if (t.type === 'income') {
        incomeByCategory[categoryName] = (incomeByCategory[categoryName] || 0) + t.amount.toNumber()
      } else {
        expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + t.amount.toNumber()
      }
    })

    return success(res, {
      startDate,
      endDate,
      income,
      expense,
      balance,
      incomeByCategory,
      expenseByCategory,
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

    const transactions = await prisma.transaction.findMany({
      where: {
        date: {
          gte: new Date(startDate as string),
          lte: new Date(endDate as string),
        },
      },
      include: { account: true },
    })

    const cashInflow = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const cashOutflow = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const netCashFlow = cashInflow - cashOutflow

    const flowByAccount: Record<string, { inflow: number; outflow: number }> = {}
    transactions.forEach(t => {
      const accountName = t.account?.name || '未知账户'
      if (!flowByAccount[accountName]) {
        flowByAccount[accountName] = { inflow: 0, outflow: 0 }
      }
      if (t.type === 'income') {
        flowByAccount[accountName].inflow += t.amount.toNumber()
      } else {
        flowByAccount[accountName].outflow += t.amount.toNumber()
      }
    })

    return success(res, {
      startDate,
      endDate,
      cashInflow,
      cashOutflow,
      netCashFlow,
      flowByAccount,
    })
  } catch (err) {
    return next(err)
  }
})

export default router
