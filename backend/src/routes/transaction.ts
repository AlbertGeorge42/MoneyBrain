import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'
import { Decimal } from '@prisma/client/runtime/library.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { 
      page = 1, 
      pageSize = 20, 
      accountId, 
      categoryId, 
      type,
      startDate,
      endDate,
    } = req.query

    const where: any = {}
    if (accountId) {
      // 查询该账户作为转出/支出/收入账户或转账目标账户的记录
      where.OR = [
        { accountId },
        { toAccountId: accountId },
      ]
    }
    if (categoryId) where.categoryId = categoryId
    if (type) where.type = type
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate as string)
      if (endDate) where.date.lte = new Date(endDate as string)
    }

    const total = await prisma.transaction.count({ where })
    const transactions = await prisma.transaction.findMany({
      where,
      include: { 
        account: true, 
        category: true,
        toAccount: true,
      },
      orderBy: { date: 'desc' },
      skip: (Number(page) - 1) * Number(pageSize),
      take: Number(pageSize),
    })

    return success(res, {
      list: transactions,
      total,
      page: Number(page),
      pageSize: Number(pageSize),
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/stats', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query
    
    const where: any = { isAdjustment: false }
    if (startDate || endDate) {
      where.date = {}
      if (startDate) where.date.gte = new Date(startDate as string)
      if (endDate) where.date.lte = new Date(endDate as string)
    }

    const transactions = await prisma.transaction.findMany({ where })

    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const expense = transactions
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const transferCount = transactions.filter(t => t.type === 'transfer').length

    return success(res, {
      income,
      expense,
      balance: income - expense,
      transferCount,
    })
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { 
        account: true, 
        category: true,
        toAccount: true,
      },
    })
    if (!transaction) {
      return notFound(res, '交易记录不存在')
    }
    return success(res, transaction)
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { type, amount, date, note, accountId, categoryId, toAccountId } = req.body

    // 转账交易验证
    if (type === 'transfer') {
      if (!accountId || !toAccountId || !amount || !date) {
        return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
      }
      if (accountId === toAccountId) {
        return error(res, '转出账户和转入账户不能相同', 'BAD_REQUEST', 400)
      }

      // 检查转出账户余额
      const fromAccount = await prisma.account.findUnique({
        where: { id: accountId },
      })
      if (!fromAccount) {
        return error(res, '转出账户不存在', 'BAD_REQUEST', 400)
      }
      if (fromAccount.balance.toNumber() < amount) {
        return error(res, '转出账户余额不足', 'BAD_REQUEST', 400)
      }

      // 检查转入账户
      const toAccount = await prisma.account.findUnique({
        where: { id: toAccountId },
      })
      if (!toAccount) {
        return error(res, '转入账户不存在', 'BAD_REQUEST', 400)
      }

      // 执行转账
      const result = await prisma.$transaction(async (tx) => {
        // 扣减转出账户余额
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { decrement: new Decimal(amount) } },
        })

        // 增加转入账户余额
        await tx.account.update({
          where: { id: toAccountId },
          data: { balance: { increment: new Decimal(amount) } },
        })

        // 创建转账记录
        const transaction = await tx.transaction.create({
          data: { 
            type: 'transfer', 
            amount: new Decimal(amount), 
            date: new Date(date), 
            note, 
            accountId,
            toAccountId,
          },
          include: { 
            account: true, 
            toAccount: true,
          },
        })

        return transaction
      })

      return success(res, result, 201)
    }

    // 收支交易
    if (!type || !amount || !date || !accountId || !categoryId) {
      return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
    }

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: { 
          type, 
          amount: new Decimal(amount), 
          date: new Date(date), 
          note, 
          accountId, 
          categoryId,
        },
        include: { account: true, category: true },
      })

      const balanceChange = type === 'income' 
        ? new Decimal(amount) 
        : new Decimal(amount).neg()
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: balanceChange } },
      })

      return transaction
    })

    return success(res, result, 201)
  } catch (err) {
    return next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { type, amount, date, note, accountId, categoryId, toAccountId } = req.body

    const oldTransaction = await prisma.transaction.findUnique({
      where: { id },
    })
    if (!oldTransaction) {
      return error(res, '交易记录不存在', 'BAD_REQUEST', 404)
    }

    // 转账记录不允许修改类型
    if (oldTransaction.type === 'transfer' && type && type !== 'transfer') {
      return error(res, '转账记录不能修改为其他类型', 'BAD_REQUEST', 400)
    }
    if (oldTransaction.type !== 'transfer' && type === 'transfer') {
      return error(res, '收支记录不能修改为转账类型', 'BAD_REQUEST', 400)
    }

    // 转账记录修改
    if (oldTransaction.type === 'transfer') {
      const result = await prisma.$transaction(async (tx) => {
        // 回滚原转账
        await tx.account.update({
          where: { id: oldTransaction.accountId },
          data: { balance: { increment: oldTransaction.amount } },
        })
        await tx.account.update({
          where: { id: oldTransaction.toAccountId! },
          data: { balance: { decrement: oldTransaction.amount } },
        })

        // 更新转账记录
        const transaction = await tx.transaction.update({
          where: { id },
          data: { 
            amount: amount ? new Decimal(amount) : oldTransaction.amount,
            date: date ? new Date(date) : oldTransaction.date,
            note: note !== undefined ? note : oldTransaction.note,
            accountId: accountId || oldTransaction.accountId,
            toAccountId: toAccountId || oldTransaction.toAccountId,
          },
          include: { 
            account: true, 
            toAccount: true,
          },
        })

        // 应用新转账
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: transaction.amount } },
        })
        await tx.account.update({
          where: { id: transaction.toAccountId! },
          data: { balance: { increment: transaction.amount } },
        })

        return transaction
      })

      return success(res, result)
    }

    // 收支记录修改
    const result = await prisma.$transaction(async (tx) => {
      const oldBalanceChange = oldTransaction.type === 'income'
        ? oldTransaction.amount.neg()
        : oldTransaction.amount
      await tx.account.update({
        where: { id: oldTransaction.accountId },
        data: { balance: { increment: oldBalanceChange } },
      })

      const transaction = await tx.transaction.update({
        where: { id },
        data: { 
          type: type || oldTransaction.type,
          amount: amount ? new Decimal(amount) : oldTransaction.amount,
          date: date ? new Date(date) : oldTransaction.date,
          note: note !== undefined ? note : oldTransaction.note,
          accountId: accountId || oldTransaction.accountId,
          categoryId: categoryId || oldTransaction.categoryId,
        },
        include: { account: true, category: true },
      })

      const newBalanceChange = transaction.type === 'income'
        ? transaction.amount
        : transaction.amount.neg()
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { increment: newBalanceChange } },
      })

      return transaction
    })

    return success(res, result)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.findUnique({
        where: { id },
      })
      if (!transaction) {
        throw new Error('交易记录不存在')
      }

      // 转账记录回滚
      if (transaction.type === 'transfer') {
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { increment: transaction.amount } },
        })
        await tx.account.update({
          where: { id: transaction.toAccountId! },
          data: { balance: { decrement: transaction.amount } },
        })
      } else {
        // 收支记录回滚
        const balanceChange = transaction.type === 'income'
          ? transaction.amount.neg()
          : transaction.amount
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { increment: balanceChange } },
        })
      }

      await tx.transaction.delete({ where: { id } })
    })

    return success(res, { message: '删除成功' })
  } catch (err) {
    return next(err)
  }
})

export default router
