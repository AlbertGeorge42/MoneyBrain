import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'
import { Decimal } from '@prisma/client/runtime/library.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const { period } = req.query
    const where: any = {}
    if (period) where.period = period

    const budgets = await prisma.budget.findMany({
      where,
      include: { category: true, alerts: true },
      orderBy: { createdAt: 'desc' },
    })
    return success(res, budgets)
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { category: true, alerts: true },
    })
    if (!budget) {
      return notFound(res, '预算不存在')
    }
    return success(res, budget)
  } catch (err) {
    return next(err)
  }
})

router.get('/:id/status', async (req, res, next) => {
  try {
    const { id } = req.params
    const budget = await prisma.budget.findUnique({
      where: { id },
      include: { category: true },
    })
    if (!budget) {
      return notFound(res, '预算不存在')
    }

    const now = new Date()
    let startDate: Date
    let endDate: Date

    if (budget.period === 'monthly') {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else {
      startDate = new Date(now.getFullYear(), 0, 1)
      endDate = new Date(now.getFullYear(), 11, 31)
    }

    const where: any = {
      type: 'expense',
      date: { gte: startDate, lte: endDate },
    }
    if (budget.categoryId) {
      where.categoryId = budget.categoryId
    }

    const transactions = await prisma.transaction.findMany({ where })
    const used = transactions.reduce((sum, t) => sum + t.amount.toNumber(), 0)
    const amount = budget.amount.toNumber()
    const percentage = Math.min(Math.round((used / amount) * 100), 100)

    return success(res, {
      budget,
      used,
      remaining: Math.max(amount - used, 0),
      percentage,
      isOverBudget: used > amount,
    })
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name, amount, period, startDate, endDate, categoryId } = req.body
    if (!name || !amount || !period) {
      return error(res, '缺少必要参数', 'BAD_REQUEST', 400)
    }
    const budget = await prisma.budget.create({
      data: { 
        name, 
        amount: new Decimal(amount), 
        period, 
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : null,
        categoryId,
      },
      include: { category: true },
    })
    return success(res, budget, 201)
  } catch (err) {
    return next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, amount, period, startDate, endDate, categoryId } = req.body
    const budget = await prisma.budget.update({
      where: { id },
      data: { 
        name, 
        amount: amount ? new Decimal(amount) : undefined,
        period, 
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        categoryId,
      },
      include: { category: true },
    })
    return success(res, budget)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    await prisma.budgetAlert.deleteMany({ where: { budgetId: id } })
    await prisma.budget.delete({ where: { id } })
    return success(res, { message: '删除成功' })
  } catch (err) {
    return next(err)
  }
})

export default router
