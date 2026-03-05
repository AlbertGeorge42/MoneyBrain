import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'
import { buildTree } from '../utils/tree.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.accountCategory.findMany({
      orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    })
    return success(res, categories)
  } catch (err) {
    return next(err)
  }
})

router.get('/tree', async (_req, res, next) => {
  try {
    const categories = await prisma.accountCategory.findMany({
      orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    })
    const tree = buildTree(categories)
    return success(res, tree)
  } catch (err) {
    return next(err)
  }
})

router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const category = await prisma.accountCategory.findUnique({
      where: { id },
      include: { parent: true, children: true, accounts: true },
    })
    if (!category) {
      return notFound(res, '账户分类不存在')
    }
    return success(res, category)
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name, type, icon, parentId, isCashEquivalent, sort } = req.body
    if (!name || !type) {
      return error(res, '名称和类型不能为空', 'BAD_REQUEST', 400)
    }
    if (parentId) {
      const parent = await prisma.accountCategory.findUnique({
        where: { id: parentId },
      })
      if (!parent) {
        return error(res, '父分类不存在', 'BAD_REQUEST', 400)
      }
      if (parent.type !== type) {
        return error(res, '父分类类型必须相同', 'BAD_REQUEST', 400)
      }
    }
    const category = await prisma.accountCategory.create({
      data: { name, type, icon, parentId, isCashEquivalent: isCashEquivalent ?? false, sort: sort || 0 },
    })
    return success(res, category, 201)
  } catch (err) {
    return next(err)
  }
})

// 批量更新排序
router.put('/sort/batch', async (req, res, next) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items)) {
      return error(res, '参数格式错误', 'BAD_REQUEST', 400)
    }

    await prisma.$transaction(
      items.map(item => 
        prisma.accountCategory.update({
          where: { id: item.id },
          data: { sort: item.sort, parentId: item.parentId },
        })
      )
    )

    return success(res, { message: '排序更新成功' })
  } catch (err) {
    return next(err)
  }
})

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { name, type, icon, parentId, isCashEquivalent, sort } = req.body
    if (parentId === id) {
      return error(res, '父分类不能是自己', 'BAD_REQUEST', 400)
    }
    if (parentId) {
      const parent = await prisma.accountCategory.findUnique({
        where: { id: parentId },
      })
      if (!parent) {
        return error(res, '父分类不存在', 'BAD_REQUEST', 400)
      }
      const currentType = type || (await prisma.accountCategory.findUnique({ where: { id } }))?.type
      if (parent.type !== currentType) {
        return error(res, '父分类类型必须相同', 'BAD_REQUEST', 400)
      }
    }
    const category = await prisma.accountCategory.update({
      where: { id },
      data: { name, type, icon, parentId, isCashEquivalent, sort },
    })
    return success(res, category)
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const childrenCount = await prisma.accountCategory.count({
      where: { parentId: id },
    })
    if (childrenCount > 0) {
      return error(res, '该分类下存在子分类，无法删除', 'BAD_REQUEST', 400)
    }
    const accountsCount = await prisma.account.count({
      where: { categoryId: id },
    })
    if (accountsCount > 0) {
      return error(res, '该分类下存在账户，无法删除', 'BAD_REQUEST', 400)
    }
    await prisma.accountCategory.delete({ where: { id } })
    return success(res, { message: '删除成功' })
  } catch (err) {
    return next(err)
  }
})

export default router
