import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'
import { getAccountStats, adjustAccountBalance, batchAdjustAccountBalances } from '../services/account.service.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const accounts = await prisma.account.findMany({
      include: { category: true },
      orderBy: [{ sort: 'asc' }, { createdAt: 'desc' }],
    })
    return success(res, accounts)
  } catch (err) {
    return next(err)
  }
})

// 批量更新账户排序（必须在 /:id 之前）
router.put('/sort/batch', async (req, res, next) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items)) {
      return error(res, '参数格式错误', 'BAD_REQUEST', 400)
    }

    await prisma.$transaction(
      items.map(item => 
        prisma.account.update({
          where: { id: item.id },
          data: { sort: item.sort, categoryId: item.categoryId },
        })
      )
    )

    return success(res, { message: '排序更新成功' })
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
    const account = await prisma.account.findUnique({ where: { id } })
    if (!account) {
      return notFound(res, '账户不存在')
    }
    const stats = await getAccountStats(id)
    return success(res, stats)
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
    
    // 允许用户输入任意正负数，不再自动转换
    const actualBalance = balance ?? initialBalance ?? 0
    const actualInitialBalance = initialBalance ?? balance ?? 0
    
    const account = await prisma.account.create({
      data: { 
        name, 
        type, 
        balance: actualBalance, 
        initialBalance: actualInitialBalance,
        initialBalanceDate: initialBalanceDate ? new Date(`${initialBalanceDate}T00:00:00`) : new Date(),
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
    
    // 获取当前账户信息
    const currentAccount = await prisma.account.findUnique({
      where: { id },
    })
    if (!currentAccount) {
      return notFound(res, '账户不存在')
    }
    
    // 构建更新数据
    const updateData: any = { 
      name, 
      icon, 
      cashFlowType,
      initialBalanceDate: initialBalanceDate ? new Date(`${initialBalanceDate}T00:00:00`) : undefined,
    }
    
    // 如果类型发生变化，自动更新分类
    if (type && type !== currentAccount.type) {
      updateData.type = type
      
      // 如果没有指定分类，获取默认分类
      if (!categoryId) {
        const defaultCategory = await prisma.accountCategory.findFirst({
          where: { type, parentId: null }
        })
        if (defaultCategory) {
          updateData.categoryId = defaultCategory.id
        }
      } else {
        updateData.categoryId = categoryId
      }
    } else {
      updateData.type = type
      updateData.categoryId = categoryId
    }
    
    // 如果更新了初始余额，允许任意正负数
    if (initialBalance !== undefined) {
      updateData.initialBalance = initialBalance
      updateData.balance = initialBalance
    }
    
    const account = await prisma.account.update({
      where: { id },
      data: updateData,
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

// 平账接口
router.post('/:id/adjust', async (req, res, next) => {
  try {
    const { id } = req.params
    const { amount, date, note } = req.body

    if (amount === undefined || amount === null) {
      return error(res, '调整金额不能为空', 'BAD_REQUEST', 400)
    }

    const result = await adjustAccountBalance(id, amount, date, note)
    return success(res, result, 201)
  } catch (err) {
    return next(err)
  }
})

// 批量平账接口
router.post('/batch-adjust', async (req, res, next) => {
  try {
    const { adjustments, date, note } = req.body

    if (!Array.isArray(adjustments) || adjustments.length === 0) {
      return error(res, '调整数据不能为空', 'BAD_REQUEST', 400)
    }

    const result = await batchAdjustAccountBalances(adjustments, date, note)
    return success(res, result, 201)
  } catch (err) {
    return next(err)
  }
})

export default router
