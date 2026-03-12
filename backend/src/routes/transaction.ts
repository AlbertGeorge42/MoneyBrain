import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'
import { Decimal } from '@prisma/client/runtime/library.js'

const router = Router()

// 计算实际余额变化（考虑手续费和优惠券）
function calculateBalanceChange(type: string, amount: number, fee: number = 0, coupon: number = 0): number {
  switch (type) {
    case 'income':
      // 收入：余额 += 金额 - 手续费 + 优惠券
      return amount - fee + coupon
    case 'expense':
      // 支出：余额 -= 金额 + 手续费 - 优惠券
      return -(amount + fee - coupon)
    case 'transfer':
      // 转账转出：余额 -= 金额 + 手续费 - 优惠券
      return -(amount + fee - coupon)
    case 'refund':
      // 退款：余额 += 金额 - 手续费
      return amount - fee
    default:
      return 0
  }
}

// 计算转账转入金额
function calculateTransferInAmount(amount: number, fee: number = 0, coupon: number = 0): number {
  // 转入账户余额 += 金额 - 手续费 + 优惠券（转账转入时，优惠券增加余额）
  return amount - fee + coupon
}

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

// 获取可退款的交易列表
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

    // 退款交易
    if (type === 'refund') {
      if (!amount || !date || !accountId || !relatedTransactionId) {
        return error(res, '退款交易缺少必要参数', 'BAD_REQUEST', 400)
      }

      // 验证原交易存在
      const relatedTransaction = await prisma.transaction.findUnique({
        where: { id: relatedTransactionId },
      })
      if (!relatedTransaction) {
        return error(res, '原交易记录不存在', 'BAD_REQUEST', 400)
      }

      const result = await prisma.$transaction(async (tx) => {
        // 创建退款记录
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

        // 更新账户余额（退款增加余额）
        const balanceChange = calculateBalanceChange('refund', amount, fee, coupon)
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: new Decimal(balanceChange) } },
        })

        return transaction
      })

      return success(res, result, 201)
    }

    // 转账交易
    if (type === 'transfer') {
      if (!accountId || !toAccountId || !amount || !date) {
        return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
      }
      if (accountId === toAccountId) {
        return error(res, '转出账户和转入账户不能相同', 'BAD_REQUEST', 400)
      }

      // 检查转出账户余额（考虑手续费）
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

      // 检查转入账户
      const toAccount = await prisma.account.findUnique({
        where: { id: toAccountId },
      })
      if (!toAccount) {
        return error(res, '转入账户不存在', 'BAD_REQUEST', 400)
      }

      // 执行转账
      const result = await prisma.$transaction(async (tx) => {
        // 扣减转出账户余额（金额 + 手续费 - 优惠券）
        const outAmount = calculateBalanceChange('transfer', amount, fee, coupon)
        await tx.account.update({
          where: { id: accountId },
          data: { balance: { increment: new Decimal(outAmount) } },
        })

        // 增加转入账户余额（仅金额）
        const inAmount = calculateTransferInAmount(amount, fee)
        await tx.account.update({
          where: { id: toAccountId },
          data: { balance: { increment: new Decimal(inAmount) } },
        })

        // 创建转账记录
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

    // 收支交易
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

      // 更新账户余额
      const balanceChange = calculateBalanceChange(type, amount, fee, coupon)
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

    // 转账记录修改
    if (oldTransaction.type === 'transfer') {
      if (type && type !== 'transfer') {
        return error(res, '转账记录不能修改为其他类型', 'BAD_REQUEST', 400)
      }

      const result = await prisma.$transaction(async (tx) => {
        // 回滚原转账
        const oldOutAmount = calculateBalanceChange('transfer', oldTransaction.amount.toNumber(), oldFee, oldCoupon)
        await tx.account.update({
          where: { id: oldTransaction.accountId },
          data: { balance: { decrement: new Decimal(oldOutAmount) } },
        })
        const oldInAmount = calculateTransferInAmount(oldTransaction.amount.toNumber(), oldFee)
        await tx.account.update({
          where: { id: oldTransaction.toAccountId! },
          data: { balance: { decrement: new Decimal(oldInAmount) } },
        })

        // 更新转账记录
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

        // 应用新转账
        const newOutAmount = calculateBalanceChange('transfer', newAmount, newFee, newCoupon)
        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { increment: new Decimal(newOutAmount) } },
        })
        const newInAmount = calculateTransferInAmount(newAmount, newFee)
        await tx.account.update({
          where: { id: newToAccountId },
          data: { balance: { increment: new Decimal(newInAmount) } },
        })

        return transaction
      })

      return success(res, result)
    }

    // 退款记录修改
    if (oldTransaction.type === 'refund') {
      const result = await prisma.$transaction(async (tx) => {
        // 回滚原退款
        const oldBalanceChange = calculateBalanceChange('refund', oldTransaction.amount.toNumber(), oldFee, oldCoupon)
        await tx.account.update({
          where: { id: oldTransaction.accountId },
          data: { balance: { decrement: new Decimal(oldBalanceChange) } },
        })

        // 更新退款记录
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

        // 应用新退款
        const newBalanceChange = calculateBalanceChange('refund', newAmount, newFee, newCoupon)
        await tx.account.update({
          where: { id: newAccountId },
          data: { balance: { increment: new Decimal(newBalanceChange) } },
        })

        return transaction
      })

      return success(res, result)
    }

    // 收支记录修改
    const result = await prisma.$transaction(async (tx) => {
      // 回滚原交易
      const oldBalanceChange = calculateBalanceChange(oldTransaction.type, oldTransaction.amount.toNumber(), oldFee, oldCoupon)
      await tx.account.update({
        where: { id: oldTransaction.accountId },
        data: { balance: { decrement: new Decimal(oldBalanceChange) } },
      })

      // 更新交易记录
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

      // 应用新交易
      const newBalanceChange = calculateBalanceChange(newType, newAmount, newFee, newCoupon)
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

      // 回滚余额变化
      const balanceChange = calculateBalanceChange(
        transaction.type, 
        transaction.amount.toNumber(), 
        fee, 
        coupon
      )
      
      if (transaction.type === 'transfer') {
        // 转账：回滚转出和转入
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: new Decimal(balanceChange) } },
        })
        const inAmount = calculateTransferInAmount(transaction.amount.toNumber(), fee)
        await tx.account.update({
          where: { id: transaction.toAccountId! },
          data: { balance: { decrement: new Decimal(inAmount) } },
        })
      } else {
        // 其他类型：回滚余额变化
        await tx.account.update({
          where: { id: transaction.accountId },
          data: { balance: { decrement: new Decimal(balanceChange) } },
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
