import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error } from '../utils/response.js'
import { calculateBalanceAtDate, getOrCreateAdjustmentCategory } from '../services/balance.service.js'
import { Decimal } from '@prisma/client/runtime/library.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { month } = req.query
    const where = month ? { month: month as string } : {}
    const snapshots = await prisma.balanceSnapshot.findMany({
      where,
      include: { account: true },
      orderBy: { month: 'desc' },
    })
    return success(res, snapshots)
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { month, accountId, balance, isManual = true } = req.body
    if (!month || !accountId || balance === undefined) {
      return error(res, '月份、账户和余额不能为空', 'BAD_REQUEST', 400)
    }
    const snapshot = await prisma.balanceSnapshot.upsert({
      where: { month_accountId: { month, accountId } },
      update: { balance, isManual },
      create: { month, accountId, balance, isManual },
    })
    return success(res, snapshot, 201)
  } catch (err) {
    return next(err)
  }
})

router.post('/batch', async (req, res, next) => {
  try {
    const { month, snapshots } = req.body
    if (!month || !snapshots || !Array.isArray(snapshots) || snapshots.length === 0) {
      return error(res, '月份和快照数据不能为空', 'BAD_REQUEST', 400)
    }

    const results = await prisma.$transaction(
      snapshots.map((snapshot: { accountId: string; balance: number }) =>
        prisma.balanceSnapshot.upsert({
          where: { month_accountId: { month, accountId: snapshot.accountId } },
          update: { balance: snapshot.balance, isManual: true },
          create: { month, accountId: snapshot.accountId, balance: snapshot.balance, isManual: true },
        })
      )
    )

    return success(res, { month, count: results.length, snapshots: results }, 201)
  } catch (err) {
    return next(err)
  }
})

router.post('/adjust', async (req, res, next) => {
  try {
    const { month, adjustments } = req.body
    if (!month || !adjustments || !Array.isArray(adjustments)) {
      return error(res, '月份和矫正数据不能为空', 'BAD_REQUEST', 400)
    }

    const monthStart = new Date(`${month}-01T00:00:00.000Z`)

    const results = []

    for (const adj of adjustments) {
      const { accountId, targetBalance } = adj
      
      const calculatedBalance = await calculateBalanceAtDate(accountId, monthStart)
      
      const difference = targetBalance - calculatedBalance
      
      await prisma.balanceSnapshot.upsert({
        where: { month_accountId: { month, accountId } },
        update: { balance: targetBalance, isManual: true },
        create: { month, accountId, balance: targetBalance, isManual: true },
      })

      if (Math.abs(difference) > 0.01) {
        const account = await prisma.account.findUnique({
          where: { id: accountId },
        })
        
        if (account) {
          const transactionType = difference > 0 ? 'income' : 'expense'
          const categoryId = await getOrCreateAdjustmentCategory(transactionType)
          
          const transaction = await prisma.transaction.create({
            data: {
              type: transactionType,
              amount: Math.abs(difference),
              date: monthStart,
              note: `系统平账记录 - ${month}`,
              accountId,
              categoryId,
              isAdjustment: true,
            },
          })

          const newBalance = account.balance.toNumber() + difference
          await prisma.account.update({
            where: { id: accountId },
            data: { balance: new Decimal(newBalance) },
          })

          results.push({
            accountId,
            accountName: account.name,
            calculatedBalance,
            targetBalance,
            difference,
            transaction: transaction.id,
          })
        }
      } else {
        results.push({
          accountId,
          calculatedBalance,
          targetBalance,
          difference: 0,
          transaction: null,
        })
      }
    }

    return success(res, { month, adjustments: results }, 201)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:month/:accountId', async (req, res, next) => {
  try {
    const { month, accountId } = req.params
    await prisma.balanceSnapshot.delete({
      where: { month_accountId: { month, accountId } },
    })
    return success(res, { message: '删除成功' })
  } catch (err) {
    return next(err)
  }
})

export default router
