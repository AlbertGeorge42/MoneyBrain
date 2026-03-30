import { Router } from 'express'
import { prisma } from '../index.js'
import { success, error, notFound } from '../utils/response.js'
import { buildTree } from '../utils/tree.js'

const router = Router()

router.get('/', async (_req, res, next) => {
  try {
    const categories = await prisma.transactionCategory.findMany({
      orderBy: [{ type: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
    })
    return success(res, categories)
  } catch (err) {
    return next(err)
  }
})

router.get('/tree', async (_req, res, next) => {
  try {
    const categories = await prisma.transactionCategory.findMany({
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
    const category = await prisma.transactionCategory.findUnique({
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

router.get('/:id/stats', async (req, res, next) => {
  try {
    const { id } = req.params
    const [transactionCount, childrenCount] = await Promise.all([
      prisma.transaction.count({ where: { categoryId: id } }),
      prisma.transactionCategory.count({ where: { parentId: id } }),
    ])
    return success(res, { transactionCount, childrenCount })
  } catch (err) {
    return next(err)
  }
})

router.post('/', async (req, res, next) => {
  try {
    const { name, type, icon, parentId, cashFlowType, sort } = req.body
    if (!name || !type) {
      return error(res, '名称和类型不能为空', 'BAD_REQUEST', 400)
    }
    const category = await prisma.transactionCategory.create({
      data: { name, type, icon, parentId, cashFlowType, sort: sort || 0 },
    })
    return success(res, category, 201)
  } catch (err) {
    return next(err)
  }
})

router.put('/sort/batch', async (req, res, next) => {
  try {
    const { items } = req.body
    if (!Array.isArray(items)) {
      return error(res, '参数格式错误', 'BAD_REQUEST', 400)
    }

    await prisma.$transaction(
      items.map(item => 
        prisma.transactionCategory.update({
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
    const { name, type, icon, parentId, cashFlowType, sort } = req.body
    if (parentId === id) {
      return error(res, '父分类不能是自己', 'BAD_REQUEST', 400)
    }
    const category = await prisma.transactionCategory.update({
      where: { id },
      data: { name, type, icon, parentId, cashFlowType, sort },
    })
    return success(res, category)
  } catch (err) {
    return next(err)
  }
})

router.put('/:id/move', async (req, res, next) => {
  try {
    const { id } = req.params
    const { newParentId } = req.body

    const category = await prisma.transactionCategory.findUnique({
      where: { id },
      include: { children: true },
    })
    if (!category) {
      return notFound(res, '分类不存在')
    }

    if (newParentId === id) {
      return error(res, '不能移动到自己', 'BAD_REQUEST', 400)
    }

    if (newParentId) {
      const isChild = await checkIsChildCategory(id, newParentId)
      if (isChild) {
        return error(res, '不能移动到自己的子分类下', 'BAD_REQUEST', 400)
      }

      const newParent = await prisma.transactionCategory.findUnique({
        where: { id: newParentId },
      })
      if (!newParent) {
        return error(res, '目标父分类不存在', 'BAD_REQUEST', 400)
      }
      if (newParent.type !== category.type) {
        return error(res, '目标父分类类型不匹配', 'BAD_REQUEST', 400)
      }
    }

    const siblings = await prisma.transactionCategory.findMany({
      where: { parentId: newParentId || null, type: category.type },
      orderBy: { sort: 'desc' },
      take: 1,
    })
    const newSort = siblings.length > 0 ? siblings[0].sort + 1 : 0

    const updatedCategory = await prisma.transactionCategory.update({
      where: { id },
      data: { parentId: newParentId || null, sort: newSort },
    })

    return success(res, { 
      message: '移动成功', 
      movedCategory: updatedCategory,
    })
  } catch (err) {
    return next(err)
  }
})

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { transferToCategoryId, deleteTransactions } = req.query

    const category = await prisma.transactionCategory.findUnique({
      where: { id },
      include: { children: true },
    })
    if (!category) {
      return notFound(res, '分类不存在')
    }

    if (category.children.length > 0) {
      return error(res, '该分类下存在子分类，无法删除', 'BAD_REQUEST', 400)
    }

    const transactionsCount = await prisma.transaction.count({
      where: { categoryId: id },
    })

    if (transactionsCount === 0) {
      await prisma.transactionCategory.delete({ where: { id } })
      return success(res, { message: '删除成功', deletedCategory: category.name })
    }

    if (deleteTransactions === 'true') {
      const result = await prisma.$transaction(async (tx) => {
        const deleted = await tx.transaction.deleteMany({
          where: { categoryId: id },
        })
        await tx.transactionCategory.delete({ where: { id } })
        return deleted.count
      })

      return success(res, { 
        message: '删除成功', 
        deletedCategory: category.name,
        deletedTransactions: result,
      })
    }

    if (transferToCategoryId && typeof transferToCategoryId === 'string') {
      if (transferToCategoryId === id) {
        return error(res, '不能转移到自己', 'BAD_REQUEST', 400)
      }

      const targetCategory = await prisma.transactionCategory.findUnique({
        where: { id: transferToCategoryId },
      })
      if (!targetCategory) {
        return error(res, '目标分类不存在', 'BAD_REQUEST', 400)
      }
      if (targetCategory.type !== category.type) {
        return error(res, '目标分类类型不匹配', 'BAD_REQUEST', 400)
      }

      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.transaction.updateMany({
          where: { categoryId: id },
          data: { categoryId: transferToCategoryId },
        })
        await tx.transactionCategory.delete({ where: { id } })
        return updated.count
      })

      return success(res, { 
        message: '删除成功', 
        deletedCategory: category.name,
        transferredTransactions: result,
      })
    }

    return error(res, '该分类下存在交易记录，请选择转移或删除交易', 'BAD_REQUEST', 400)
  } catch (err) {
    return next(err)
  }
})

async function checkIsChildCategory(parentId: string, targetId: string): Promise<boolean> {
  const target = await prisma.transactionCategory.findUnique({
    where: { id: targetId },
    select: { parentId: true },
  })
  if (!target || !target.parentId) {
    return false
  }
  if (target.parentId === parentId) {
    return true
  }
  return checkIsChildCategory(parentId, target.parentId)
}

export default router
