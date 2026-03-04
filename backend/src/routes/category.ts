import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    })
    return success(res, categories)
  } catch (err) {
    return next(err)
  }
})

router.get('/tree', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
    })
    const buildTree = (items: typeof categories, parentId: string | null = null): any[] => {
      return items
        .filter(item => item.parentId === parentId)
        .map(item => ({
          ...item,
          children: buildTree(items, item.id),
        }))
    }
    const tree = buildTree(categories)
    return success(res, tree)
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const category = await prisma.category.findUnique({
      where: { id },
      include: { parent: true, children: true },
    })
    if (!category) {
      return notFound(res, '分类不存在')
    }
    return success(res, category)
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name, type, icon, parentId, cashFlowType } = req.body
    if (!name || !type) {
      return error(res, '名称和类型不能为空', 'BAD_REQUEST', 400)
    }
    const category = await prisma.category.create({
      data: { name, type, icon, parentId, cashFlowType },
    })
    return success(res, category, 201)
  } catch (err) {
    return next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, type, icon, parentId, cashFlowType } = req.body
    if (parentId === id) {
      return error(res, '父分类不能是自己', 'BAD_REQUEST', 400)
    }
    const category = await prisma.category.update({
      where: { id },
      data: { name, type, icon, parentId, cashFlowType },
    })
    return success(res, category)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const childrenCount = await prisma.category.count({
      where: { parentId: id },
    })
    if (childrenCount > 0) {
      return error(res, '该分类下存在子分类，无法删除', 'BAD_REQUEST', 400)
    }
    const transactionsCount = await prisma.transaction.count({
      where: { categoryId: id },
    })
    if (transactionsCount > 0) {
      return error(res, '该分类下存在交易记录，无法删除', 'BAD_REQUEST', 400)
    }
    await prisma.category.delete({ where: { id } })
    return success(res, { message: '删除成功' })
  } catch (err) {
    return next(err)
  }
})

export default router
