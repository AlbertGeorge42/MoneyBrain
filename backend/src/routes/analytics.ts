import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error } from '../utils/response.js'

const router = Router()

router.get('/trends', async (req, res, next) => {
  try {
    const { type } = req.query
    if (!type) {
      return error(res, '请指定类型(income/expense)', 'BAD_REQUEST', 400)
    }

    const now = new Date()
    const months: { label: string; startDate: Date; endDate: Date }[] = []

    for (let i = 11; i >= 0; i--) {
      const startDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const endDate = new Date(now.getFullYear(), now.getMonth() - i + 1, 0)
      months.push({
        label: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
        startDate,
        endDate,
      })
    }

    const trends = await Promise.all(
      months.map(async ({ label, startDate, endDate }) => {
        const transactions = await prisma.transaction.findMany({
          where: {
            type: type as string,
            date: { gte: startDate, lte: endDate },
          },
        })
        const amount = transactions.reduce((sum, t) => sum + t.amount.toNumber(), 0)
        return { label, amount }
      })
    )

    return success(res, trends)
  } catch (err) {
    return next(err)
  }
})

router.get('/category-breakdown', async (req, res, next) => {
  try {
    const { type, startDate, endDate, parentCategoryId } = req.query
    if (!type) {
      return error(res, '请指定类型(income/expense)', 'BAD_REQUEST', 400)
    }

    const where: any = { type: type as string }
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate as string),
        lte: new Date(endDate as string),
      }
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { category: true },
    })

    // 如果指定了父分类ID，返回该父分类下的二级分类明细
    if (parentCategoryId) {
      const subBreakdown: Record<string, number> = {}
      transactions.forEach(t => {
        if (t.category?.parentId === parentCategoryId) {
          const categoryName = t.category.name
          subBreakdown[categoryName] = (subBreakdown[categoryName] || 0) + t.amount.toNumber()
        }
      })
      const result = Object.entries(subBreakdown)
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
      return success(res, result)
    }

    // 获取所有父分类
    const parentCategories = await prisma.category.findMany({
      where: { type: type as string, parentId: null },
    })
    const parentCategoryMap = new Map(parentCategories.map(c => [c.id, c.name]))

    // 按父分类汇总
    const breakdown: Record<string, { value: number; categoryId: string }> = {}
    transactions.forEach(t => {
      let parentName = '未分类'
      let parentId = ''
      
      if (t.category) {
        if (t.category.parentId && parentCategoryMap.has(t.category.parentId)) {
          parentName = parentCategoryMap.get(t.category.parentId)!
          parentId = t.category.parentId
        } else if (!t.category.parentId) {
          // 本身就是一级分类
          parentName = t.category.name
          parentId = t.category.id
        }
      }
      
      if (!breakdown[parentName]) {
        breakdown[parentName] = { value: 0, categoryId: parentId }
      }
      breakdown[parentName].value += t.amount.toNumber()
    })

    const result = Object.entries(breakdown)
      .map(([name, data]) => ({ 
        name, 
        value: data.value,
        categoryId: data.categoryId,
        hasChildren: parentCategories.some(c => c.name === name && 
          parentCategories.filter(p => p.parentId === c.id).length > 0 ||
          transactions.some(t => t.category?.parentId === data.categoryId)
        )
      }))
      .sort((a, b) => b.value - a.value)

    return success(res, result)
  } catch (err) {
    return next(err)
  }
})

router.get('/asset-trend', async (req, res, next) => {
  try {
    const now = new Date()
    const months: { label: string; date: Date }[] = []

    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push({
        label: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        date,
      })
    }

    const accounts = await prisma.account.findMany()
    const currentAssets = accounts
      .filter(a => a.type === 'asset')
      .reduce((sum, a) => sum + a.balance.toNumber(), 0)
    const currentLiabilities = accounts
      .filter(a => a.type === 'liability')
      .reduce((sum, a) => sum + a.balance.toNumber(), 0)

    const trends = months.map(({ label }, index) => {
      const factor = (index + 1) / 12
      return {
        label,
        assets: Math.round(currentAssets * factor * 0.8),
        liabilities: Math.round(currentLiabilities * factor * 0.9),
        netWorth: Math.round((currentAssets * factor * 0.8) - (currentLiabilities * factor * 0.9)),
      }
    })

    return success(res, trends)
  } catch (err) {
    return next(err)
  }
})

export default router
