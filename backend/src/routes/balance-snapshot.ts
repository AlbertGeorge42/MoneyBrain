import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error } from '../utils/response.js'

const router = Router()

// 获取或创建平账分类
async function getOrCreateAdjustmentCategory(type: 'income' | 'expense'): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { name: '平账调整', type },
  })
  if (existing) return existing.id

  const category = await prisma.category.create({
    data: {
      name: '平账调整',
      type,
      icon: '⚙️',
    },
  })
  return category.id
}

// 计算某个日期的账户余额
async function calculateBalanceAtDate(accountId: string, targetDate: Date): Promise<number> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  })
  if (!account) return 0

  const laterTransactions = await prisma.transaction.findMany({
    where: {
      accountId,
      date: { gte: targetDate },
    },
  })

  let balance = account.balance.toNumber()
  laterTransactions.forEach(t => {
    if (t.type === 'income') {
      balance -= t.amount.toNumber()
    } else {
      balance += t.amount.toNumber()
    }
  })

  return balance
}

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

// 批量创建或更新余额快照
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

// 平账接口：矫正余额并自动生成平账记录
router.post('/adjust', async (req, res, next) => {
  try {
    const { month, adjustments } = req.body
    if (!month || !adjustments || !Array.isArray(adjustments)) {
      return error(res, '月份和矫正数据不能为空', 'BAD_REQUEST', 400)
    }

    // 计算月初日期
    const monthStart = new Date(`${month}-01T00:00:00.000Z`)

    const results = []

    for (const adj of adjustments) {
      const { accountId, targetBalance } = adj
      
      // 计算当前月初余额
      const calculatedBalance = await calculateBalanceAtDate(accountId, monthStart)
      
      // 计算差额
      const difference = targetBalance - calculatedBalance
      
      // 保存快照
      await prisma.balanceSnapshot.upsert({
        where: { month_accountId: { month, accountId } },
        update: { balance: targetBalance, isManual: true },
        create: { month, accountId, balance: targetBalance, isManual: true },
      })

      // 如果有差额，生成平账记录
      if (Math.abs(difference) > 0.01) {
        const account = await prisma.account.findUnique({
          where: { id: accountId },
        })
        
        if (account) {
          const transactionType = difference > 0 ? 'income' : 'expense'
          const categoryId = await getOrCreateAdjustmentCategory(transactionType)
          
          // 创建平账记录
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

          // 更新账户余额
          const newBalance = account.balance.toNumber() + difference
          await prisma.account.update({
            where: { id: accountId },
            data: { balance: newBalance },
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
