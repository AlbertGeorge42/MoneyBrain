import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error } from '../utils/response.js'

const router = Router()

// 计算某个日期的账户余额
// 统一逻辑：收入增加余额，支出减少余额
// 负债账户初始余额为负值
async function calculateBalanceAtDate(accountId: string, targetDate: Date): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  if (!account) return 0

  // 如果目标日期在初始余额日期之前，返回0
  if (account.initialBalanceDate && targetDate < account.initialBalanceDate) {
    return 0
  }

  // 获取初始余额和日期
  const startDate = account.initialBalanceDate || new Date(0)
  const startBalance = account.initialBalance.toNumber()

  // 查询该账户作为转出方的交易（收入、支出、转账转出）
  const fromTransactions = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  // 查询该账户作为转入方的交易（转账转入）
  const toTransactions = await prisma.transaction.findMany({
    where: {
      toAccountId: accountId,
      date: { gte: startDate, lt: targetDate },
    },
  })

  let balance = startBalance

  // 统一计算逻辑：收入增加余额，支出减少余额
  fromTransactions.forEach(t => {
    if (t.type === 'income') {
      balance += t.amount.toNumber()  // 收入增加余额
    } else if (t.type === 'expense') {
      balance -= t.amount.toNumber()  // 支出减少余额
    } else if (t.type === 'transfer') {
      balance -= t.amount.toNumber()  // 转出减少余额
    }
  })

  // 处理转入方交易
  toTransactions.forEach(t => {
    if (t.type === 'transfer') {
      balance += t.amount.toNumber()  // 转入增加余额
    }
  })

  return balance
}

router.get('/balance-sheet', async (req, res, next) => {
  try {
    const { month } = req.query
    if (!month) {
      return error(res, '请提供月份参数', 'BAD_REQUEST', 400)
    }

    // 计算月初日期（1日 00:00:00）
    const monthStart = new Date(`${month}-01T00:00:00.000Z`)

    const accounts = await prisma.account.findMany({
      include: { category: true },
    })

    // 计算每个账户在月初的余额
    const accountBalances = await Promise.all(
      accounts.map(async (account) => {
        const calculatedBalance = await calculateBalanceAtDate(account.id, monthStart)
        
        // 检查是否有手动矫正的快照
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

    // 资产 = 资产账户余额之和
    const assets = accountBalances
      .filter(a => a.type === 'asset')
      .reduce((sum, a) => sum + a.balance, 0)
    
    // 负债 = 负债账户余额之和的绝对值（负债账户余额为负数）
    const liabilitiesBalance = accountBalances
      .filter(a => a.type === 'liability')
      .reduce((sum, a) => sum + a.balance, 0)
    const liabilities = Math.abs(liabilitiesBalance)
    
    // 净资产 = 资产 + 负债余额（负债为负数，加法相当于减法）
    const netWorth = assets + liabilitiesBalance

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
        isAdjustment: false, // 排除平账记录
        type: { in: ['income', 'expense'] }, // 只统计收支，不统计转账
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

    transactions.forEach(t => {
      const categoryName = t.category?.name || '未分类'
      if (t.type === 'income') {
        incomeByCategory[categoryName] = (incomeByCategory[categoryName] || 0) + t.amount.toNumber()
      } else {
        expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + t.amount.toNumber()
      }
    })

    // 计算期初和期末资产
    const accounts = await prisma.account.findMany()
    
    const startBalances = await Promise.all(
      accounts.map(async (account) => {
        return calculateBalanceAtDate(account.id, start)
      })
    )
    
    const endBalances = await Promise.all(
      accounts.map(async (account) => {
        return calculateBalanceAtDate(account.id, new Date(end.getTime() + 86400000)) // 下一天0点
      })
    )

    // 期初资产 = 资产账户余额之和
    const startAssets = accounts.reduce((sum, account, index) => {
      return account.type === 'asset' ? sum + startBalances[index] : sum
    }, 0)
    // 期初负债 = 负债账户余额之和的绝对值
    const startLiabilitiesBalance = accounts.reduce((sum, account, index) => {
      return account.type === 'liability' ? sum + startBalances[index] : sum
    }, 0)
    const startLiabilities = Math.abs(startLiabilitiesBalance)
    // 期初净资产
    const startNetWorth = startAssets + startLiabilitiesBalance

    // 期末资产 = 资产账户余额之和
    const endAssets = accounts.reduce((sum, account, index) => {
      return account.type === 'asset' ? sum + endBalances[index] : sum
    }, 0)
    // 期末负债 = 负债账户余额之和的绝对值
    const endLiabilitiesBalance = accounts.reduce((sum, account, index) => {
      return account.type === 'liability' ? sum + endBalances[index] : sum
    }, 0)
    const endLiabilities = Math.abs(endLiabilitiesBalance)
    // 期末净资产
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

    // 获取标记为现金等价物的账户分类
    const cashCategories = await prisma.accountCategory.findMany({
      where: { isCashEquivalent: true },
      select: { id: true },
    })
    const cashCategoryIds = cashCategories.map(c => c.id)

    // 获取现金等价物账户
    const cashAccounts = await prisma.account.findMany({
      where: {
        categoryId: { in: cashCategoryIds },
      },
      select: { id: true, name: true },
    })
    const cashAccountIds = cashAccounts.map(a => a.id)

    // 获取所有相关交易
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

    // 按活动类型分类
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
        // 收入 + 现金账户 → 现金流入
        const target = getTargetByType(cashFlowType)
        target.inflow += t.amount.toNumber()
        target.items.push({
          categoryName: t.category?.name || '未分类',
          amount: t.amount.toNumber(),
          type: 'income',
          direction: 'inflow',
        })
      } else if (t.type === 'expense' && isFromCash) {
        // 支出 + 现金账户 → 现金流出
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
          // 现金 → 非现金：现金流出
          const target = getTargetByType(cashFlowType)
          target.outflow += t.amount.toNumber()
          target.items.push({
            categoryName: t.category?.name || '转账转出',
            amount: t.amount.toNumber(),
            type: 'transfer_out',
            direction: 'outflow',
          })
        } else if (!isFromCash && isToCash) {
          // 非现金 → 现金：现金流入
          const target = getTargetByType(cashFlowType)
          target.inflow += t.amount.toNumber()
          target.items.push({
            categoryName: t.category?.name || '转账转入',
            amount: t.amount.toNumber(),
            type: 'transfer_in',
            direction: 'inflow',
          })
        }
        // 现金 → 现金：不影响现金流，不记录
      }
    })

    const cashInflow = operating.inflow + investing.inflow + financing.inflow + uncategorized.inflow
    const cashOutflow = operating.outflow + investing.outflow + financing.outflow + uncategorized.outflow
    const netCashFlow = cashInflow - cashOutflow

    // 按账户统计现金流
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

    // 计算期初和期末现金
    const startCashBalances = await Promise.all(
      cashAccountIds.map(id => calculateBalanceAtDate(id, start))
    )
    const endCashBalances = await Promise.all(
      cashAccountIds.map(id => calculateBalanceAtDate(id, new Date(end.getTime() + 86400000)))
    )

    const startCash = startCashBalances.reduce((sum, b) => sum + b, 0)
    const endCash = endCashBalances.reduce((sum, b) => sum + b, 0)

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
    })
  } catch (err) {
    return next(err)
  }
})

export default router
