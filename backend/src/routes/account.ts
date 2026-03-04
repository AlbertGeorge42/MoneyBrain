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
        transactions: {
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

router.post('/', async (req, res, next) => {
  try {
    const { name, type, balance, icon, categoryId } = req.body
    if (!name || !type) {
      return error(res, '名称和类型不能为空', 'BAD_REQUEST', 400)
    }
    const account = await prisma.account.create({
      data: { 
        name, 
        type, 
        balance: balance || 0, 
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
    const { name, type, icon, categoryId } = req.body
    const account = await prisma.account.update({
      where: { id },
      data: { name, type, icon, categoryId },
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
    const transactionsCount = await prisma.transaction.count({
      where: { accountId: id },
    })
    if (transactionsCount > 0) {
      return error(res, '该账户下存在交易记录，无法删除', 'BAD_REQUEST', 400)
    }
    await prisma.account.delete({ where: { id } })
    return success(res, { message: '删除成功' })
  } catch (err) {
    return next(err)
  }
})

export default router
