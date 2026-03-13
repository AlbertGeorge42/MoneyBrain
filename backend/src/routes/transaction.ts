import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'
import { Decimal } from '@prisma/client/runtime/library.js'
import { 
  calculateBalanceChange, 
  calculateTransferInAmount,
  type TransactionType 
} from '../services/balance.service.js'

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
        relatedTransaction: {
          include: { account: true, category: true }
        },
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
    const refund = transactions
      .filter(t => t.type === 'refund')
      .reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const transferCount = transactions.filter(t => t.type === 'transfer').length

    return success(res, {
      income,
      expense,
      refund,
      balance: income - expense + refund,
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
        relatedTransaction: {
          include: { account: true, category: true }
        },
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

router.get('/refundable/list', async (req, res, next) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        type: { in: ['income', 'expense'] },
      },
      include: { 
        account: true, 
        category: true,
      },
      orderBy: { date: 'desc' },
      take: 100,
    })

    return success(res, transactions)
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, toAccountId, relatedTransactionId } = req.body

    if (type === 'refund') {
      if (!amount || !date || !accountId || !relatedTransactionId) {
        return error(res, '退款交易缺少必要参数', 'BAD_REQUEST', 400)
      }

      const relatedTransaction = await prisma.transaction.findUnique({
        where: { id: relatedTransactionId },
      })
      if (!relatedTransaction) {
        return error(res, '原交易记录不存在', 'BAD_REQUEST', 400)
      }

      const result = await prisma.$transaction(async (tx) => {
        const transaction = await tx.transaction.create({
          data: { 
            type: 'refund', 
            amount: new Decimal(amount), 
            fee: new Decimal(fee),
            coupon: new Decimal(coupon),
            date: new Date(date), 
            note, 
            accountId,
            categoryId: relatedTransaction.categoryId,
            relatedTransactionId,
          },
          include: { 
            account: true, 
            category: true,
            relatedTransaction: {
              include: { account: true, category: true }
            },
          },
        })

        const balanceChange = calculateBalanceChange('refund', amount, fee, coupon)
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: new Decimal(balanceChange) } },
        })

        return transaction
      })

      return success(res, result, 201)
    }

    if (type === 'transfer') {
      if (!accountId || !toAccountId || !amount || !date) {
        return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
      }
      if (accountId === toAccountId) {
        return error(res, '转出账户和转入账户不能相同', 'BAD_REQUEST', 400)
      }

      const fromAccount = await prisma.account.findUnique({
        where: { id: accountId },
      })
      if (!fromAccount) {
        return error(res, '转出账户不存在', 'BAD_REQUEST', 400)
      }
      const totalOut = amount + fee - coupon
      if (fromAccount.balance.toNumber() < totalOut) {
        return error(res, '转出账户余额不足', 'BAD_REQUEST', 400)
      }

      const toAccount = await prisma.account.findUnique({
        where: { id: toAccountId },
      })
      if (!toAccount) {
        return error(res, '转入账户不存在', 'BAD_REQUEST', 400)
      }

      const result = await prisma.$transaction(async (tx) => {
        const outAmount = calculateBalanceChange('transfer', amount, fee, coupon)
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: new Decimal(outAmount) } },
        })

        const inAmount = calculateTransferInAmount(amount, fee, coupon)
        await tx.account.update({
          where: { id: toAccountId },
          data: { balance: { increment: new Decimal(inAmount) } },
        })

        const transaction = await tx.transaction.create({
          data: { 
            type: 'transfer', 
            amount: new Decimal(amount), 
            fee: new Decimal(fee),
            coupon: new Decimal(coupon),
            date: new Date(date), 
            note, 
            accountId,
            toAccountId,
            categoryId,
          },
          include: { 
            account: true, 
            toAccount: true,
            category: true,
          },
        })

        return transaction
      })

      return success(res, result, 201)
    }

    if (!type || !amount || !date || !accountId || !categoryId) {
      return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
    }

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: { 
          type, 
          amount: new Decimal(amount), 
          fee: new Decimal(fee),
          coupon: new Decimal(coupon),
          date: new Date(date), 
          note, 
          accountId, 
          categoryId,
        },
        include: { account: true, category: true },
      })

      const balanceChange = calculateBalanceChange(type as TransactionType, amount, fee, coupon)
      await tx.account.update({
        where: { id: accountId },
        data: { balance: { increment: new Decimal(balanceChange) } },
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
    const { type, amount, fee = 0, coupon = 0, date, note, accountId, categoryId, toAccountId, relatedTransactionId } = req.body

    const oldTransaction = await prisma.transaction.findUnique({
      where: { id },
    })
    if (!oldTransaction) {
      return error(res, '交易记录不存在', 'BAD_REQUEST', 404)
    }

    const oldFee = oldTransaction.fee?.toNumber() || 0
    const oldCoupon = oldTransaction.coupon?.toNumber() || 0

    if (oldTransaction.type === 'transfer') {
      if (type && type !== 'transfer') {
        return error(res, '转账记录不能修改为其他类型', 'BAD_REQUEST', 400)
      }

      const result = await prisma.$transaction(async (tx) => {
        const oldOutAmount = calculateBalanceChange('transfer', oldTransaction.amount.toNumber(), oldFee, oldCoupon)
        await tx.account.update({
          where: { id: oldTransaction.accountId },
          data: { balance: { decrement: new Decimal(Math.abs(oldOutAmount)) } },
        })
        const oldInAmount = calculateTransferInAmount(oldTransaction.amount.toNumber(), oldFee, oldCoupon)
        await tx.account.update({
          where: { id: oldTransaction.toAccountId! },
          data: { balance: { decrement: new Decimal(oldInAmount) } },
        })

        const newAmount = amount !== undefined ? amount : oldTransaction.amount.toNumber()
        const newFee = fee !== undefined ? fee : oldFee
        const newCoupon = coupon !== undefined ? coupon : oldCoupon
        const newAccountId = accountId || oldTransaction.accountId
        const newToAccountId = toAccountId || oldTransaction.toAccountId!

        const transaction = await tx.transaction.update({
          where: { id },
          data: { 
            amount: new Decimal(newAmount),
            fee: new Decimal(newFee),
            coupon: new Decimal(newCoupon),
            date: date ? new Date(date) : oldTransaction.date,
            note: note !== undefined ? note : oldTransaction.note,
            accountId: newAccountId,
            toAccountId: newToAccountId,
            categoryId: categoryId !== undefined ? categoryId : oldTransaction.categoryId,
          },
          include: { 
            account: true, 
            toAccount: true,
            category: true,
          },
        })

        const newOutAmount = calculateBalanceChange('transfer', newAmount, newFee, newCoupon)
        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { increment: new Decimal(newOutAmount) } },
        })
        const newInAmount = calculateTransferInAmount(newAmount, newFee, newCoupon)
        await tx.account.update({
          where: { id: newToAccountId },
          data: { balance: { increment: new Decimal(newInAmount) } },
        })

        return transaction
      })

      return success(res, result)
    }

    if (oldTransaction.type === 'refund') {
      const result = await prisma.$transaction(async (tx) => {
        const oldBalanceChange = calculateBalanceChange('refund', oldTransaction.amount.toNumber(), oldFee, oldCoupon)
        await tx.account.update({
          where: { id: oldTransaction.accountId },
          data: { balance: { decrement: new Decimal(Math.abs(oldBalanceChange)) } },
        })

        const newAmount = amount !== undefined ? amount : oldTransaction.amount.toNumber()
        const newFee = fee !== undefined ? fee : oldFee
        const newCoupon = coupon !== undefined ? coupon : oldCoupon
        const newAccountId = accountId || oldTransaction.accountId

        const transaction = await tx.transaction.update({
          where: { id },
          data: { 
            amount: new Decimal(newAmount),
            fee: new Decimal(newFee),
            coupon: new Decimal(newCoupon),
            date: date ? new Date(date) : oldTransaction.date,
            note: note !== undefined ? note : oldTransaction.note,
            accountId: newAccountId,
            categoryId: categoryId !== undefined ? categoryId : oldTransaction.categoryId,
            relatedTransactionId: relatedTransactionId !== undefined ? relatedTransactionId : oldTransaction.relatedTransactionId,
          },
          include: { 
            account: true, 
            category: true,
            relatedTransaction: true,
          },
        })

        const newBalanceChange = calculateBalanceChange('refund', newAmount, newFee, newCoupon)
        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { increment: new Decimal(newBalanceChange) } },
        })

        return transaction
      })

      return success(res, result)
    }

    const result = await prisma.$transaction(async (tx) => {
      const oldBalanceChange = calculateBalanceChange(oldTransaction.type as TransactionType, oldTransaction.amount.toNumber(), oldFee, oldCoupon)
      await tx.account.update({
        where: { id: oldTransaction.accountId },
        data: { balance: { decrement: new Decimal(Math.abs(oldBalanceChange)) } },
      })

      const newType = type || oldTransaction.type
      const newAmount = amount !== undefined ? amount : oldTransaction.amount.toNumber()
      const newFee = fee !== undefined ? fee : oldFee
      const newCoupon = coupon !== undefined ? coupon : oldCoupon
      const newAccountId = accountId || oldTransaction.accountId

      const transaction = await tx.transaction.update({
        where: { id },
        data: { 
          type: newType,
          amount: new Decimal(newAmount),
          fee: new Decimal(newFee),
          coupon: new Decimal(newCoupon),
          date: date ? new Date(date) : oldTransaction.date,
          note: note !== undefined ? note : oldTransaction.note,
          accountId: newAccountId,
          categoryId: categoryId || oldTransaction.categoryId,
        },
        include: { account: true, category: true },
      })

      const newBalanceChange = calculateBalanceChange(newType as TransactionType, newAmount, newFee, newCoupon)
      await tx.account.update({
        where: { id: newAccountId },
        data: { balance: { increment: new Decimal(newBalanceChange) } },
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

      const fee = transaction.fee?.toNumber() || 0
      const coupon = transaction.coupon?.toNumber() || 0

      const balanceChange = calculateBalanceChange(
        transaction.type as TransactionType, 
        transaction.amount.toNumber(), 
        fee, 
        coupon
      )
      
      if (transaction.type === 'transfer') {
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: new Decimal(Math.abs(balanceChange)) } },
        })
        const inAmount = calculateTransferInAmount(transaction.amount.toNumber(), fee, coupon)
        await tx.account.update({
          where: { id: transaction.toAccountId! },
          data: { balance: { decrement: new Decimal(inAmount) } },
        })
      } else {
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: new Decimal(Math.abs(balanceChange)) } },
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
