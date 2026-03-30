import { Router } from 'express'
import { success, error, notFound } from '../utils/response.js'
import { transactionService, createIncomeExpense, createTransfer, createRefund, updateIncomeExpense, updateTransfer, updateRefund } from '../services/transaction.service.js'

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

    const result = await transactionService.getTransactionList({
      page: Number(page),
      pageSize: Number(pageSize),
      accountId: accountId ? (Array.isArray(accountId) ? accountId as string[] : [accountId as string]) : undefined,
      categoryId: categoryId ? (Array.isArray(categoryId) ? categoryId as string[] : [categoryId as string]) : undefined,
      type: type ? (Array.isArray(type) ? type as string[] : [type as string]) : undefined,
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
    })

    return success(res, result)
  } catch (err) {
    return next(err)
  }
})

router.get('/stats', async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query

    const stats = await transactionService.getTransactionStats(
      startDate ? new Date(startDate as string) : undefined,
      endDate ? new Date(endDate as string) : undefined
    )

    return success(res, stats)
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const transaction = await transactionService.getTransactionById(id)
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
    const transactions = await transactionService.getRefundableTransactions()
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

      try {
        const result = await createRefund({
          amount,
          fee,
          coupon,
          date: new Date(date),
          note,
          accountId,
          relatedTransactionId,
        })
        return success(res, result, 201)
      } catch (err) {
        if (err instanceof Error && err.message === '原交易记录不存在') {
          return error(res, err.message, 'BAD_REQUEST', 400)
        }
        throw err
      }
    }

    if (type === 'transfer') {
      if (!accountId || !toAccountId || !amount || !date) {
        return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
      }
      if (accountId === toAccountId) {
        return error(res, '转出账户和转入账户不能相同', 'BAD_REQUEST', 400)
      }

      try {
        const result = await createTransfer({
          amount,
          fee,
          coupon,
          date: new Date(date),
          note,
          accountId,
          toAccountId,
          categoryId,
        })
        return success(res, result, 201)
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === '转出账户不存在' ||
              err.message === '转入账户不存在' ||
              err.message === '转出账户余额不足') {
            return error(res, err.message, 'BAD_REQUEST', 400)
          }
        }
        throw err
      }
    }

    if (!type || !amount || !date || !accountId || !categoryId) {
      return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
    }

    const result = await createIncomeExpense({
      type,
      amount,
      fee,
      coupon,
      date: new Date(date),
      note,
      accountId,
      categoryId,
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

    const oldTransaction = await transactionService.getTransactionById(id)
    if (!oldTransaction) {
      return error(res, '交易记录不存在', 'BAD_REQUEST', 404)
    }

    if (oldTransaction.type === 'transfer') {
      if (type && type !== 'transfer') {
        return error(res, '转账记录不能修改为其他类型', 'BAD_REQUEST', 400)
      }

      const result = await updateTransfer(id, {
        amount,
        fee,
        coupon,
        date: date ? new Date(date) : undefined,
        note,
        accountId,
        toAccountId,
        categoryId,
      })

      return success(res, result)
    }

    if (oldTransaction.type === 'refund') {
      const result = await updateRefund(id, {
        amount,
        fee,
        coupon,
        date: date ? new Date(date) : undefined,
        note,
        accountId,
        categoryId,
        relatedTransactionId,
      })

      return success(res, result)
    }

    const result = await updateIncomeExpense(id, {
      type,
      amount,
      fee,
      coupon,
      date: date ? new Date(date) : undefined,
      note,
      accountId,
      categoryId,
    })

    return success(res, result)
  } catch (err) {
    if (err instanceof Error && err.message === '交易记录不存在') {
      return error(res, err.message, 'BAD_REQUEST', 404)
    }
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params

    try {
      await transactionService.deleteTransaction(id)
      return success(res, { message: '删除成功' })
    } catch (err) {
      if (err instanceof Error && err.message === '交易记录不存在') {
        return notFound(res, '交易记录不存在')
      }
      throw err
    }
  } catch (err) {
    return next(err)
  }
})

export default router
