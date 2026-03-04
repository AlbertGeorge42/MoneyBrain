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
    if (accountId) where.accountId = accountId
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
      include: { account: true, category: true },
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

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: { account: true, category: true },
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
    const { type, amount, date, note, accountId, categoryId } = req.body
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
    const { type, amount, date, note, accountId, categoryId } = req.body

    const result = await prisma.$transaction(async (tx) => {
      const oldTransaction = await tx.transaction.findUnique({
        where: { id },
      })
      if (!oldTransaction) {
        throw new Error('交易记录不存在')
      }

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

      const balanceChange = transaction.type === 'income'
        ? transaction.amount.neg()
        : transaction.amount
      await tx.account.update({
        where: { id: transaction.accountId },
        data: { balance: { increment: balanceChange } },
      })

      await tx.transaction.delete({ where: { id } })
    })

    return success(res, { message: '删除成功' })
  } catch (err) {
    return next(err)
  }
})

export default router
