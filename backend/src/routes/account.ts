import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    })
    return success(res, accounts)
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const account = await prisma.account.findUnique({
      where: { id },
      include: { 
        category: true,
        fromTransactions: {
          take: 10,
          orderBy: { date: 'desc' },
          include: { category: true },
        },
      },
    })
    if (!account) {
      return notFound(res, '账户不存在')
    }
    return success(res, account)
  } catch (err) {
    return next(err)
  }
})

// 获取账户统计信息
router.get('/:id/stats', async (req, res, next) => {
  try {
    const { id } = req.params
    const account = await prisma.account.findUnique({
      where: { id },
    })
    if (!account) {
      return notFound(res, '账户不存在')
    }

    const transactions = await prisma.transaction.findMany({
      where: { accountId: id },
    })

    const transactionCount = transactions.length
    const totalIncome = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const totalExpense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)

    return success(res, {
      transactionCount,
      totalIncome,
      totalExpense,
    })
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name, type, balance, icon, categoryId, initialBalance, initialBalanceDate } = req.body
    if (!name || !type) {
      return error(res, '名称和类型不能为空', 'BAD_REQUEST', 400)
    }
    const account = await prisma.account.create({
      data: { 
        name, 
        type, 
        balance: balance || initialBalance || 0, 
        initialBalance: initialBalance || balance || 0,
        initialBalanceDate: initialBalanceDate ? new Date(initialBalanceDate) : new Date(),
        icon,
        categoryId,
      },
      include: { category: true },
    })
    return success(res, account, 201)
  } catch (err) {
    return next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, type, icon, categoryId, cashFlowType, initialBalance, initialBalanceDate } = req.body
    const account = await prisma.account.update({
      where: { id },
      data: { 
        name, 
        type, 
        icon, 
        categoryId, 
        initialBalance,
        initialBalanceDate: initialBalanceDate ? new Date(initialBalanceDate) : undefined,
      },
      include: { category: true },
    })
    return success(res, account)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { force } = req.query

    const transactionsCount = await prisma.transaction.count({
      where: { accountId: id },
    })

    // 如果没有 force 参数且有交易记录，返回错误
    if (force !== 'true' && transactionsCount > 0) {
      return error(res, `该账户下存在 ${transactionsCount} 条交易记录，无法删除`, 'BAD_REQUEST', 400)
    }

    // 使用事务删除账户及关联数据
    await prisma.$transaction([
      prisma.transaction.deleteMany({ where: { accountId: id } }),
      prisma.balanceSnapshot.deleteMany({ where: { accountId: id } }),
      prisma.account.delete({ where: { id } }),
    ])

    return success(res, { 
      message: '删除成功',
      deletedTransactions: transactionsCount,
    })
  } catch (err) {
    return next(err)
  }
})

export default router
